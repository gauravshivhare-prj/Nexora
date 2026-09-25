import { Assessment, toAdminAssessment, toPublicAssessment } from '../models/Assessment.model.js';
import {
  AssessmentAttempt,
  toPublicAssessmentAttempt,
} from '../models/AssessmentAttempt.model.js';
import {
  ATTEMPT_STATUS,
  DIFFICULTY_LEVEL_VALUES,
  evaluateAssessmentSubmission,
  validateAssessmentDefinition,
} from '../domain/assessment/assessmentContract.js';
import {
  ASSESSMENT_CATALOG,
  getAssessmentById as getCatalogAssessmentById,
  getAssessmentCatalog,
} from '../domain/assessment/assessmentCatalog.js';
import { recordAssessment } from './skillEvidence.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import {
  ASSESSMENT_LIMITS,
  FORBIDDEN_CLIENT_VERIFICATION_FIELDS,
} from '../constants/assessmentPolicy.js';
import { canonicalSkill, skillKey } from '../domain/skills/skillKey.js';

/**
 * Ensures the canonical catalog assessments exist in MongoDB.
 */
export async function seedAssessmentCatalog() {
  const catalog = getAssessmentCatalog();
  for (const item of catalog) {
    const existing = await Assessment.findOne({ assessmentId: item.id }).select('_id').lean();
    if (!existing) {
      await Assessment.create({
        assessmentId: item.id,
        version: item.version,
        skillKey: item.skillKey,
        skillName: item.skillName,
        secondarySkillKeys: item.secondarySkillKeys ?? [],
        difficulty: item.difficulty,
        title: item.title,
        description: item.description,
        passMark: item.passMark,
        timeLimitMinutes: item.timeLimitMinutes,
        questions: item.questions,
        isActive: true,
      });
    }
  }
}

/**
 * Lists all active, sanitized assessments available for students.
 */
