import { ERROR_CODES } from '../constants/errorCodes.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import {
  isAiConfigured,
  requestCompletion,
  resolveAiProvider,
} from './ai/aiProvider.js';
import {
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_PASS_MARK,
} from '../domain/interview/interviewContract.js';
import {
  buildInterviewEvaluationRequest,
  groundAnswerEvaluation,
} from '../domain/interview/interviewAnswerGrounding.js';
import { validateAiEvaluationJson } from '../domain/interview/interviewEvaluationSchema.js';
import { buildInterviewResult } from '../domain/evidence/skillEvidenceCheck.js';
import { canonicalSkill } from '../domain/skills/skillKey.js';

/**
 * Standard timeout in milliseconds for single-question AI evaluation.
 */
export const DEFAULT_AI_TIMEOUT_MS = 15_000;

/**
 * Evaluates a single candidate answer against a question definition and target skill.
 *
 * Enforces:
 * 1. Safe prompt construction with strict XML boundary isolation.
 * 2. Isolated timeout and cancellation signals.
 * 3. Schema validation of provider JSON (dropping malformed/extra fields).
 * 4. Post-evaluation answer grounding and adversarial injection defense.
 * 5. Provider audit metadata tracking (without storing credentials).
 *
 * @param {object} params
 * @param {object} params.question Interview question definition
 * @param {string} params.answerText Candidate's submitted answer
 * @param {AbortSignal} [params.signal] Optional caller cancellation signal
 * @param {number} [params.timeoutMs=DEFAULT_AI_TIMEOUT_MS] Max response time in ms
 * @returns {Promise<{ evaluation: object, providerMetadata: object, warnings: string[] }>}
 * @throws {ApiError} 503 if provider unavailable/failed, 502 if output invalid, 400 if bad input
 */
export async function evaluateQuestionAnswer({
  question,
  answerText,
  signal,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS,
}) {
  if (!question || typeof question !== 'object') {
    throw ApiError.badRequest('Question definition is required for evaluation.');
  }

  if (typeof answerText !== 'string' || answerText.trim().length < 5) {
    throw ApiError.badRequest(
      'Candidate answer text is too short to evaluate (minimum 5 characters).',
      ERROR_CODES.BAD_REQUEST,
    );
  }

  // Verify provider availability early before expensive prompt construction
  const provider = resolveAiProvider();

  // Step 1: Construct safe prompt with boundary isolation
  const requestPayload = buildInterviewEvaluationRequest({
    question,
    answerText,
  });

  // Step 2: Configure bounded timeout signal
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal) {
    signals.push(signal);
  }
  const effectiveSignal = AbortSignal.any(signals);

  const startTime = Date.now();
  let completion;

  try {
    completion = await requestCompletion({
      ...requestPayload,
      signal: effectiveSignal,
    });
  } catch (error) {
    // If request timed out, wrap into safe service unavailable error
    if (effectiveSignal.aborted && !signal?.aborted) {
      logger.error(`AI evaluation timed out after ${timeoutMs}ms for provider ${provider.name}`);
      throw ApiError.serviceUnavailable(
        'The AI evaluation service timed out. Please try again.',
        ERROR_CODES.AI_PROVIDER_FAILED,
      );
    }
    // Re-throw operational ApiErrors (e.g. 503 AI_PROVIDER_FAILED)
    throw error;
  }

  // Check if signal aborted during processing
  if (effectiveSignal.aborted) {
    if (signal?.aborted) {
      throw ApiError.badRequest('Request was cancelled by client.');
    }
    throw ApiError.serviceUnavailable(
      'The AI evaluation service timed out. Please try again.',
      ERROR_CODES.AI_PROVIDER_FAILED,
    );
  }

  const latencyMs = Date.now() - startTime;

  // Step 3: Validate AI response against strict JSON schema
  const validated = validateAiEvaluationJson(completion.text, { strict: false });
  if (!validated.isValid) {
    logger.warn(`AI evaluation schema rejected output from ${provider.name}: ${validated.errors.join(' ')}`);
    throw new ApiError(
      502,
      `The AI service returned an unusable evaluation response. ${validated.errors[0]}`,
      ERROR_CODES.AI_OUTPUT_INVALID,
    );
  }

  // Step 4: Apply post-evaluation grounding and adversarial defense
  const grounded = groundAnswerEvaluation(validated.data, {
    question,
    candidateAnswer: answerText,
  });

  const providerMetadata = {
    provider: provider.name,
    model: completion.model || provider.name,
    latencyMs,
    contractVersion: INTERVIEW_CONTRACT_VERSION,
  };

  const warnings = [...validated.warnings, ...grounded.warnings];
  if (warnings.length > 0) {
    logger.info(`AI interview evaluation recorded ${warnings.length} warning(s)`);
  }

  return {
    evaluation: grounded.evaluation,
    providerMetadata,
    warnings,
  };
}

