import {
  abandonSession,
  completeSession,
  createSession,
  getSession,
  listSessions,
  startSession,
  submitQuestionAnswer,
} from '../services/interviewSession.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { clientGoneSignal } from '../utils/requestSignal.js';

/**
 * POST /api/interviews/sessions
 * Initializes a new interview session for the authenticated student.
 */
export const create = asyncHandler(async (req, res) => {
  const session = await createSession(req.auth.userId, req.body);

  res.status(201).json({
    success: true,
    message: 'Interview session initialized',
    data: { session },
  });
});

/**
 * GET /api/interviews/sessions
 * Lists all interview sessions belonging to the authenticated student.
 */
export const list = asyncHandler(async (req, res) => {
  const sessions = await listSessions(req.auth.userId);

  res.status(200).json({
    success: true,
    message: sessions.length > 0 ? 'Interview sessions retrieved' : 'No interview sessions found',
    data: { sessions, count: sessions.length },
  });
});

/**
 * GET /api/interviews/sessions/:sessionId
 * Retrieves a single session belonging to the caller.
 */
export const read = asyncHandler(async (req, res) => {
  const session = await getSession(req.auth.userId, req.params.sessionId);

  res.status(200).json({
    success: true,
    message: 'Interview session retrieved',
    data: { session },
  });
});

/**
 * POST /api/interviews/sessions/:sessionId/start
 * Transitions an initialized session to in_progress.
 */
export const start = asyncHandler(async (req, res) => {
  const session = await startSession(req.auth.userId, req.params.sessionId);

  res.status(200).json({
    success: true,
    message: 'Interview session started',
    data: { session },
  });
});

/**
 * POST /api/interviews/sessions/:sessionId/questions/:questionId/answers
 * Submits an answer for evaluation.
 */
export const submitAnswer = asyncHandler(async (req, res) => {
  const result = await submitQuestionAnswer(
    req.auth.userId,
    req.params.sessionId,
    req.params.questionId,
    req.body,
    {
      signal: clientGoneSignal(res),
    },
  );

  res.status(200).json({
    success: true,
    message: 'Answer submitted and evaluated',
    data: result,
  });
});

/**
 * POST /api/interviews/sessions/:sessionId/complete
 * Finalizes the interview session and calculates overall score.
 */
export const complete = asyncHandler(async (req, res) => {
  const result = await completeSession(req.auth.userId, req.params.sessionId, {
    evaluatorType: req.body?.evaluatorType,
  });

  res.status(200).json({
    success: true,
    message: 'Interview session completed',
    data: result,
  });
});

/**
 * POST /api/interviews/sessions/:sessionId/abandon
 * Abandons an active interview session.
 */
export const abandon = asyncHandler(async (req, res) => {
  const session = await abandonSession(req.auth.userId, req.params.sessionId);

  res.status(200).json({
    success: true,
    message: 'Interview session abandoned',
    data: { session },
  });
});
