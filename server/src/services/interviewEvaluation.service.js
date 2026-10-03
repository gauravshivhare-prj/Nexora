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
  INTERVIEW_LIMITS,
} from '../domain/interview/interviewContract.js';
import {
  buildInterviewEvaluationRequest,
  groundAnswerEvaluation,
} from '../domain/interview/interviewAnswerGrounding.js';
import { validateAiEvaluationJson, hasInjectionContent } from '../domain/interview/interviewEvaluationSchema.js';
import {
  redactProviderErrors,
  redactSensitiveSecrets,
} from '../domain/interview/interviewFeedbackSafety.js';
import { buildInterviewResult } from '../domain/evidence/skillEvidenceCheck.js';
import { canonicalSkill } from '../domain/skills/skillKey.js';
import { scoreFeedbackQuality } from '../domain/interview/feedbackQuality.js';

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
  previousTurns = [],
  signal,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS,
}) {
  if (!question || typeof question !== 'object') {
    throw ApiError.badRequest('Question definition is required for evaluation.');
  }

  if (typeof answerText !== 'string' || answerText.trim().length < INTERVIEW_LIMITS.studentAnswer.min) {
    throw ApiError.badRequest(
      `Candidate answer text is too short to evaluate (minimum ${INTERVIEW_LIMITS.studentAnswer.min} characters).`,
      ERROR_CODES.BAD_REQUEST,
    );
  }

  if (answerText.trim().length > INTERVIEW_LIMITS.studentAnswer.max) {
    throw ApiError.badRequest(
      `Candidate answer text exceeds maximum length of ${INTERVIEW_LIMITS.studentAnswer.max} characters.`,
      ERROR_CODES.BAD_REQUEST,
    );
  }

  const effectiveSkill = question.targetSkill;
  if (!effectiveSkill || !canonicalSkill(effectiveSkill)) {
    throw ApiError.badRequest(
      `Question has invalid or missing target skill: "${effectiveSkill}".`,
      ERROR_CODES.BAD_REQUEST,
    );
  }

  const promptText = question.prompt || question.intent?.prompt;
  if (!promptText || typeof promptText !== 'string' || promptText.trim().length === 0) {
    throw ApiError.badRequest(
      'Question prompt is missing or empty.',
      ERROR_CODES.BAD_REQUEST,
    );
  }

  // Verify provider availability early before expensive prompt construction
  const provider = resolveAiProvider();

  // Step 1: Construct safe prompt with boundary isolation
  const requestPayload = buildInterviewEvaluationRequest({
    question,
    answerText,
    previousTurns,
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
    // Redact secrets and provider error traces from operational ApiErrors
    if (error instanceof ApiError) {
      error.message = redactProviderErrors(redactSensitiveSecrets(error.message).text).text;
      throw error;
    }
    // Generic unexpected exceptions: never expose internal stack or message to caller
    logger.error(`AI evaluation unexpected failure: ${error?.name || 'Error'}`);
    throw ApiError.serviceUnavailable(
      'The AI evaluation service encountered an error. Please try again in a moment.',
      ERROR_CODES.AI_PROVIDER_FAILED,
    );
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

  // Step 3: Validate AI response against schema (bounding feedback and handling injection echo)
  const validated = validateAiEvaluationJson(completion.text, {
    strict: false,
    boundFeedback: true,
    allowInjectionEcho: hasInjectionContent(answerText),
  });
  if (!validated.isValid) {
    logger.warn(`AI evaluation schema rejected output from ${provider.name}: ${validated.errors.join(' ')}`);
    const rawFirstError = validated.errors[0] || 'Invalid evaluation format.';
    const safeError = redactProviderErrors(redactSensitiveSecrets(rawFirstError).text).text;
    throw new ApiError(
      502,
      `The AI service returned an unusable evaluation response. ${safeError}`,
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

  const quality = scoreFeedbackQuality(grounded.evaluation, {
    question,
    answerText,
  });

  const warnings = [...validated.warnings, ...grounded.warnings];
  if (!quality.isAcceptable && quality.reasons.length > 0) {
    logger.info(`Feedback quality advisory note: ${quality.reasons.join('; ')}`);
  }
  if (warnings.length > 0) {
    logger.info(`AI interview evaluation recorded ${warnings.length} warning(s)`);
  }

  return {
    evaluation: grounded.evaluation,
    providerMetadata,
    quality: {
      qualityScore: quality.qualityScore,
      isAcceptable: quality.isAcceptable,
      dimensions: quality.dimensions,
    },
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
  if (!session || typeof session !== 'object' || Array.isArray(session)) {
    throw ApiError.badRequest('Session object is required for evaluation.');
  }

  const rawSession = typeof session.toObject === 'function' ? session.toObject() : session;

  for (const key of Object.keys(rawSession)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor' || key.startsWith('$')) {
      throw ApiError.badRequest(`Invalid session field "${key}".`);
    }
  }

  const normalizedEvaluator = evaluatorType === 'human' ? 'human' : 'ai';
  const questions = Array.isArray(rawSession.questions) ? rawSession.questions : [];
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

  const getQuestionScore = (q) => {
    const raw = q.evaluation?.compositeScore ?? q.evaluation?.score;
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  };

  const getQuestionWeight = (q) => {
    return typeof q.weight === 'number' && Number.isFinite(q.weight) && q.weight > 0 ? q.weight : 1;
  };

  // Calculate weighted composite average
  const totalScore = evaluatedQuestions.reduce(
    (sum, q) => sum + getQuestionScore(q) * getQuestionWeight(q),
    0,
  );
  const totalWeight = evaluatedQuestions.reduce(
    (sum, q) => sum + getQuestionWeight(q),
    0,
  );
  const overallScore = totalWeight > 0
    ? Math.max(0, Math.min(1, Math.round((totalScore / totalWeight) * 10000) / 10000))
    : 0;

  const targetSkills = Array.isArray(rawSession.targetSkills) ? rawSession.targetSkills : [];
  const interviewId = String(rawSession._id ?? rawSession.id ?? session._id ?? session.id ?? 'interview-session');
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

    const hasAnySkillTags = evaluatedQuestions.some((q) => Boolean(q.targetSkill || q.targetSkillName || q.targetSkillKey));

    let skillScore = 0;
    if (skillQuestions.length > 0) {
      const skillScoreSum = skillQuestions.reduce(
        (sum, q) => sum + getQuestionScore(q) * getQuestionWeight(q),
        0,
      );
      const skillWeightSum = skillQuestions.reduce(
        (sum, q) => sum + getQuestionWeight(q),
        0,
      );
      skillScore = skillWeightSum > 0 ? Math.round((skillScoreSum / skillWeightSum) * 10000) / 10000 : 0;
    } else if (!hasAnySkillTags) {
      skillScore = overallScore;
    }

    const evidenceCheck = buildInterviewResult({
      skill: canonical.name,
      score: skillScore,
      interviewId,
      evaluatedBy: normalizedEvaluator,
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
