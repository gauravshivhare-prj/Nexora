import { SkillEvidenceCheck, toPublicSkillEvidenceCheck } from '../models/SkillEvidenceCheck.model.js';
import {
  CHECK_KINDS,
  CHECK_OUTCOMES,
  INTERVIEW_PASS_MARK,
  SkillEvidenceInputError,
  buildAssessmentResult,
  buildInterviewResult,
} from '../domain/evidence/skillEvidenceCheck.js';
import {
  EVIDENCE_STATUS,
  validateEvidenceIntake,
  recomputeStudentEvidenceLedger,
  recomputeSkillEvidenceState,
  EvidenceEngineError,
} from '../domain/evidence/evidenceEngine.js';
import { resolveCanonicalSkill } from '../domain/skills/skillOntology.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * Records an assessment result.
 */
export async function recordAssessment(userId, input) {
  try {
    const canonical = resolveCanonicalSkill(input.skill);
    const intake = validateEvidenceIntake({
      skill: input.skill,
      source: 'assessment',
      score: input.score,
      passMark: input.passMark,
      evaluatedBy: input.evaluatedBy || 'assessment-engine',
      reference: input.assessmentId || input.reference,
      detail: input.detail,
      isPractice: Boolean(input.isPractice),
      metadata: { difficulty: input.difficulty, ...(input.metadata || {}) },
      completedAt: input.completedAt,
    });

    const check = await SkillEvidenceCheck.create({
      user: userId,
      kind: CHECK_KINDS.ASSESSMENT,
      canonicalSkillId: canonical?.id || null,
      skillKey: intake.skillKey,
      skillName: intake.skillName,
      score: intake.score,
      passMark: intake.passMark,
      outcome: intake.outcome,
      strength: intake.strength,
      status: intake.status,
      confidence: intake.confidence,
      eligibleForVerified: intake.eligibleForVerified,
      isAdvisory: intake.isAdvisory,
      isStale: intake.isStale,
      evaluatedBy: intake.evaluatedBy,
      reference: intake.reference,
      detail: intake.detail,
      expiresAt: intake.expiresAt,
      metadata: intake.metadata,
      completedAt: intake.completedAt,
      auditTrail: [
        {
          action: 'ASSESSMENT_RECORDED',
          performedBy: intake.evaluatedBy,
          timestamp: new Date(),
          details: `Assessment completed with score ${intake.score} (passMark ${intake.passMark})`,
        },
      ],
    });

    return toPublicSkillEvidenceCheck(check);
  } catch (error) {
    if (error instanceof SkillEvidenceInputError || error instanceof EvidenceEngineError) {
      throw ApiError.badRequest(error.message, ERROR_CODES.VALIDATION_ERROR);
    }
    throw error;
  }
}

/**
 * Records an interview evaluation result.
 */
export async function recordInterview(userId, input) {
  try {
    const canonical = resolveCanonicalSkill(input.skill);
    const intake = validateEvidenceIntake({
      skill: input.skill,
      source: 'interview',
      score: input.score,
      passMark: input.passMark || INTERVIEW_PASS_MARK,
      evaluatedBy: input.evaluatedBy,
      reference: input.interviewId || input.reference,
      detail: input.detail,
      metadata: input.metadata || {},
      completedAt: input.completedAt,
    });

    const check = await SkillEvidenceCheck.create({
      user: userId,
      kind: CHECK_KINDS.INTERVIEW,
      canonicalSkillId: canonical?.id || null,
      skillKey: intake.skillKey,
      skillName: intake.skillName,
      score: intake.score,
      passMark: intake.passMark,
      outcome: intake.outcome,
      strength: intake.strength,
      status: intake.status,
      confidence: intake.confidence,
      eligibleForVerified: intake.eligibleForVerified,
      isAdvisory: intake.isAdvisory,
      isStale: intake.isStale,
      evaluatedBy: intake.evaluatedBy,
      reference: intake.reference,
      detail: intake.detail,
      expiresAt: intake.expiresAt,
      metadata: intake.metadata,
      completedAt: intake.completedAt,
      auditTrail: [
        {
          action: 'INTERVIEW_RECORDED',
          performedBy: intake.evaluatedBy,
          timestamp: new Date(),
          details: `Interview evaluated by ${intake.evaluatedBy} with score ${intake.score}`,
        },
      ],
    });

    return toPublicSkillEvidenceCheck(check);
  } catch (error) {
    if (error instanceof SkillEvidenceInputError || error instanceof EvidenceEngineError) {
      throw ApiError.badRequest(error.message, ERROR_CODES.VALIDATION_ERROR);
    }
    throw error;
  }
}

