import {
  assertNoForbiddenClientFields,
  getAssessment,
  getAttemptById,
  getLatestAssessmentResult,
  listAssessments,
  listUserAttempts,
  startAssessmentAttempt,
  submitAssessmentAttempt,
} from '../services/assessment.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * GET /api/assessments
 *
 * Lists active, sanitized assessments available for students.
 * Supports optional ?skill= and ?difficulty= query filters.
 */
export const listAssessmentsHandler = asyncHandler(async (req, res) => {
  const { skill, difficulty } = req.query;

  const assessments = await listAssessments({ skill, difficulty });

  res.status(200).json({
    success: true,
    message: 'Assessments retrieved',
    data: { assessments },
  });
});

/**
 * GET /api/assessments/:assessmentId
 *
 * Fetches a single sanitized assessment definition for a student.
 * Never leaks answer keys, expected outputs, or internal explanations.
 */
export const getAssessmentHandler = asyncHandler(async (req, res) => {
  const { assessmentId } = req.params;

  const assessment = await getAssessment(assessmentId);

  res.status(200).json({
    success: true,
    message: 'Assessment retrieved',
    data: { assessment },
  });
});

/**
 * POST /api/assessments/:assessmentId/attempts or POST /api/assessments/attempts
 *
 * Starts a new assessment attempt for the authenticated student.
 * Reuses active in-progress attempt if one is already running (deduplication).
 */
export const startAttemptHandler = asyncHandler(async (req, res) => {
  const assessmentId = req.params.assessmentId || req.body?.assessmentId;

  if (!assessmentId || typeof assessmentId !== 'string' || assessmentId.trim().length === 0) {
    throw ApiError.badRequest('assessmentId parameter is required.', ERROR_CODES.VALIDATION_ERROR);
  }

  assertNoForbiddenClientFields(req.body);

  const attempt = await startAssessmentAttempt(req.auth.userId, {
    ...(req.body && typeof req.body === 'object' ? req.body : {}),
    assessmentId: assessmentId.trim(),
  });

  res.status(201).json({
    success: true,
    message: 'Assessment attempt started',
    data: { attempt },
  });
});

/**
 * POST /api/assessments/attempts/:attemptId/submit or POST /api/assessments/:assessmentId/submit
 *
 * Submits student answers, executes deterministic scoring, and records
 * verified evidence if eligible. Rejects any client-supplied scores or answer keys.
 */
export const submitAttemptHandler = asyncHandler(async (req, res) => {
  const attemptId = req.params.attemptId || req.body?.attemptId;
  const assessmentId = req.params.assessmentId || req.body?.assessmentId;

  if (!attemptId && !assessmentId) {
    throw ApiError.badRequest(
      'Either attemptId or assessmentId must be provided.',
      ERROR_CODES.VALIDATION_ERROR,
    );
  }

  assertNoForbiddenClientFields(req.body);

  const result = await submitAssessmentAttempt(req.auth.userId, {
    ...(req.body && typeof req.body === 'object' ? req.body : {}),
    attemptId,
    assessmentId,
    answers: req.body?.answers,
  });

  res.status(200).json({
    success: true,
    message: 'Assessment attempt submitted and evaluated',
    data: {
      attempt: result.attempt,
      evidenceResult: result.evidenceResult,
      evidenceStatus: result.evidenceStatus,
    },
  });
});

/**
 * GET /api/assessments/attempts/:attemptId
 *
 * Retrieves attempt details scoped strictly to the authenticated student.
 * Returns 404 if the attempt belongs to another student or does not exist.
 */
export const getAttemptHandler = asyncHandler(async (req, res) => {
  const { attemptId } = req.params;

  const attempt = await getAttemptById(req.auth.userId, attemptId);

  res.status(200).json({
    success: true,
    message: 'Assessment attempt retrieved',
    data: { attempt },
  });
});

/**
 * GET /api/assessments/attempts
 *
 * Lists all attempts for the authenticated student, optionally filtered by ?assessmentId=.
 */
export const listAttemptsHandler = asyncHandler(async (req, res) => {
  const { assessmentId } = req.query;

  const attempts = await listUserAttempts(req.auth.userId, { assessmentId });

  res.status(200).json({
    success: true,
    message: 'Assessment attempts retrieved',
    data: { attempts },
  });
});

/**
 * GET /api/assessments/:assessmentId/latest
 *
 * Retrieves the latest completed assessment result for the authenticated student.
 * Returns { attempt: null } if no completed attempts exist yet.
 */
export const getLatestResultHandler = asyncHandler(async (req, res) => {
  const { assessmentId } = req.params;

  const attempt = await getLatestAssessmentResult(req.auth.userId, assessmentId);

  const result = attempt
    ? {
        assessmentId: attempt.assessmentId,
        canonicalSkill: attempt.skillName || attempt.skillKey,
        difficulty: attempt.difficulty,
        score: attempt.score,
        earnedPoints: attempt.earnedPoints,
        maxPoints: attempt.maxPoints,
        passMark: attempt.passMark,
        passed: attempt.passed,
        outcome: attempt.outcome,
        evidenceStatus: attempt.evidenceCheckId
          ? 'verified'
          : attempt.passed
            ? 'supported'
            : 'unsupported',
        completedAt: attempt.completedAt,
        questionBreakdown: attempt.questionResults,
      }
    : null;

  res.status(200).json({
    success: true,
    message: attempt
      ? 'Latest assessment result retrieved'
      : 'No completed attempts for this assessment yet',
    data: { attempt, result },
  });
});
