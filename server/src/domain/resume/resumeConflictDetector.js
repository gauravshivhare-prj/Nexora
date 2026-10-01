/**
 * Resume Conflict & Contradiction Detection Engine (Task 05)
 *
 * Detects internal inconsistencies within a parsed resume as well as
 * contradictions between resume-extracted facts and the student's profile.
 */

import { isBlank } from '../../utils/fieldTypes.js';

export const CONFLICT_SEVERITY = Object.freeze({
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
});

export const CONFLICT_TYPES = Object.freeze({
  TIMELINE_INVERSION: 'timeline_inversion',
  FUTURE_DATE: 'future_date',
  PROFILE_MISMATCH: 'profile_mismatch',
  DEGREE_MISMATCH: 'degree_mismatch',
  UNREALISTIC_VALUE: 'unrealistic_value',
});

/**
 * Detects contradictions within parsed resume data and against an optional student profile.
 *
 * @param {object} parsedResume - Grounded and validated parsed resume structure
 * @param {object} [studentProfile] - Optional student profile document/DTO
 * @returns {Array<object>} List of detected conflicts
 */
export function detectResumeConflicts(parsedResume, studentProfile = null) {
  if (!parsedResume || typeof parsedResume !== 'object') return [];

  const conflicts = [];
  const currentYear = new Date().getFullYear();

  // 1. Internal Education Timeline Inversions
  if (Array.isArray(parsedResume.education)) {
    for (const [idx, edu] of parsedResume.education.entries()) {
      if (typeof edu.startYear === 'number' && typeof edu.endYear === 'number') {
        if (edu.endYear < edu.startYear) {
          conflicts.push({
            type: CONFLICT_TYPES.TIMELINE_INVERSION,
            severity: CONFLICT_SEVERITY.ERROR,
            field: `education[${idx}]`,
            message: `Education end year (${edu.endYear}) is earlier than start year (${edu.startYear}) for "${edu.institution || 'Institution'}".`,
            resumeValue: { startYear: edu.startYear, endYear: edu.endYear },
          });
        }
      }

      if (typeof edu.startYear === 'number' && edu.startYear > currentYear + 1) {
        conflicts.push({
          type: CONFLICT_TYPES.FUTURE_DATE,
          severity: CONFLICT_SEVERITY.WARNING,
          field: `education[${idx}].startYear`,
          message: `Education start year (${edu.startYear}) is unexpectedly in the future.`,
          resumeValue: edu.startYear,
        });
      }
    }
  }

  // 2. Internal Experience Date Inversions (if numeric years can be deduced)
  if (Array.isArray(parsedResume.experience)) {
    for (const [idx, exp] of parsedResume.experience.entries()) {
      const startYear = extractYear(exp.startDate);
      const endYear = extractYear(exp.endDate);
      if (startYear && endYear && endYear < startYear) {
        conflicts.push({
          type: CONFLICT_TYPES.TIMELINE_INVERSION,
          severity: CONFLICT_SEVERITY.ERROR,
          field: `experience[${idx}]`,
          message: `Experience end year (${endYear}) is earlier than start year (${startYear}) for "${exp.organisation || 'Organisation'}".`,
          resumeValue: { startDate: exp.startDate, endDate: exp.endDate },
        });
      }
    }
  }

  // 3. Profile vs Resume Divergence Checks (if studentProfile provided)
  if (studentProfile && typeof studentProfile === 'object') {
    // Check graduation year divergence
    if (studentProfile.academic?.graduationYear && Array.isArray(parsedResume.education)) {
      const profileGradYear = studentProfile.academic.graduationYear;
      const latestResumeEdu = parsedResume.education.find((e) => typeof e.endYear === 'number');
      if (latestResumeEdu && latestResumeEdu.endYear !== profileGradYear) {
        conflicts.push({
          type: CONFLICT_TYPES.PROFILE_MISMATCH,
          severity: CONFLICT_SEVERITY.WARNING,
          field: 'academic.graduationYear',
          message: `Profile states graduation year as ${profileGradYear}, but resume indicates ${latestResumeEdu.endYear}.`,
          resumeValue: latestResumeEdu.endYear,
          profileValue: profileGradYear,
        });
      }
    }

    // Check college / institution divergence
    if (studentProfile.academic?.college && Array.isArray(parsedResume.education)) {
      const profileCollege = studentProfile.academic.college.trim().toLowerCase();
      const hasMatchingInst = parsedResume.education.some((e) =>
        e.institution && e.institution.toLowerCase().includes(profileCollege)
      );
      if (!hasMatchingInst && parsedResume.education.length > 0) {
        conflicts.push({
          type: CONFLICT_TYPES.PROFILE_MISMATCH,
          severity: CONFLICT_SEVERITY.INFO,
          field: 'academic.college',
          message: `Profile institution "${studentProfile.academic.college}" was not matched in resume education entries.`,
          resumeValue: parsedResume.education.map((e) => e.institution).filter(Boolean),
          profileValue: studentProfile.academic.college,
        });
      }
    }
  }

  return conflicts;
}

function extractYear(dateString) {
  if (isBlank(dateString)) return null;
  const match = String(dateString).match(/\b(19\d\d|20\d\d)\b/);
  return match ? parseInt(match[1], 10) : null;
}