/**
 * Submits a self-declared or resume-derived skill claim.
 */
export async function submitClaim(userId, input) {
  try {
    const source = input.source === 'resume' ? 'resume' : 'self_declared';
    const intake = validateEvidenceIntake({
      skill: input.skill,
      source,
      score: 1.0,
      passMark: 0.7,
      evaluatedBy: 'user',
      reference: input.reference || `claim-${Date.now()}`,
      detail: input.detail || `Self-claimed competency for ${input.skill}`,
      metadata: input.metadata || {},
      completedAt: input.completedAt || new Date(),
    });

    const check = await SkillEvidenceCheck.create({
      user: userId,
      kind: source === 'resume' ? CHECK_KINDS.RESUME : CHECK_KINDS.SELF_DECLARED,
      canonicalSkillId: intake.canonicalSkillId,
      skillKey: intake.skillKey,
      skillName: intake.skillName,
      score: intake.score,
      passMark: intake.passMark,
      outcome: intake.outcome,
      strength: intake.strength,
      status: intake.status,
      confidence: intake.confidence,
      eligibleForVerified: false,
      isAdvisory: false,
      isStale: intake.isStale,
      evaluatedBy: 'user',
      reference: intake.reference,
      detail: intake.detail,
      expiresAt: intake.expiresAt,
      metadata: intake.metadata,
      completedAt: intake.completedAt,
      auditTrail: [
        {
          action: 'CLAIM_SUBMITTED',
          performedBy: 'user',
          timestamp: new Date(),
          details: `Claim submitted for ${intake.skillName}`,
        },
      ],
    });

    return toPublicSkillEvidenceCheck(check);
  } catch (error) {
    if (error instanceof EvidenceEngineError || error instanceof SkillEvidenceInputError) {
      throw ApiError.badRequest(error.message, ERROR_CODES.VALIDATION_ERROR);
    }
    throw error;
  }
}

/**
 * Submits a supporting artifact (project repo or certification credential).
 */
export async function submitSupport(userId, input) {
  try {
    const source = input.source === 'certification' ? 'certification' : 'project';
    const reference = input.repoUrl || input.credentialUrl || input.reference;
    if (!reference) {
      throw new EvidenceEngineError('A valid artifact reference (repoUrl, credentialUrl, or reference) is required.', 'MISSING_ARTIFACT');
    }

    const intake = validateEvidenceIntake({
      skill: input.skill,
      source,
      score: 1.0,
      passMark: 0.7,
      evaluatedBy: 'user',
      reference,
      detail: input.detail || `Supported by ${source}: ${reference}`,
      metadata: {
        repoUrl: input.repoUrl,
        credentialUrl: input.credentialUrl,
        credentialId: input.credentialId,
        issuer: input.issuer,
        repoVerified: Boolean(input.repoVerified),
        ...(input.metadata || {}),
      },
      completedAt: input.completedAt || new Date(),
    });

    const check = await SkillEvidenceCheck.create({
      user: userId,
      kind: source === 'certification' ? CHECK_KINDS.CERTIFICATION : CHECK_KINDS.PROJECT,
      canonicalSkillId: intake.canonicalSkillId,
      skillKey: intake.skillKey,
      skillName: intake.skillName,
      score: intake.score,
      passMark: intake.passMark,
      outcome: intake.outcome,
      strength: intake.strength,
      status: intake.status,
      confidence: intake.confidence,
      eligibleForVerified: false,
      isAdvisory: false,
      isStale: intake.isStale,
      evaluatedBy: 'user',
      reference: intake.reference,
      detail: intake.detail,
      expiresAt: intake.expiresAt,
      metadata: intake.metadata,
      completedAt: intake.completedAt,
      auditTrail: [
        {
          action: 'SUPPORT_SUBMITTED',
          performedBy: 'user',
          timestamp: new Date(),
          details: `Supporting artifact registered for ${intake.skillName} (${source})`,
        },
      ],
    });

    return toPublicSkillEvidenceCheck(check);
  } catch (error) {
    if (error instanceof EvidenceEngineError || error instanceof SkillEvidenceInputError) {
      throw ApiError.badRequest(error.message, ERROR_CODES.VALIDATION_ERROR);
    }
    throw error;
  }
}

