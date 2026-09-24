import { SkillEvidenceCheck, toPublicSkillEvidenceCheck } from '../models/SkillEvidenceCheck.model.js';
import {
  buildAssessmentResult,
  buildInterviewResult,
} from '../domain/evidence/skillEvidenceCheck.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export async function recordAssessment(userId, input) {
  return saveCheck(userId, buildAssessmentResult(input));
}

export async function recordInterview(userId, input) {
  return saveCheck(userId, buildInterviewResult(input));
}

export async function listEvidenceChecks(userId) {
  const checks = await SkillEvidenceCheck.find({ user: userId }).sort({ completedAt: -1 });
  return checks.map(toPublicSkillEvidenceCheck);
}

export async function loadVerifiedEvidence(userId) {
  const checks = await SkillEvidenceCheck.find({ user: userId, eligibleForVerified: true }).sort({
    completedAt: -1,
  });

  return checks.map((check) => ({
    skill: check.skillName,
    completedAt: check.completedAt,
    evidence: {
      source: check.kind,
      strength: 'verified',
      detail: `${check.kind === 'assessment' ? 'Passed assessment' : 'Passed interview'} for ${check.skillName} with score ${check.score}.`,
      reference: check.reference,
    },
    completedAt: check.completedAt,
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