export async function listAssessments({ skill, difficulty } = {}) {
  const query = { isActive: true };

  if (skill !== undefined && skill !== null) {
    if (typeof skill !== 'string' || skill.trim() === '') {
      throw ApiError.badRequest('skill filter parameter must be a non-empty string.', ERROR_CODES.VALIDATION_ERROR);
    }
    const canonical = canonicalSkill(skill.trim());
    if (!canonical) {
      throw ApiError.badRequest(
        `Unknown canonical skill: "${skill}".`,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    query.$or = [{ skillKey: canonical.key }, { secondarySkillKeys: canonical.key }];
  }

  if (difficulty !== undefined && difficulty !== null) {
    if (typeof difficulty !== 'string' || !DIFFICULTY_LEVEL_VALUES.includes(difficulty.trim().toLowerCase())) {
      throw ApiError.badRequest(
        `Invalid difficulty filter. Allowed values: ${DIFFICULTY_LEVEL_VALUES.join(', ')}.`,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    query.difficulty = difficulty.trim().toLowerCase();
  }

  let assessments = await Assessment.find(query).sort({ title: 1 }).lean();

  // If DB is empty, fallback to canonical catalog
  if (assessments.length === 0 && (!query.skillKey && !query.$or)) {
    return ASSESSMENT_CATALOG.map(toPublicAssessment);
  }

  return assessments.map(toPublicAssessment);
}

/**
 * Fetches a single sanitized assessment definition for a student.
 */
export async function getAssessment(assessmentId) {
  validateAssessmentIdParam(assessmentId);

  const doc = await Assessment.findOne({ assessmentId: assessmentId.trim(), isActive: true }).lean();
  if (doc) {
    return toPublicAssessment(doc);
  }

  // Check canonical catalog fallback
  const catalogItem = getCatalogAssessmentById(assessmentId);
  if (catalogItem) {
    return toPublicAssessment(catalogItem);
  }

  throw ApiError.notFound(`Assessment "${assessmentId}" not found.`, ERROR_CODES.NOT_FOUND);
}

/**
 * Creates or registers a new assessment definition (admin/system).
 */
export async function createAssessment(input) {
  if (!input || typeof input !== 'object') {
    throw ApiError.badRequest('Assessment payload is required.', ERROR_CODES.MALFORMED_REQUEST);
  }

  // Validate using domain contract
  let validated;
  try {
    validated = validateAssessmentDefinition(input);
  } catch (err) {
    throw ApiError.badRequest(err.message, ERROR_CODES.VALIDATION_ERROR);
  }

  const existing = await Assessment.findOne({ assessmentId: validated.id }).select('_id').lean();
  if (existing) {
    throw ApiError.conflict(
      `Assessment with ID "${validated.id}" already exists.`,
      ERROR_CODES.CONFLICT,
    );
  }

  try {
    const created = await Assessment.create({
      assessmentId: validated.id,
      version: validated.version,
      skillKey: validated.skillKey,
      skillName: validated.skillName,
      secondarySkillKeys: validated.secondarySkillKeys,
      difficulty: validated.difficulty,
      title: validated.title,
      description: validated.description,
      passMark: validated.passMark,
      timeLimitMinutes: validated.timeLimitMinutes,
      questions: validated.questions,
      isActive: true,
    });

    return toAdminAssessment(created);
  } catch (error) {
    if (error?.name === 'ValidationError') {
      throw ApiError.badRequest(error.message, ERROR_CODES.VALIDATION_ERROR);
    }
    throw error;
  }
}

/**
 * Recursively scans payload for any client-controlled scoring, answer key, or verification fields.
 * Throws ApiError.badRequest if any forbidden field is discovered.
 */
export function assertNoForbiddenClientFields(payload, context = 'payload') {
  if (!payload || typeof payload !== 'object') return;

  const forbiddenSet = new Set(FORBIDDEN_CLIENT_VERIFICATION_FIELDS);

  function walk(node, path) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i], `${path}[${i}]`);
      }
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype' ||
        key.startsWith('$')
      ) {
        throw ApiError.badRequest(
          `Invalid payload key: "${key}".`,
          ERROR_CODES.VALIDATION_ERROR,
        );
      }
      if (forbiddenSet.has(key)) {
        throw ApiError.badRequest(
          `Client is forbidden from supplying scoring/verification field: "${key}".`,
          ERROR_CODES.VALIDATION_ERROR,
        );
      }
      if (value && typeof value === 'object') {
        walk(value, `${path}.${key}`);
      }
    }
  }

  walk(payload, context);
}

/**
 * Starts a new assessment attempt for an authenticated student.
 */
export async function startAssessmentAttempt(userId, input) {
  if (!userId) {
    throw ApiError.unauthorized('User authentication required.', ERROR_CODES.AUTH_TOKEN_MISSING);
  }
  if (!input || typeof input !== 'object') {
    throw ApiError.badRequest('Attempt payload is required.', ERROR_CODES.MALFORMED_REQUEST);
  }
  assertNoForbiddenClientFields(input);

  const { assessmentId } = input;
  validateAssessmentIdParam(assessmentId);

  // Load the assessment to verify it exists
  const fullAssessment = await loadFullAssessment(assessmentId);

  // Check previous attempts
  const previousAttempts = await AssessmentAttempt.find({
    user: userId,
    assessmentId: fullAssessment.id,
  }).sort({ attemptNumber: 1 }).lean();

  // If there is an active in-progress attempt, check if it timed out
  const activeAttempt = previousAttempts.find((att) => att.status === ATTEMPT_STATUS.IN_PROGRESS);
  if (activeAttempt) {
    const isTimedOut = checkAttemptTimedOut(activeAttempt, fullAssessment.timeLimitMinutes);
    if (!isTimedOut) {
      return toPublicAssessmentAttempt(activeAttempt);
    }
    // Conditional on still being in progress, so a submission that lands
    // concurrently is never overwritten with a zero score.
    await AssessmentAttempt.updateOne(
      { _id: activeAttempt._id, status: ATTEMPT_STATUS.IN_PROGRESS },
      { $set: { status: ATTEMPT_STATUS.TIMED_OUT, passed: false, score: 0 } },
    );
    activeAttempt.status = ATTEMPT_STATUS.TIMED_OUT;
    activeAttempt.passed = false;
    activeAttempt.score = 0;
  }

  if (previousAttempts.length >= ASSESSMENT_LIMITS.maxAttemptsPerAssessment) {
    throw ApiError.badRequest(
      `Maximum number of attempts (${ASSESSMENT_LIMITS.maxAttemptsPerAssessment}) reached for this assessment.`,
      ERROR_CODES.BAD_REQUEST,
    );
  }

  const attemptNumber = previousAttempts.length + 1;

  const attempt = await AssessmentAttempt.create({
    user: userId,
    assessmentId: fullAssessment.id,
    attemptNumber,
    version: fullAssessment.version,
    skillKey: fullAssessment.skillKey,
    skillName: fullAssessment.skillName,
    difficulty: fullAssessment.difficulty,
    passMark: fullAssessment.passMark,
    status: ATTEMPT_STATUS.IN_PROGRESS,
    startedAt: new Date(),
    answers: {},
  });

  return toPublicAssessmentAttempt(attempt);
}