/**
 * Evaluates the overall results of an interview session across all answered questions.
 *
 * INSTITUTIONAL EVIDENCE RULE:
 * AI evaluations are advisory ONLY (`outcome: 'uncertain'`, `evidenceStrength: 'supported'`).
 * They NEVER directly produce verified evidence without human confirmation.
 * Only a human evaluation with score >= 0.75 produces `outcome: 'pass'` and `verified` evidence.
 *
 * @param {object} params
 * @param {object} params.session Interview session document or state object
 * @param {string} [params.evaluatorType='ai'] 'ai' or 'human'
 * @returns {{ overallScore: number, evaluatorType: string, eligibleForVerified: boolean, evidenceResults: Array<object>, completedAt: Date }}
 */
export function evaluateSessionResults({ session, evaluatorType = 'ai' }) {
  if (!session || typeof session !== 'object') {
    throw ApiError.badRequest('Session object is required for evaluation.');
  }

  const questions = Array.isArray(session.questions) ? session.questions : [];
  const evaluatedQuestions = questions.filter((q) => {
    if (!q || !q.evaluation) return false;
    const scoreVal = typeof q.evaluation.compositeScore === 'number'
      ? q.evaluation.compositeScore
      : (typeof q.evaluation.score === 'number' ? q.evaluation.score : null);
    return scoreVal !== null && Number.isFinite(scoreVal);
  });

  if (evaluatedQuestions.length === 0) {
    throw ApiError.badRequest(
      'Cannot evaluate session: no questions have been evaluated yet.',
      ERROR_CODES.BAD_REQUEST,
    );
  }

  // Calculate composite average
  const totalScore = evaluatedQuestions.reduce((sum, q) => {
    const scoreVal = typeof q.evaluation.compositeScore === 'number'
      ? q.evaluation.compositeScore
      : (typeof q.evaluation.score === 'number' ? q.evaluation.score : 0);
    return sum + (Number.isFinite(scoreVal) ? Math.max(0, Math.min(1, scoreVal)) : 0);
  }, 0);
  const overallScore = Math.max(
    0,
    Math.min(1, Math.round((totalScore / evaluatedQuestions.length) * 10000) / 10000),
  );

  const targetSkills = Array.isArray(session.targetSkills) ? session.targetSkills : [];
  const interviewId = String(session._id ?? session.id ?? 'interview-session');
  const completedAt = new Date();

  // Evaluate evidence for each target skill
  const evidenceResults = [];
  for (const rawSkill of targetSkills) {
    const skillName = typeof rawSkill === 'string' ? rawSkill : (rawSkill?.name || rawSkill?.key || '');
    const canonical = canonicalSkill(skillName);
    if (!canonical) continue;

    // Filter questions specific to this skill
    const skillQuestions = evaluatedQuestions.filter((q) => {
      const qSkill = q.targetSkill || q.targetSkillName || q.targetSkillKey;
      return qSkill && canonicalSkill(qSkill)?.key === canonical.key;
    });

    const skillScore = skillQuestions.length > 0
      ? Math.max(
          0,
          Math.min(
            1,
            Math.round(
              (skillQuestions.reduce((sum, q) => {
                const scoreVal = typeof q.evaluation.compositeScore === 'number'
                  ? q.evaluation.compositeScore
                  : (typeof q.evaluation.score === 'number' ? q.evaluation.score : 0);
                return sum + (Number.isFinite(scoreVal) ? Math.max(0, Math.min(1, scoreVal)) : 0);
              }, 0) / skillQuestions.length) * 10000,
            ) / 10000,
          ),
        )
      : overallScore;

    const evidenceCheck = buildInterviewResult({
      skill: canonical.name,
      score: skillScore,
      interviewId,
      evaluatedBy: evaluatorType,
      completedAt,
    });

    evidenceResults.push(evidenceCheck);
  }

  const eligibleForVerified = evaluatorType === 'human' && overallScore >= INTERVIEW_PASS_MARK;

  return {
    overallScore,
    evaluatorType,
    eligibleForVerified,
    evidenceResults,
    completedAt,
  };
}
