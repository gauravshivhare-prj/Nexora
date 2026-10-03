import {
  abandonSession,
  completeSession,
  createSession,
  getInterviewDifficultySuggestion,
  getSession,
  listSessions,
  startSession,
  submitQuestionAnswer,
} from '../services/interviewSession.service.js';
import { generateSessionReport } from '../services/interviewReport.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, formatPagination } from '../utils/pagination.js';
import { clientGoneSignal } from '../utils/requestSignal.js';

/**
 * GET /api/interviews/suggest-difficulty
 * Suggests starting difficulty based on student's CareerTwin evidence and preferences.
 */
export const suggestDifficulty = asyncHandler(async (req, res) => {
  const skillsQuery = req.query.skills || req.query.targetSkills;
  const targetSkills = typeof skillsQuery === 'string'
    ? skillsQuery.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const suggestion = await getInterviewDifficultySuggestion(req.auth.userId, {
    targetSkills,
    targetRole: req.query.targetRole || req.query.roleId,
  });

  res.status(200).json({
    success: true,
    message: 'Interview difficulty suggestion generated',
    data: suggestion,
  });
});

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
  const { page, limit, skip } = parsePagination(req.query, 20, 100);
  const result = await listSessions(req.auth.userId, { page, limit, skip });
  const sessions = Array.isArray(result) ? result : result.sessions;
  const pagination = Array.isArray(result)
    ? formatPagination({ page, limit, total: sessions.length })
    : result.pagination;

  res.status(200).json({
    success: true,
    message: sessions.length > 0 ? 'Interview sessions retrieved' : 'No interview sessions found',
    data: { sessions, count: sessions.length, pagination },
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

/**
 * GET /api/interviews/sessions/:sessionId/report
 *
 * Returns a structured post-interview report for a completed session.
 * Report includes: session summary, per-question results, per-skill breakdown,
 * aggregated strengths/growth areas, evidence summary, and next steps.
 *
 * Only the session owner may access the report.
 * Only completed sessions can produce a report.
 */
export const report = asyncHandler(async (req, res) => {
  const data = await generateSessionReport(req.auth.userId, req.params.sessionId);

  res.status(200).json({
    success: true,
    message: 'Interview session report generated',
    data,
  });
});