/**
 * Invalidates / revokes an existing evidence record.
 */
export async function invalidateEvidence(userId, evidenceId, { reason, invalidatedBy = 'admin' }) {
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    throw ApiError.badRequest('Invalidation reason is required.', ERROR_CODES.VALIDATION_ERROR);
  }

  const check = await SkillEvidenceCheck.findOne({ _id: evidenceId, user: userId });
  if (!check) {
    throw ApiError.notFound('Evidence record not found.', ERROR_CODES.NOT_FOUND);
  }

  check.status = EVIDENCE_STATUS.INVALIDATED;
  check.invalidatedAt = new Date();
  check.invalidatedBy = invalidatedBy;
  check.invalidationReason = reason.trim();
  check.eligibleForVerified = false;

  check.auditTrail.push({
    action: 'EVIDENCE_INVALIDATED',
    performedBy: invalidatedBy,
    timestamp: new Date(),
    details: `Invalidated: ${reason.trim()}`,
  });

  await check.save();
  return toPublicSkillEvidenceCheck(check);
}

/**
 * Lists all evidence checks for a user, sorted newest-first.
 */
export async function listEvidenceChecks(userId) {
  const checks = await SkillEvidenceCheck.find({ user: userId }).sort({ completedAt: -1 });
  return checks.map(toPublicSkillEvidenceCheck);
}

/**
 * Produces the unified Claim -> Support -> Verification summary across all student competencies.
 */
export async function getEvidenceSummary(userId) {
  const allChecks = await SkillEvidenceCheck.find({
    user: userId,
    status: { $ne: EVIDENCE_STATUS.INVALIDATED },
  }).sort({ completedAt: -1 });

  return recomputeStudentEvidenceLedger(allChecks);
}

/**
 * Recomputes and returns fresh evidence ledger for a student.
 */
export async function recomputeUserEvidence(userId) {
  return await getEvidenceSummary(userId);
}

/**
 * Loads verified evidence for CareerTwin build.
 * Excludes invalidated records and enforces institutional policies.
 */
export async function loadVerifiedEvidence(userId) {
  const checks = await SkillEvidenceCheck.find({
    user: userId,
    eligibleForVerified: true,
    evaluatedBy: { $ne: 'ai' },
    outcome: CHECK_OUTCOMES.PASS,
    status: { $nin: [EVIDENCE_STATUS.INVALIDATED, EVIDENCE_STATUS.STALE] },
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
    score: check.score,
    evidence: {
      source: check.kind,
      strength: 'verified',
      detail: check.detail || `${check.kind === CHECK_KINDS.ASSESSMENT ? 'Passed assessment' : 'Passed interview'} for ${check.skillName} with score ${check.score}.`,
      reference: check.reference,
      score: check.score,
    },
  }));
}
