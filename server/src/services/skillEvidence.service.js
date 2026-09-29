import { SkillEvidenceCheck, toPublicSkillEvidenceCheck } from '../models/SkillEvidenceCheck.model.js';
import {
  CHECK_KINDS,
  CHECK_OUTCOMES,
  INTERVIEW_PASS_MARK,
  SkillEvidenceInputError,
  buildAssessmentResult,
  buildInterviewResult,
} from '../domain/evidence/skillEvidenceCheck.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export async function recordAssessment(userId, input) {
  try {
    return await saveCheck(userId, buildAssessmentResult(input));
  } catch (error) {
    if (error instanceof SkillEvidenceInputError) {
      throw ApiError.badRequest(error.message, ERROR_CODES.VALIDATION_ERROR);
    }
    throw error;
  }
}

export async function recordInterview(userId, input) {
  try {
    return await saveCheck(userId, buildInterviewResult(input));
  } catch (error) {
    if (error instanceof SkillEvidenceInputError) {
      throw ApiError.badRequest(error.message, ERROR_CODES.VALIDATION_ERROR);
    }
    throw error;
  }
}

export async function listEvidenceChecks(userId) {
  const checks = await SkillEvidenceCheck.find({ user: userId }).sort({ completedAt: -1 });
  return checks.map(toPublicSkillEvidenceCheck);
}

export async function loadVerifiedEvidence(userId) {
  const checks = await SkillEvidenceCheck.find({
    user: userId,
    eligibleForVerified: true,
    evaluatedBy: { $ne: 'ai' },
    outcome: CHECK_OUTCOMES.PASS,
  }).sort({
    completedAt: -1,
  });

  // Defense-in-depth: enforce institutional evidence policy.
  // AI-evaluated interviews are strictly advisory and NEVER qualify as verified.
  // Only human-evaluated interviews with score >= passMark and passing assessments qualify.
  const verifiedChecks = checks.filter((check) => {
    if (check.kind === CHECK_KINDS.INTERVIEW) {
      return (
        check.evaluatedBy === 'human' &&
        check.outcome === CHECK_OUTCOMES.PASS &&
        typeof check.score === 'number' &&
        typeof check.passMark === 'number' &&
        check.score >= check.passMark &&
        check.passMark >= INTERVIEW_PASS_MARK
      );
    }
    if (check.kind === CHECK_KINDS.ASSESSMENT) {
      return (
        check.outcome === CHECK_OUTCOMES.PASS &&
        typeof check.score === 'number' &&
        typeof check.passMark === 'number' &&
        check.score >= check.passMark
      );
    }
    return false;
  });

  return verifiedChecks.map((check) => ({
    skill: check.skillName,
    completedAt: check.completedAt,
    evidence: {
      source: check.kind,
      strength: 'verified',
      detail: `${check.kind === CHECK_KINDS.ASSESSMENT ? 'Passed assessment' : 'Passed interview'} for ${check.skillName} with score ${check.score}.`,
      reference: check.reference,
    },
  }));
}

async function saveCheck(userId, result) {
  try {
    const check = await SkillEvidenceCheck.create({
      user: userId,
      kind: result.kind,
      skillKey: result.skillKey,
      skillName: result.skillName,
      score: result.score,
      passMark: result.passMark,
      outcome: result.outcome,
      eligibleForVerified: result.eligibleForVerified,
      evaluatedBy: result.evaluatedBy,
      reference: result.reference,
      completedAt: result.completedAt,
    });

    return toPublicSkillEvidenceCheck(check);
  } catch (error) {
    if (error?.name === 'ValidationError') {
      throw ApiError.badRequest(error.message, ERROR_CODES.VALIDATION_ERROR);
    }
    throw error;
  }
}
