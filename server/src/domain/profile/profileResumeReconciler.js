/**
 * Profile & Resume Reconciliation & Precedence Engine (Task 06)
 *
 * Implements deterministic conflict detection across profile and resume artifacts,
 * enforces provenance precedence rules, and guards against unauthorized AI-driven
 * mutations of student-entered facts.
 */

import { PROVENANCE_TIER } from '../student/canonicalStudent.js';

export const RECONCILIATION_STATUS = Object.freeze({
  CLEAN: 'clean',
  CONFLICTS_DETECTED: 'conflicts_detected',
  REVIEW_REQUIRED: 'review_required',
});

export const PRECEDENCE_POLICY = Object.freeze({
  PERSONAL_DETAILS: PROVENANCE_TIER.USER_ENTERED, // User-entered profile is strictly authoritative
  CAREER_GOALS: PROVENANCE_TIER.USER_ENTERED,     // User's declared career interests supersede inference
  SKILL_PROFICIENCY: PROVENANCE_TIER.EXTERNALLY_VERIFIED, // Verified/proctored evidence supersedes claims
  RESUME_IMPORT: PROVENANCE_TIER.IMPORTED,         // Resume facts require explicit confirmation before profile update
});

/**
 * Reconciles student profile against a parsed resume to detect discrepancies.
 *
 * @param {object} profile - Canonical StudentProfile model or DTO
 * @param {object} resume - Resume model or DTO with parsed data
 * @returns {object} Reconciliation report
 */
