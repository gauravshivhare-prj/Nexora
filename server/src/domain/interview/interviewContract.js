import { canonicalSkill } from '../skills/skillKey.js';
import {
  CHECK_OUTCOMES,
  INTERVIEW_PASS_MARK,
  buildInterviewResult,
} from '../evidence/skillEvidenceCheck.js';
import { EVIDENCE_STRENGTH } from '../evidence/evidence.js';

/**
 * AI Interview Domain Contract Version.
 * Bump this whenever the schema, rubric weights, or validation contracts evolve.
 */
export const INTERVIEW_CONTRACT_VERSION = 1;

export { INTERVIEW_PASS_MARK };

/**
 * Standard difficulty tiers for interview sessions.
 */
export const INTERVIEW_DIFFICULTY = Object.freeze({
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
});

export const INTERVIEW_DIFFICULTY_VALUES = Object.freeze(
  Object.values(INTERVIEW_DIFFICULTY),
);

/**
 * Standard question archetypes for interviews.
 */
export const INTERVIEW_QUESTION_TYPES = Object.freeze({
  CONCEPTUAL: 'conceptual',
  SCENARIO: 'scenario',
  BEHAVIORAL: 'behavioral',
  TECHNICAL_DEEP_DIVE: 'technical_deep_dive',
});

export const INTERVIEW_QUESTION_TYPE_VALUES = Object.freeze(
  Object.values(INTERVIEW_QUESTION_TYPES),
);

/**
 * Session lifecycle states.
 */
export const SESSION_STATUS = Object.freeze({
  INITIALIZED: 'initialized',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  TIMED_OUT: 'timed_out',
  ABANDONED: 'abandoned',
  FAILED: 'failed',
});

export const SESSION_STATUS_VALUES = Object.freeze(
  Object.values(SESSION_STATUS),
);

/**
 * Evaluator authority types.
 */
export const EVALUATOR_TYPES = Object.freeze({
  AI: 'ai',
  HUMAN: 'human',
});

export const EVALUATOR_TYPE_VALUES = Object.freeze(
  Object.values(EVALUATOR_TYPES),
);

/**
 * Standard rubric dimensions for answer evaluation.
 */
export const RUBRIC_DIMENSIONS = Object.freeze({
  TECHNICAL_ACCURACY: 'accuracy',
  DEPTH_OF_KNOWLEDGE: 'depth',
  COMMUNICATION_CLARITY: 'clarity',
  RELEVANCE_TO_QUESTION: 'relevance',
});

export const RUBRIC_DIMENSION_KEYS = Object.freeze(
  Object.values(RUBRIC_DIMENSIONS),
);

/**
 * Deterministic dimension weighting summing exactly to 1.0.
 */
export const RUBRIC_DIMENSION_WEIGHTS = Object.freeze({
  accuracy: 0.35,
  depth: 0.30,
  clarity: 0.20,
  relevance: 0.15,
});

/**
 * Forbidden security-sensitive fields that an untrusted AI model (or an attacker
 * attempting prompt injection) must NEVER be permitted to set or influence.
 */
export const FORBIDDEN_SECURITY_FIELDS = Object.freeze([
  'verified',
  'eligibleforverified',
  'outcome',
  'evaluatortype',
  'evaluator',
  'evidence',
  'evidencecheck',
  'user',
  'userid',
  'role',
  'admin',
  'isadmin',
  'permissions',
  'token',
  'apikey',
  'secret',
  'password',
  'sessionstatus',
  'passmark',
  'proto',
  'prototype',
  'constructor',
  'studentid',
  'sessionid',
  'credential',
  'credentials',
  'jwt',
]);

/**
 * Checks whether a key is a forbidden security field, prototype pollution target,
 * or MongoDB operator.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isForbiddenOrPrototypeKey(key) {
  if (typeof key !== 'string') return true;
  const lower = key.toLowerCase();
  if (lower === '__proto__' || lower === 'prototype' || lower === 'constructor') return true;
  if (key.startsWith('$')) return true;
  const normalized = lower.replace(/[^a-z]/g, '');
  return FORBIDDEN_SECURITY_FIELDS.includes(normalized);
}

/**
 * Bounded limits for interview sessions, questions, and answers.
 */
export const INTERVIEW_LIMITS = Object.freeze({
  minQuestions: 1,
  maxQuestions: 10,
  maxTargetSkills: 5,
  studentAnswer: { min: 10, max: 5000 },
  questionPrompt: { min: 10, max: 2000 },
  feedbackSummary: { min: 10, max: 2000 },
  maxTimePerQuestionSeconds: 600,
  maxSessionMinutes: 90,
});

