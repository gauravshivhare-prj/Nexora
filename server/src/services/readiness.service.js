import { CATALOGUE_VERSION, findRole } from '../domain/careers/roleCatalogue.js';
import { computeReadiness } from '../domain/readiness/computeReadiness.js';
import { computeReadinessScore } from '../domain/readiness/computeReadinessScore.js';
import { getCareerTwin } from './careerTwin.service.js';
import { getSkillGap } from './skillGap.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { SkillEvidenceCheck } from '../models/SkillEvidenceCheck.model.js';
import {
  ReadinessSnapshot,
  toPublicReadinessSnapshot,
} from '../models/ReadinessSnapshot.model.js';
import { logger } from '../utils/logger.js';
import {
  CHECK_KINDS,
  CHECK_OUTCOMES,
} from '../domain/evidence/skillEvidenceCheck.js';

/**
 * Builds readiness from the existing CareerTwin and skill-gap contracts.
 * Nothing is persisted unless includeScore=true and recordSnapshot=true.
 *
 * Task 17 & Task 23 — Career Readiness Score Engine & History:
 *   Adds a deterministic `score` block to the readiness response. The score
 *   is computed from evidence-weighted skill coverage and may be boosted by
 *   passed interview sessions. No AI is involved.
 *
 *   When `includeScore` is true, a historical snapshot is automatically
 *   recorded in ReadinessSnapshot to allow students to track progress over time.
 *
 * @param {string} userId From requireAuth.
 * @param {string} roleId
 * @param {object} [options]
 * @param {boolean} [options.includeScore=false] Include the score block.
 * @param {boolean} [options.recordSnapshot=true] Record snapshot if score included.
 */
export async function getReadiness(
  userId,
  roleId,
  { includeScore = false, recordSnapshot = true } = {},
) {
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
    const result = includeScore ? { ...readiness, score } : readiness;
    if (includeScore && recordSnapshot) {
      await recordReadinessSnapshot(userId, roleId, result, null);
    }
    return result;
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
      const result = includeScore ? { ...readiness, score } : readiness;
      if (includeScore && recordSnapshot) {
        await recordReadinessSnapshot(userId, roleId, result, null);
      }
      return result;
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
  const result = { ...readiness, score };

  if (recordSnapshot) {
    await recordReadinessSnapshot(userId, roleId, result, gapResult?.gap);
  }

  return result;
}

/**
 * Persists a historical snapshot of readiness when a score is evaluated.
 * Deduplicates multiple requests within a 5-minute window if score and status are identical.
 *
 * @param {string} userId
 * @param {string} roleId
 * @param {object} readinessWithScore
 * @param {object|null} gap
 * @returns {Promise<object|null>}
 */
export async function recordReadinessSnapshot(userId, roleId, readinessWithScore, gap = null) {
  if (!readinessWithScore?.score) return null;

  try {
    const scoreObj = readinessWithScore.score;
    const scoreVal = typeof scoreObj.score === 'number'
      ? scoreObj.score
      : (typeof scoreObj.value === 'number' ? scoreObj.value : 0);

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const recent = await ReadinessSnapshot.findOne({
      user: userId,
      roleId,
      createdAt: { $gte: fiveMinutesAgo },
    }).sort({ createdAt: -1 });

    if (
      recent &&
      recent.score === scoreVal &&
      recent.evidenceStatus === readinessWithScore.evidenceStatus
    ) {
      return recent;
    }

    const skillStates = [];
    if (gap && Array.isArray(gap.skills)) {
      for (const s of gap.skills) {
        skillStates.push({
          skillKey: s.key || s.canonicalSkillId || s.name?.toLowerCase(),
          name: s.name,
          tier: s.importance === 'required' ? 'required' : 'preferred',
          status: s.status || 'missing',
        });
      }
    } else if (Array.isArray(readinessWithScore.blockingSkills)) {
      for (const s of readinessWithScore.blockingSkills) {
        skillStates.push({
          skillKey: s.key || s.name?.toLowerCase(),
          name: s.name,
          tier: 'required',
          status: s.status || 'missing',
        });
      }
    }

    const requiredScore = scoreObj.breakdown?.required?.contribution ?? scoreObj.breakdown?.requiredScore ?? 0;
    const preferredScore = scoreObj.breakdown?.preferred?.contribution ?? scoreObj.breakdown?.preferredScore ?? 0;
    const interviewBoostApplied = Boolean(
      scoreObj.breakdown?.interviewBoostApplied ?? scoreObj.interviewBoostApplied,
    );

    const snapshot = await ReadinessSnapshot.create({
      user: userId,
      roleId,
      score: scoreVal,
      evidenceStatus: readinessWithScore.evidenceStatus,
      band: scoreObj.band || 'beginning',
      confidence: scoreObj.confidence || 'low',
      requiredScore,
      preferredScore,
      blockingSkillsCount: readinessWithScore.blockingSkills?.length ?? 0,
      interviewBoostApplied,
      skillStates,
      createdAt: new Date(),
    });

    return snapshot;
  } catch (err) {
    logger.warn(`Failed to record readiness snapshot for user ${userId}, role ${roleId}: ${err.message}`);
    return null;
  }
}

/**
 * Retrieves the historical sequence of readiness snapshots for a user and role.
 *
 * @param {string} userId
 * @param {string} roleId
 * @param {object} [options]
 * @param {number} [options.limit=20]
 * @returns {Promise<Array<object>>}
 */
export async function getReadinessHistory(userId, roleId, { limit = 20 } = {}) {
  if (!findRole(roleId)) {
    throw ApiError.notFound(
      'No career role was found with that id.',
      ERROR_CODES.CAREER_ROLE_NOT_FOUND,
    );
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const snapshots = await ReadinessSnapshot.find({
    user: userId,
    roleId,
  })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();

  return snapshots.map(toPublicReadinessSnapshot);
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