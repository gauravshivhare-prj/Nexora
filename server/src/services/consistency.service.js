import {
  CareerTwin,
  Resume,
  SkillEvidenceCheck,
  StudentProfile,
  User,
} from '../models/index.js';
import { assembleCanonicalStudentState } from '../domain/student/canonicalStudent.js';
import {
  RECONCILIATION_ACTIONS,
  checkConsistency,
} from '../domain/student/consistencyChecker.js';
import { CAREER_ROLES, findRole } from '../domain/careers/roleCatalogue.js';
import { computeSkillGap } from '../domain/skillGap/computeSkillGap.js';
import { computeReadiness } from '../domain/readiness/computeReadiness.js';
import { rankRoles } from '../domain/careers/matchRole.js';
import { rebuildCareerTwin } from './careerTwin.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * Task 30 — Cross-Feature Consistency & Reconciliation Service
 *
 * Gathers authoritative student data, builds cross-feature artifacts,
 * and executes deterministic consistency checks to detect discrepancies
 * across CareerTwin, SkillGap, Readiness, Evidence, and Recommendations.
 *
 * @param {string} userId
 * @param {object} [options]
 * @param {boolean} [options.autoReconcile=false] Automatically triggers rebuild if inconsistencies are detected.
 * @returns {Promise<object>} Consistency report
 */
export async function getStudentConsistencyReport(userId, { autoReconcile = false } = {}) {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found.', ERROR_CODES.USER_NOT_FOUND);
  }

  const [profile, resumes, evidenceChecks, twinDoc] = await Promise.all([
    StudentProfile.findOne({ user: userId }),
    Resume.find({ user: userId }),
    SkillEvidenceCheck.find({ user: userId }),
    CareerTwin.findOne({ user: userId }),
  ]);

  const rawChecks = evidenceChecks.map((doc) => (doc.toObject ? doc.toObject() : doc));
  const canonicalStudent = assembleCanonicalStudentState({
    user,
    profile,
    resumes,
    evidenceChecks: rawChecks,
  });

  const twin = twinDoc ? (twinDoc.toObject ? twinDoc.toObject() : twinDoc) : null;

  // Resolve target roles to evaluate
  const targetRolesToCheck = [];
  if (profile?.career?.targetRole) {
    const role =
      findRole(profile.career.targetRole) ||
      CAREER_ROLES.find((r) => r.title.toLowerCase() === profile.career.targetRole.toLowerCase());
    if (role) targetRolesToCheck.push(role);
  }
  if (twin?.targetRoles?.length) {
    for (const tr of twin.targetRoles) {
      const role =
        findRole(tr.title) ||
        CAREER_ROLES.find((r) => r.title.toLowerCase() === tr.title.toLowerCase());
      if (role && !targetRolesToCheck.some((r) => r.id === role.id)) {
        targetRolesToCheck.push(role);
      }
    }
  }
  if (targetRolesToCheck.length === 0 && CAREER_ROLES.length > 0) {
    targetRolesToCheck.push(CAREER_ROLES[0]);
  }

  // Derive downstream intelligence for target roles
  const gaps = [];
  const readinessList = [];
  let recommendations = null;

  if (twin) {
    for (const role of targetRolesToCheck) {
      const gap = computeSkillGap(twin, role);
      gaps.push(gap);
      readinessList.push(computeReadiness(gap));
    }
    const ranked = rankRoles(twin, { limit: 5 });
    recommendations = ranked.matches;
  }

  let report = checkConsistency({
    canonicalStudent,
    twin,
    gaps,
    readinessList,
    recommendations,
    evidenceChecks: rawChecks,
  });

  // Self-healing: if autoReconcile is requested and twin rebuild is actionable
  let selfHealed = false;
  if (
    autoReconcile &&
    report.reconciliationActions.some((a) => a.action === RECONCILIATION_ACTIONS.REBUILD_TWIN)
  ) {
    try {
      await rebuildCareerTwin(userId);
      const updatedTwinDoc = await CareerTwin.findOne({ user: userId });
      const updatedTwin = updatedTwinDoc ? (updatedTwinDoc.toObject ? updatedTwinDoc.toObject() : updatedTwinDoc) : null;

      const updatedGaps = [];
      const updatedReadiness = [];
      let updatedRecs = null;

      if (updatedTwin) {
        for (const role of targetRolesToCheck) {
          const gap = computeSkillGap(updatedTwin, role);
          updatedGaps.push(gap);
          updatedReadiness.push(computeReadiness(gap));
        }
        updatedRecs = rankRoles(updatedTwin, { limit: 5 }).matches;
      }

      report = checkConsistency({
        canonicalStudent,
        twin: updatedTwin,
        gaps: updatedGaps,
        readinessList: updatedReadiness,
        recommendations: updatedRecs,
        evidenceChecks: rawChecks,
      });
      selfHealed = true;
    } catch (err) {
      report.reconciliationError = err.message;
    }
  }

  return {
    userId: String(userId),
    ...report,
    selfHealed,
  };
}