/**
 * Allowed lifecycle transitions map.
 */
const ALLOWED_TRANSITIONS = new Map([
  [
    SESSION_STATUS.INITIALIZED,
    new Set([SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.ABANDONED, SESSION_STATUS.TIMED_OUT]),
  ],
  [
    SESSION_STATUS.IN_PROGRESS,
    new Set([
      SESSION_STATUS.COMPLETED,
      SESSION_STATUS.TIMED_OUT,
      SESSION_STATUS.ABANDONED,
      SESSION_STATUS.FAILED,
    ]),
  ],
  [SESSION_STATUS.COMPLETED, new Set()],
  [SESSION_STATUS.TIMED_OUT, new Set()],
  [SESSION_STATUS.ABANDONED, new Set()],
  [SESSION_STATUS.FAILED, new Set()],
]);

/**
 * Validates whether a session status transition is permitted.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
export function canTransitionSession(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS.get(fromStatus);
  if (!allowed) return false;
  if (isForbiddenOrPrototypeKey(toStatus) || isForbiddenOrPrototypeKey(fromStatus)) return false;
  return allowed.has(toStatus);
}

/**
 * Validates parameters for initializing an interview session.
 *
 * @param {object} params
 * @returns {object} Normalized session initialization definition
 */
export function validateSessionInit(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('Session initialization parameters must be an object.');
  }

  for (const key of Object.keys(params)) {
    if (isForbiddenOrPrototypeKey(key) && key.toLowerCase() !== 'sessionid' && key.toLowerCase() !== 'studentid') {
      throw new Error(`Session initialization contains forbidden security field "${key}".`);
    }
  }

  const {
    sessionId,
    studentId,
    roleTitle,
    roleSlug,
    targetSkills,
    difficulty = INTERVIEW_DIFFICULTY.INTERMEDIATE,
    questionCount = 3,
    timeLimitMinutes = 30,
  } = params;

  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    throw new Error('sessionId is required.');
  }
  if (typeof studentId !== 'string' || studentId.trim() === '') {
    throw new Error('studentId is required.');
  }
  if (typeof roleTitle !== 'string' || roleTitle.trim() === '') {
    throw new Error('roleTitle is required.');
  }
  if (typeof roleSlug !== 'string' || roleSlug.trim() === '') {
    throw new Error('roleSlug is required.');
  }

  if (!INTERVIEW_DIFFICULTY_VALUES.includes(difficulty)) {
    throw new Error(
      `Invalid difficulty "${difficulty}". Must be one of: ${INTERVIEW_DIFFICULTY_VALUES.join(', ')}.`,
    );
  }

  if (
    !Number.isInteger(questionCount) ||
    questionCount < INTERVIEW_LIMITS.minQuestions ||
    questionCount > INTERVIEW_LIMITS.maxQuestions
  ) {
    throw new Error(
      `questionCount must be an integer between ${INTERVIEW_LIMITS.minQuestions} and ${INTERVIEW_LIMITS.maxQuestions}.`,
    );
  }

  if (
    !Number.isInteger(timeLimitMinutes) ||
    timeLimitMinutes <= 0 ||
    timeLimitMinutes > INTERVIEW_LIMITS.maxSessionMinutes
  ) {
    throw new Error(
      `timeLimitMinutes must be a positive integer up to ${INTERVIEW_LIMITS.maxSessionMinutes}.`,
    );
  }

  if (!Array.isArray(targetSkills) || targetSkills.length === 0) {
    throw new Error('At least one target skill is required.');
  }

  if (targetSkills.length > INTERVIEW_LIMITS.maxTargetSkills) {
    throw new Error(
      `Target skills cannot exceed ${INTERVIEW_LIMITS.maxTargetSkills}.`,
    );
  }

  const canonicalSkills = [];
  const seenKeys = new Set();

  for (const rawSkill of targetSkills) {
    if (typeof rawSkill !== 'string' || rawSkill.trim() === '') {
      throw new Error('Target skill names must be non-empty strings.');
    }
    const canonical = canonicalSkill(rawSkill.trim());
    if (!canonical) {
      throw new Error(`Unknown canonical skill: "${rawSkill}".`);
    }
    if (!seenKeys.has(canonical.key)) {
      seenKeys.add(canonical.key);
      canonicalSkills.push(canonical);
    }
  }

  return {
    sessionId: sessionId.trim(),
    studentId: studentId.trim(),
    roleTitle: roleTitle.trim(),
    roleSlug: roleSlug.trim(),
    targetSkills: canonicalSkills,
    difficulty,
    questionCount,
    timeLimitMinutes,
    status: SESSION_STATUS.INITIALIZED,
    createdAt: new Date(),
  };
}