/**
 * Submits an assessment attempt, executes deterministic scoring,
 * and records verified skill evidence on passing.
 */
export async function submitAssessmentAttempt(userId, payload) {
  if (!userId) {
    throw ApiError.unauthorized('User authentication required.', ERROR_CODES.AUTH_TOKEN_MISSING);
  }
  if (!payload || typeof payload !== 'object') {
    throw ApiError.badRequest('Submission payload is required.', ERROR_CODES.MALFORMED_REQUEST);
  }

  // 1. Anti-Tamper: Reject any client-controlled verification / scoring / answer key fields
  assertNoForbiddenClientFields(payload);

  const { attemptId, assessmentId, answers } = payload;

  if (!attemptId && !assessmentId) {
    throw ApiError.badRequest(
      'Either attemptId or assessmentId must be provided.',
      ERROR_CODES.VALIDATION_ERROR,
    );
  }

  // 2. Validate answers format and length boundaries
  validateSubmissionAnswers(answers);

  // 3. Locate attempt
  let attempt;
  if (attemptId) {
    if (typeof attemptId !== 'string' || !/^[a-f0-9]{24}$/i.test(attemptId.trim())) {
      throw ApiError.notFound('Active assessment attempt not found.', ERROR_CODES.NOT_FOUND);
    }
    attempt = await AssessmentAttempt.findOne({ _id: attemptId.trim(), user: userId }).lean();
  } else {
    if (typeof assessmentId !== 'string' || assessmentId.trim() === '' || !/^[a-z0-9_-]+$/i.test(assessmentId.trim())) {
      throw ApiError.badRequest('assessmentId must be a valid alphanumeric slug.', ERROR_CODES.VALIDATION_ERROR);
    }
    attempt = await AssessmentAttempt.findOne({
      user: userId,
      assessmentId: assessmentId.trim(),
      status: ATTEMPT_STATUS.IN_PROGRESS,
    }).sort({ attemptNumber: -1 }).lean();
  }

  if (!attempt) {
    throw ApiError.notFound('Active assessment attempt not found.', ERROR_CODES.NOT_FOUND);
  }

  if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) {
    throw ApiError.badRequest(
      `Attempt is already ${attempt.status} and cannot be submitted again.`,
      ERROR_CODES.BAD_REQUEST,
    );
  }

  // 4. Load full assessment definition with secrets
  const fullAssessment = await loadFullAssessment(attempt.assessmentId);

  // 5. Deterministic evaluation using domain contract
  const evalDate = new Date();
  const evalResult = evaluateAssessmentSubmission({
    assessment: fullAssessment,
    submission: {
      assessmentId: fullAssessment.id,
      studentId: String(userId),
      startedAt: attempt.startedAt,
      answers,
    },
    evaluatedAt: evalDate,
  });

  // 6. Atomically update attempt status to EVALUATED to prevent concurrent double-submissions
  const startMs = new Date(attempt.startedAt).getTime();
  const durationSeconds = Math.max(0, Math.round((evalDate.getTime() - startMs) / 1000));

  const updatedAttempt = await AssessmentAttempt.findOneAndUpdate(
    { _id: attempt._id, user: userId, status: ATTEMPT_STATUS.IN_PROGRESS },
    {
      $set: {
        status: evalResult.status,
        score: evalResult.score,
        passed: evalResult.passed,
        outcome: evalResult.outcome,
        earnedPoints: evalResult.earnedPoints,
        maxPoints: evalResult.maxPoints,
        totalQuestions: evalResult.totalQuestions,
        correctQuestionsCount: evalResult.correctQuestionsCount,
        answers: answers ?? {},
        questionResults: evalResult.questionResults,
        evidenceCheck: null,
        completedAt: evalDate,
        durationSeconds,
      },
    },
    { new: true, lean: true },
  );

  if (!updatedAttempt) {
    throw ApiError.badRequest(
      'Attempt is already evaluated and cannot be submitted again.',
      ERROR_CODES.BAD_REQUEST,
    );
  }

  // 7. Record verified evidence if passed (only after atomic attempt transition succeeded)
  let evidenceCheckId = null;
  if (evalResult.passed && evalResult.evidenceResult?.eligibleForVerified) {
    const evidenceDoc = await recordAssessment(userId, {
      skill: fullAssessment.skillKey,
      score: evalResult.score,
      assessmentId: fullAssessment.id,
      passMark: fullAssessment.passMark,
      difficulty: fullAssessment.difficulty,
      isPractice: Boolean(fullAssessment.isPractice),
      evaluatedBy: fullAssessment.evaluatedBy ?? 'assessment-engine',
      eligibleForVerified: evalResult.evidenceResult?.eligibleForVerified,
      completedAt: evalDate,
    });
    evidenceCheckId = evidenceDoc?.id ?? null;
    if (evidenceCheckId) {
      updatedAttempt.evidenceCheck = evidenceCheckId;
      await AssessmentAttempt.updateOne(
        { _id: updatedAttempt._id },
        { $set: { evidenceCheck: evidenceCheckId } },
      );
    }
  }

  return {
    attempt: toPublicAssessmentAttempt(updatedAttempt),
    evidenceResult: evalResult.evidenceResult,
    evidenceStatus: evalResult.evidenceStatus,
  };
}