export function reconcileProfileWithResume(profile, resume) {
  if (!profile || typeof profile !== 'object') {
    return {
      reconciliationStatus: RECONCILIATION_STATUS.CLEAN,
      requiresConfirmation: false,
      conflicts: [],
      suggestedSyncItems: [],
    };
  }

  const conflicts = [];
  const suggestedSyncItems = [];
  const parsed = resume?.parsed;

  if (!parsed || typeof parsed !== 'object') {
    return {
      reconciliationStatus: RECONCILIATION_STATUS.CLEAN,
      requiresConfirmation: false,
      conflicts: [],
      suggestedSyncItems: [],
    };
  }

  // 1. Academic Graduation Year Check
  if (profile.academic?.graduationYear && Array.isArray(parsed.education)) {
    const profileGradYear = Number(profile.academic.graduationYear);
    const resumeEdu = parsed.education.find((e) => typeof e.endYear === 'number');
    if (resumeEdu && Number(resumeEdu.endYear) !== profileGradYear) {
      conflicts.push({
        field: 'academic.graduationYear',
        profileValue: profileGradYear,
        resumeValue: Number(resumeEdu.endYear),
        severity: 'warning',
        precedence: 'profile_preferred',
        requiresConfirmation: true,
        reason: `Profile records graduation in ${profileGradYear}, whereas resume states ${resumeEdu.endYear}.`,
        recommendedAction: 'Verify your expected graduation year before applying to opportunities.',
      });
    }
  }

  // 2. Institution / College Name Check
  if (profile.academic?.collegeName && Array.isArray(parsed.education)) {
    const profileCollege = String(profile.academic.collegeName).trim().toLowerCase();
    const resumeEdu = parsed.education.find((e) => e.institution);
    if (resumeEdu && resumeEdu.institution) {
      const resumeCollege = String(resumeEdu.institution).trim().toLowerCase();
      const STOP_WORDS = new Set([
        'institute', 'technology', 'university', 'college', 'school', 'of', 'and', 'the', 'for', 'in', 'national', 'indian'
      ]);

      const profileTokens = new Set(
        profileCollege.split(/\s+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
      );
      const resumeTokens = resumeCollege.split(/\s+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t));
      const overlap = resumeTokens.filter((t) => profileTokens.has(t));

      if (overlap.length === 0 && profileCollege !== resumeCollege) {
        conflicts.push({
          field: 'academic.collegeName',
          profileValue: profile.academic.collegeName,
          resumeValue: resumeEdu.institution,
          severity: 'warning',
          precedence: 'profile_preferred',
          requiresConfirmation: true,
          reason: `College in profile ("${profile.academic.collegeName}") differs from resume ("${resumeEdu.institution}").`,
          recommendedAction: 'Ensure both profile and resume reference your active degree-granting institution.',
        });
      }
    }
  }

  // 3. Degree Discrepancy Check
  if (profile.academic?.degree && Array.isArray(parsed.education)) {
    const profileDegree = String(profile.academic.degree).trim().toLowerCase();
    const resumeEdu = parsed.education.find((e) => e.degree);
    if (resumeEdu && resumeEdu.degree) {
      const resumeDegree = String(resumeEdu.degree).trim().toLowerCase();
      if (profileDegree !== resumeDegree && !profileDegree.includes(resumeDegree) && !resumeDegree.includes(profileDegree)) {
        conflicts.push({
          field: 'academic.degree',
          profileValue: profile.academic.degree,
          resumeValue: resumeEdu.degree,
          severity: 'info',
          precedence: 'profile_preferred',
          requiresConfirmation: true,
          reason: `Declared degree "${profile.academic.degree}" does not match resume degree "${resumeEdu.degree}".`,
          recommendedAction: 'Confirm the degree program you are currently enrolled in.',
        });
      }
    }
  }

  // 4. Skills Synchronization Opportunities & Discrepancies
  if (Array.isArray(parsed.skills)) {
    const profileSkillMap = new Map(
      (profile.skills || []).map((s) => [s.name.toLowerCase(), s]),
    );

    for (const resumeSkill of parsed.skills) {
      if (!resumeSkill?.name) continue;
      const key = resumeSkill.name.toLowerCase();
      if (!profileSkillMap.has(key)) {
        // Resume has a skill not in the profile: suggest sync, but do NOT automatically inject
        suggestedSyncItems.push({
          type: 'skill_missing_in_profile',
          name: resumeSkill.name,
          source: 'resume_parsed',
          requiresConfirmation: true,
          action: 'add_to_profile',
        });
      }
    }
  }

  const hasErrors = conflicts.some((c) => c.severity === 'error');
  const hasWarnings = conflicts.some((c) => c.severity === 'warning');

  let reconciliationStatus = RECONCILIATION_STATUS.CLEAN;
  if (hasErrors || hasWarnings) {
    reconciliationStatus = RECONCILIATION_STATUS.CONFLICTS_DETECTED;
  } else if (suggestedSyncItems.length > 0) {
    reconciliationStatus = RECONCILIATION_STATUS.REVIEW_REQUIRED;
  }

  return {
    reconciliationStatus,
    requiresConfirmation: conflicts.some((c) => c.requiresConfirmation),
    conflicts,
    suggestedSyncItems,
    lastReconciledAt: new Date(),
  };
}

/**
 * Validates whether an incoming mutation adheres to AI boundary constraints.
 * Protects user-entered facts from being overwritten by AI inferences without confirmation.
 *
 * @param {string} sourceProvenance - Provenance tier of the update
 * @param {object} existingProfile - Current state of profile
 * @param {object} proposedChanges - Proposed updates
 * @throws {Error} if an unverified AI source attempts to overwrite user-entered data
 */
export function assertAiMutationBoundary(sourceProvenance, existingProfile, proposedChanges) {
  // If update originates from AI / unverified source, block direct writes to user-entered fields
  if (
    sourceProvenance === PROVENANCE_TIER.AI_EXTRACTED ||
    sourceProvenance === 'ai_hint' ||
    sourceProvenance === 'unverified_ai'
  ) {
    const prohibitedPaths = [
      'personal.phone',
      'personal.dateOfBirth',
      'personal.gender',
      'academic.collegeName',
      'academic.degree',
      'academic.graduationYear',
      'academic.cgpa',
      'career.targetRole',
    ];

    for (const path of prohibitedPaths) {
      if (proposedChanges[path] !== undefined) {
        throw new Error(
          `AI mutation rejected: AI hints cannot overwrite user-entered field "${path}" without explicit student confirmation.`,
        );
      }
    }
  }
}