/**
 * Validates a single interview question definition.
 *
 * @param {object} question
 * @param {number} [index=0]
 * @returns {object} Validated question definition
 */
export function validateInterviewQuestion(question, index = 0) {
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    throw new Error(`Question at index ${index} must be an object.`);
  }

  for (const key of Object.keys(question)) {
    if (isForbiddenOrPrototypeKey(key)) {
      throw new Error(`Question contains forbidden security or prototype field "${key}".`);
    }
  }

  const { id, type, targetSkill, prompt, rubricCriteria = [], timeLimitSeconds = 180, weight = 1 } = question;

  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`Question at index ${index} must have a non-empty id.`);
  }

  if (!INTERVIEW_QUESTION_TYPE_VALUES.includes(type)) {
    throw new Error(
      `Invalid question type "${type}". Must be one of: ${INTERVIEW_QUESTION_TYPE_VALUES.join(', ')}.`,
    );
  }

  if (typeof targetSkill !== 'string' || targetSkill.trim() === '') {
    throw new Error(`Question "${id}" targetSkill is required.`);
  }
  const canonical = canonicalSkill(targetSkill.trim());
  if (!canonical) {
    throw new Error(`Question "${id}": Unknown canonical skill "${targetSkill}".`);
  }

  if (typeof prompt !== 'string' || prompt.trim().length < INTERVIEW_LIMITS.questionPrompt.min) {
    throw new Error(
      `Question prompt must be at least ${INTERVIEW_LIMITS.questionPrompt.min} characters.`,
    );
  }
  if (prompt.trim().length > INTERVIEW_LIMITS.questionPrompt.max) {
    throw new Error(
      `Question prompt exceeds maximum length of ${INTERVIEW_LIMITS.questionPrompt.max} characters.`,
    );
  }

  if (!Number.isInteger(timeLimitSeconds) || timeLimitSeconds <= 0 || timeLimitSeconds > INTERVIEW_LIMITS.maxTimePerQuestionSeconds) {
    throw new Error(
      `timeLimitSeconds must be an integer between 1 and ${INTERVIEW_LIMITS.maxTimePerQuestionSeconds}.`,
    );
  }

  const validRubric = Array.isArray(rubricCriteria)
    ? rubricCriteria.filter((c) => typeof c === 'string' && c.trim().length > 0).map((c) => c.trim())
    : [];

  return {
    id: id.trim(),
    type,
    targetSkillKey: canonical.key,
    targetSkillName: canonical.name,
    prompt: prompt.trim(),
    rubricCriteria: validRubric,
    timeLimitSeconds,
    weight: typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 1,
  };
}

/**
 * Validates a student's answer submission to an interview question.
 *
 * @param {object} answer
 * @returns {object} Validated answer definition
 */
export function validateStudentAnswer(answer) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    throw new Error('Answer must be an object.');
  }

  for (const key of Object.keys(answer)) {
    if (isForbiddenOrPrototypeKey(key)) {
      throw new Error(`Answer contains forbidden security or prototype field "${key}".`);
    }
  }

  const { questionId, answerText, durationSeconds = 0, submittedAt = new Date() } = answer;

  if (typeof questionId !== 'string' || questionId.trim() === '') {
    throw new Error('questionId is required.');
  }

  if (typeof answerText !== 'string' || answerText.trim().length < INTERVIEW_LIMITS.studentAnswer.min) {
    throw new Error(
      `Answer must be at least ${INTERVIEW_LIMITS.studentAnswer.min} characters.`,
    );
  }

  if (answerText.length > INTERVIEW_LIMITS.studentAnswer.max) {
    throw new Error(
      `Answer exceeds maximum length of ${INTERVIEW_LIMITS.studentAnswer.max} characters.`,
    );
  }

  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new Error('durationSeconds must be a non-negative number.');
  }

  const submitDate = new Date(submittedAt);
  if (Number.isNaN(submitDate.getTime())) {
    throw new Error('submittedAt must be a valid date.');
  }

  return {
    questionId: questionId.trim(),
    answerText: answerText.trim(),
    durationSeconds: Math.round(durationSeconds),
    submittedAt: submitDate,
  };
}