/**
 * Retrieves a single attempt by ID for an authenticated user.
 */
export async function getAttemptById(userId, attemptId) {
  if (!userId) {
    throw ApiError.unauthorized('User authentication required.', ERROR_CODES.AUTH_TOKEN_MISSING);
  }
  if (!attemptId || typeof attemptId !== 'string' || !/^[a-f0-9]{24}$/i.test(attemptId.trim())) {
    throw ApiError.notFound('Assessment attempt not found.', ERROR_CODES.NOT_FOUND);
  }
  const attempt = await AssessmentAttempt.findOne({ _id: attemptId.trim(), user: userId }).lean();
  if (!attempt) {
    throw ApiError.notFound('Assessment attempt not found.', ERROR_CODES.NOT_FOUND);
  }
  return toPublicAssessmentAttempt(attempt);
}

/**
 * Lists all attempts for an authenticated user.
 */
export async function listUserAttempts(userId, { assessmentId } = {}) {
  if (!userId) {
    throw ApiError.unauthorized('User authentication required.', ERROR_CODES.AUTH_TOKEN_MISSING);
  }
  const query = { user: userId };
  if (assessmentId) {
    if (typeof assessmentId !== 'string' || !/^[a-z0-9_-]+$/i.test(assessmentId.trim())) {
      throw ApiError.badRequest('assessmentId filter must be a valid alphanumeric slug.', ERROR_CODES.VALIDATION_ERROR);
    }
    query.assessmentId = assessmentId.trim();
  }

  const attempts = await AssessmentAttempt.find(query).sort({ createdAt: -1 }).lean();
  return attempts.map(toPublicAssessmentAttempt);
}

/**
 * Retrieves the latest completed assessment result for an authenticated user.
 */
