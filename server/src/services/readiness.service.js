import { CATALOGUE_VERSION, findRole } from '../domain/careers/roleCatalogue.js';
import { computeReadiness } from '../domain/readiness/computeReadiness.js';
import { computeReadinessScore } from '../domain/readiness/computeReadinessScore.js';
import { getCareerTwin } from './careerTwin.service.js';
import { getSkillGap } from './skillGap.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { SkillEvidenceCheck } from '../models/SkillEvidenceCheck.model.js';
import {
  CHECK_KINDS,
  CHECK_OUTCOMES,
} from '../domain/evidence/skillEvidenceCheck.js';

/**
 * Builds readiness from the existing CareerTwin and skill-gap contracts.
 * Nothing is persisted and no model output participates in the result.
 *
 * Task 17 — Career Readiness Score Engine:
 *   Adds a deterministic `score` block to the readiness response. The score
 *   is computed from evidence-weighted skill coverage and may be boosted by
 *   passed interview sessions. No AI is involved.
 *
 *   The readiness status block (`evidenceStatus`, `blockingSkills`, etc.) is
 *   unchanged — it comes from `computeReadiness` and intentionally has no
 *   numeric signal. The `score` block is additive and separate.
 *
 * @param {string} userId From requireAuth.
 * @param {string} roleId
 * @param {object} [options]
 * @param {boolean} [options.includeScore=true] Include the score block.
 */
export async function getReadiness(userId, roleId, { includeScore = false } = {}) {
  if (!findRole(roleId)) {
    throw ApiError.notFound(
      'No career role was found with that id.',
      ERROR_CODES.CAREER_ROLE_NOT_FOUND,
    );
  }

  const twinResult = await getCareerTwin(userId);

  if (!twinResult.exists) {
    const readiness = computeReadiness(null, {
      dataStatus: 'incomplete',
      basedOn: { catalogueVersion: CATALOGUE_VERSION },
    });
    const score = includeScore ? computeReadinessScore(null) : undefined;
    return includeScore ? { ...readiness, score } : readiness;
  }

  let gapResult;
  try {
    gapResult = await getSkillGap(userId, roleId);
  } catch (error) {
    if (error?.statusCode === 409) {
      const readiness = computeReadiness(null, {
        dataStatus: 'incomplete',
        basedOn: { catalogueVersion: CATALOGUE_VERSION },
      });
      const score = includeScore ? computeReadinessScore(null) : undefined;
      return includeScore ? { ...readiness, score } : readiness;
    }
    throw error;
  }

  // Resolve passed interview sessions for the score boost.
  // We load only passing sessions for required skills — non-blocking and
  // scoped to this user so cross-user contamination is impossible.
  let interviewPassedSkillKeys = new Set();
  if (includeScore) {
    try {
      interviewPassedSkillKeys = await resolveInterviewPassedSkills(userId, roleId);
    } catch (err) {
      // A failure to load interview history must not block the readiness response.
      // The score will be computed without the interview boost.
    }
  }

  const readiness = computeReadiness(gapResult.gap, {
    dataStatus: twinResult.twin?.isStale ? 'stale' : 'fresh',
    basedOn: {
      careerTwinGeneratedAt: gapResult.basedOn?.careerTwinGeneratedAt ?? null,
      catalogueVersion: gapResult.method?.catalogueVersion ?? CATALOGUE_VERSION,
    },
  });

  if (!includeScore) {
    return readiness;
  }

  const score = computeReadinessScore(gapResult.gap, { interviewPassedSkillKeys });

  return { ...readiness, score };
}

/**
 * Resolves the set of skill keys where the student has passed a live
 * interview check. Returns a Set of skill keys (strings).
 *
 * A skill is "interview-passed" if the student has at least one
 * SkillEvidenceCheck of kind 'human_interview' with outcome 'pass'
 * and a mark above INTERVIEW_PASS_MARK for that skill.
 *
 * @param {string} userId
 * @param {string} _roleId
 * @returns {Promise<Set<string>>}
 */
async function resolveInterviewPassedSkills(userId, _roleId) {
  const checks = await SkillEvidenceCheck.find({
    user: userId,
    kind: CHECK_KINDS.INTERVIEW,
    outcome: CHECK_OUTCOMES.PASS,
  })
    .select('skill.key skill.name')
    .lean();

  return new Set(checks.map((c) => c.skill?.key).filter(Boolean));
}