/**
 * Calculates a composite score for a question using deterministic rubric dimension weights.
 *
 * @param {object} dimensions { accuracy, depth, clarity, relevance }
 * @returns {number} Weighted composite score bounded in [0, 1]
 */
export function calculateCompositeQuestionScore(dimensions) {
  if (!dimensions || typeof dimensions !== 'object') {
    return 0;
  }
  let composite = 0;
  for (const [key, weight] of Object.entries(RUBRIC_DIMENSION_WEIGHTS)) {
    const rawVal = dimensions[key];
    const num = typeof rawVal === 'number' && Number.isFinite(rawVal) ? rawVal : 0;
    const bounded = Math.max(0, Math.min(1, num));
    composite += bounded * weight;
  }
  return Math.round(composite * 10000) / 10000;
}

/**
 * Validates and sanitizes raw, untrusted AI evaluation output.
 *
 * Enforces strict rubric boundaries, clamps numeric fields to [0, 1],
 * filters hallucinated skills, rejects forbidden security fields, and rejects malformed outputs.
 *
 * @param {unknown} raw Raw output from AI model completion
 * @returns {object} Clean, validated, bounded evaluation object
 */
export function validateAiQuestionEvaluation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('AI evaluation output must be an object.');
  }

  for (const key of Object.keys(raw)) {
    if (isForbiddenOrPrototypeKey(key)) {
      throw new Error(`AI evaluation output contains forbidden security field "${key}".`);
    }
  }

  if (!raw.dimensions || typeof raw.dimensions !== 'object' || Array.isArray(raw.dimensions)) {
    throw new Error('Missing required rubric dimensions object.');
  }

  for (const dKey of Object.keys(raw.dimensions)) {
    if (isForbiddenOrPrototypeKey(dKey)) {
      throw new Error(`AI evaluation dimensions contains forbidden field "${dKey}".`);
    }
    if (!RUBRIC_DIMENSION_KEYS.includes(dKey)) {
      throw new Error(
        `Unexpected dimension "${dKey}". Allowed dimensions are: ${RUBRIC_DIMENSION_KEYS.join(', ')}.`,
      );
    }
  }

  const parsedDimensions = {};
  for (const key of RUBRIC_DIMENSION_KEYS) {
    if (raw.dimensions[key] === undefined || raw.dimensions[key] === null) {
      throw new Error(`Missing required rubric dimension: "${key}".`);
    }
    const rawVal = raw.dimensions[key];
    if (
      typeof rawVal === 'boolean' ||
      Array.isArray(rawVal) ||
      (typeof rawVal === 'object' && rawVal !== null) ||
      (typeof rawVal === 'string' && rawVal.trim() === '')
    ) {
      throw new Error(`Dimension "${key}" must be a numeric value.`);
    }
    const num = Number(rawVal);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
      throw new Error(`Dimension "${key}" must be a numeric value.`);
    }
    parsedDimensions[key] = Math.max(0, Math.min(1, Math.round(num * 10000) / 10000));
  }

  const compositeScore = calculateCompositeQuestionScore(parsedDimensions);

  if (typeof raw.feedback !== 'string' || raw.feedback.trim() === '') {
    throw new Error('Feedback summary is required.');
  }

  const strengths = Array.isArray(raw.strengths)
    ? raw.strengths.filter((s) => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
    : [];

  const growthAreas = Array.isArray(raw.growthAreas)
    ? raw.growthAreas.filter((g) => typeof g === 'string' && g.trim().length > 0).map((g) => g.trim())
    : [];

  // Ground skills against Nexora's canonical taxonomy (drop hallucinations)
  const groundedSkills = [];
  if (Array.isArray(raw.groundedSkills)) {
    for (const item of raw.groundedSkills) {
      if (typeof item === 'string') {
        const canonical = canonicalSkill(item.trim());
        if (canonical && !groundedSkills.includes(canonical.name)) {
          groundedSkills.push(canonical.name);
        }
      }
    }
  }

  return {
    score: compositeScore,
    compositeScore,
    dimensions: parsedDimensions,
    feedback: raw.feedback.trim(),
    strengths,
    growthAreas,
    groundedSkills,
  };
}

/**
 * Validates provider metadata tracking execution provenance.
 *
 * @param {object} meta
 * @returns {object} Clean metadata object
 */