export async function getLatestAssessmentResult(userId, assessmentId) {
  if (!userId) {
    throw ApiError.unauthorized('User authentication required.', ERROR_CODES.AUTH_TOKEN_MISSING);
  }
  validateAssessmentIdParam(assessmentId);

  const attempt = await AssessmentAttempt.findOne({
    user: userId,
    assessmentId: assessmentId.trim(),
    status: { $in: [ATTEMPT_STATUS.EVALUATED, ATTEMPT_STATUS.TIMED_OUT] },
  }).sort({ attemptNumber: -1 }).lean();

  if (!attempt) {
    return null;
  }
  return toPublicAssessmentAttempt(attempt);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function validateAssessmentIdParam(id) {
  if (typeof id !== 'string' || id.trim().length === 0 || !/^[a-z0-9_-]+$/i.test(id.trim())) {
    throw ApiError.badRequest('assessmentId parameter must be a valid alphanumeric slug.', ERROR_CODES.VALIDATION_ERROR);
  }
}

async function loadFullAssessment(assessmentId) {
  const doc = await Assessment.findOne({ assessmentId: assessmentId.trim(), isActive: true }).lean();
  if (doc) {
    return toAdminAssessment(doc);
  }

  const catalogItem = getCatalogAssessmentById(assessmentId);
  if (catalogItem) {
    return catalogItem;
  }

  throw ApiError.notFound(`Assessment "${assessmentId}" not found.`, ERROR_CODES.NOT_FOUND);
}

function checkAttemptTimedOut(attempt, timeLimitMinutes, graceSeconds = 60) {
  if (!timeLimitMinutes || !attempt.startedAt) return false;
  const startMs = new Date(attempt.startedAt).getTime();
  const allowedMs = (timeLimitMinutes * 60 + graceSeconds) * 1000;
  return Date.now() - startMs > allowedMs;
}

function validateSubmissionAnswers(answers) {
  if (answers === null || answers === undefined) return;

  if (typeof answers !== 'object') {
    throw ApiError.badRequest('answers must be an object or array.', ERROR_CODES.VALIDATION_ERROR);
  }

  const entries = Array.isArray(answers)
    ? answers.map((a) => [a?.questionId, a?.answer])
    : Object.entries(answers);

  if (entries.length > ASSESSMENT_LIMITS.maxSubmissionAnswers) {
    throw ApiError.badRequest(
      `Answers payload exceeds limit of ${ASSESSMENT_LIMITS.maxSubmissionAnswers} answers.`,
      ERROR_CODES.VALIDATION_ERROR,
    );
  }

  for (const [qId, val] of entries) {
    if (typeof qId !== 'string' || qId.length > 64) {
      throw ApiError.badRequest(`Invalid questionId in answers payload.`, ERROR_CODES.VALIDATION_ERROR);
    }
    if (
      val !== null &&
      val !== undefined &&
      typeof val !== 'string' &&
      typeof val !== 'boolean' &&
      typeof val !== 'number' &&
      !Array.isArray(val)
    ) {
      throw ApiError.badRequest(
        `Answer for "${qId}" has invalid type. Non-primitive objects are not permitted.`,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    if (typeof val === 'string' && val.length > ASSESSMENT_LIMITS.answerText.max) {
      throw ApiError.badRequest(
        `Answer for "${qId}" exceeds maximum length of ${ASSESSMENT_LIMITS.answerText.max} characters.`,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    if (Array.isArray(val)) {
      if (val.length > 10) {
        throw ApiError.badRequest(
          `Answer option array for "${qId}" exceeds maximum items (10).`,
          ERROR_CODES.VALIDATION_ERROR,
        );
      }
      for (const item of val) {
        if (typeof item !== 'string' && typeof item !== 'number') {
          throw ApiError.badRequest(
            `Option item in answer for "${qId}" has invalid type.`,
            ERROR_CODES.VALIDATION_ERROR,
          );
        }
        if (typeof item === 'string' && item.length > 100) {
          throw ApiError.badRequest(
            `Option ID in answer for "${qId}" exceeds maximum length (100).`,
            ERROR_CODES.VALIDATION_ERROR,
          );
        }
      }
    }
  }
}