export function validateProviderMetadata(meta) {
  if (!meta || typeof meta !== 'object') {
    throw new Error('Provider metadata must be an object.');
  }

  const { provider, model, schemaVersion = INTERVIEW_CONTRACT_VERSION, durationMs = 0, timestamp = new Date() } = meta;

  if (typeof provider !== 'string' || provider.trim() === '') {
    throw new Error('provider is required.');
  }
  if (typeof model !== 'string' || model.trim() === '') {
    throw new Error('model is required.');
  }

  return {
    provider: provider.trim(),
    model: model.trim(),
    schemaVersion: Number.isInteger(schemaVersion) ? schemaVersion : INTERVIEW_CONTRACT_VERSION,
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    timestamp: new Date(timestamp).toISOString(),
  };
}

/**
 * Evaluates an entire interview session and deterministically generates
 * institutional skill evidence check structures.
 *
 * In Nexora's institutional model:
 * - AI evaluations are advisory only (`outcome: 'uncertain'`, `evidenceStrength: 'supported'`).
 * - Only human-evaluated passes (`score >= 0.75`) produce `verified` evidence checks.
 *
 * @param {object} session Completed session with questions, answers, and evaluations
 * @param {object} [options]
 * @param {string} [options.evaluatedBy=EVALUATOR_TYPES.AI]
 * @returns {object} Full session evaluation and evidence result
 */
export function evaluateInterviewSession(session, { evaluatedBy = EVALUATOR_TYPES.AI } = {}) {
  if (!session || typeof session !== 'object') {
    throw new Error('session must be an object.');
  }

  if (!EVALUATOR_TYPE_VALUES.includes(evaluatedBy)) {
    throw new Error(`evaluatedBy must be one of: ${EVALUATOR_TYPE_VALUES.join(', ')}.`);
  }

  const questions = session.questions ?? [];
  const evaluations = session.evaluations ?? {};

  if (questions.length === 0) {
    throw new Error('Session must contain at least one question.');
  }

  let totalWeightedScore = 0;
  let totalWeight = 0;
  const questionResults = [];

  for (const q of questions) {
    const weight = typeof q.weight === 'number' && Number.isFinite(q.weight) && q.weight > 0 ? q.weight : 1;
    totalWeight += weight;

    const evaluation = evaluations[q.id];
    const rawScore = evaluation?.compositeScore ?? evaluation?.score ?? 0;
    const score = typeof rawScore === 'number' && Number.isFinite(rawScore) ? Math.max(0, Math.min(1, rawScore)) : 0;
    totalWeightedScore += score * weight;

    questionResults.push({
      questionId: q.id,
      targetSkillKey: q.targetSkillKey,
      targetSkillName: q.targetSkillName,
      weight,
      score,
      compositeScore: score,
      dimensions: evaluation?.dimensions ?? null,
      feedback: evaluation?.feedback ?? null,
      strengths: evaluation?.strengths ?? [],
      growthAreas: evaluation?.growthAreas ?? [],
    });
  }

  const overallScore = totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 10000) / 10000 : 0;

  const isHuman = evaluatedBy === EVALUATOR_TYPES.HUMAN;
  const passed = isHuman && overallScore >= INTERVIEW_PASS_MARK;

  const outcome = isHuman
    ? overallScore >= INTERVIEW_PASS_MARK
      ? CHECK_OUTCOMES.PASS
      : CHECK_OUTCOMES.FAIL
    : CHECK_OUTCOMES.UNCERTAIN;

  const eligibleForVerified = isHuman && passed;
  const evidenceStrength = eligibleForVerified
    ? EVIDENCE_STRENGTH.VERIFIED
    : EVIDENCE_STRENGTH.SUPPORTED;

  // Build skill evidence checks for each target skill
  const skillEvidenceResults = (session.targetSkills ?? []).map((target) => {
    return buildInterviewResult({
      skill: target.name || target.key,
      score: overallScore,
      interviewId: session.sessionId,
      evaluatedBy,
      completedAt: new Date(),
      passMark: INTERVIEW_PASS_MARK,
    });
  });

  return {
    sessionId: session.sessionId,
    studentId: session.studentId,
    roleTitle: session.roleTitle,
    roleSlug: session.roleSlug,
    difficulty: session.difficulty,
    overallScore,
    passMark: INTERVIEW_PASS_MARK,
    passed,
    outcome,
    eligibleForVerified,
    evidenceStrength,
    evaluatedBy,
    questionResults,
    skillEvidenceResults,
    completedAt: new Date(),
  };
}
