import { post, request } from './apiClient.js';
import {
  INTERVIEW_DIFFICULTY,
  SESSION_STATUS,
} from '../constants/interviewOptions.js';

export { INTERVIEW_DIFFICULTY, SESSION_STATUS };

/**
 * Normalizes an interview session DTO from the backend.
 *
 * @param {object} raw
 * @returns {object}
 */
export function toInterviewSession(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid interview session data: expected an object.');
  }

  const id = raw.id || (raw._id ? String(raw._id) : '');
  return {
    id,
    sessionId: id,
    status: raw.status ?? SESSION_STATUS.INITIALIZED,
    targetRole: raw.targetRole ?? '',
    targetSkills: Array.isArray(raw.targetSkills) ? [...raw.targetSkills] : [],
    difficulty: raw.difficulty ?? INTERVIEW_DIFFICULTY.INTERMEDIATE,
    questionCount: typeof raw.questionCount === 'number' ? raw.questionCount : (raw.questions?.length ?? 5),
    currentQuestionIndex: typeof raw.currentQuestionIndex === 'number' ? raw.currentQuestionIndex : 0,
    evaluatorType: raw.evaluatorType ?? 'ai',
    evidenceCheck: raw.evidenceCheck ? String(raw.evidenceCheck) : null,
    providerMetadata: raw.providerMetadata ?? null,
    overallScore: typeof raw.overallScore === 'number' ? raw.overallScore : null,
    questions: Array.isArray(raw.questions)
      ? raw.questions.map((q) => ({
          questionId: q.questionId || q.id || '',
          order: typeof q.order === 'number' ? q.order : 0,
          type: q.type ?? 'conceptual',
          prompt: q.prompt ?? '',
          targetSkill: q.targetSkill ?? '',
          difficulty: q.difficulty ?? INTERVIEW_DIFFICULTY.INTERMEDIATE,
          rubricCriteria: Array.isArray(q.rubricCriteria) ? q.rubricCriteria : [],
          answer: q.answer ? { ...q.answer } : null,
          evaluation: q.evaluation ? { ...q.evaluation } : null,
        }))
      : [],
    startedAt: raw.startedAt ?? null,
    completedAt: raw.completedAt ?? null,
    expiresAt: raw.expiresAt ?? null,
    createdAt: raw.createdAt ?? null,
  };
}

/**
 * POST /api/interviews/sessions
 * Initializes a new interview session.
 *
 * @param {{ targetRole: string, targetSkills: string[], difficulty?: string, questionCount?: number }} payload
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function createInterviewSession(payload, { signal } = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Interview session configuration is required.');
  }

  const body = await post('/api/interviews/sessions', payload, { signal });
  const data = body?.data;
  if (!data?.session) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return { session: toInterviewSession(data.session) };
}

/**
 * GET /api/interviews/sessions
 * Lists all interview sessions for the authenticated user.
 *
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ sessions: object[], count: number }>}
 */
export async function fetchInterviewSessions({ signal } = {}) {
  const body = await request('/api/interviews/sessions', { signal });
  const data = body?.data;
  const sessions = Array.isArray(data?.sessions) ? data.sessions.map(toInterviewSession) : [];

  return { sessions, count: data?.count ?? sessions.length };
}

/**
 * GET /api/interviews/sessions/:sessionId
 * Retrieves a single session belonging to the authenticated student.
 *
 * @param {string} sessionId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function fetchInterviewSessionById(sessionId, { signal } = {}) {
  if (!sessionId) throw new Error('sessionId is required.');

  const body = await request(`/api/interviews/sessions/${encodeURIComponent(sessionId)}`, { signal });
  const data = body?.data;
  if (!data?.session) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return { session: toInterviewSession(data.session) };
}

/**
 * POST /api/interviews/sessions/:sessionId/start
 * Starts the initialized interview session.
 *
 * @param {string} sessionId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function startInterviewSession(sessionId, { signal } = {}) {
  if (!sessionId) throw new Error('sessionId is required.');

  const body = await post(`/api/interviews/sessions/${encodeURIComponent(sessionId)}/start`, {}, { signal });
  const data = body?.data;
  if (!data?.session) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return { session: toInterviewSession(data.session) };
}

/**
 * POST /api/interviews/sessions/:sessionId/questions/:questionId/answers
 * Submits candidate's answer for evaluation.
 *
 * @param {string} sessionId
 * @param {string} questionId
 * @param {{ answerText: string, durationSeconds?: number }} payload
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object, evaluatedQuestion: object, warnings?: string[] }>}
 */
export async function submitInterviewQuestionAnswer(sessionId, questionId, payload, { signal } = {}) {
  if (!sessionId) throw new Error('sessionId is required.');
  if (!questionId) throw new Error('questionId is required.');
  if (!payload || typeof payload.answerText !== 'string') {
    throw new Error('Candidate answer text is required.');
  }

  const body = await post(
    `/api/interviews/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/answers`,
    payload,
    { signal },
  );
  const data = body?.data;
  if (!data?.session) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return {
    session: toInterviewSession(data.session),
    evaluatedQuestion: data.evaluatedQuestion ?? null,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

/**
 * POST /api/interviews/sessions/:sessionId/complete
 * Completes the interview session, computing overall score and evidence.
 *
 * @param {string} sessionId
 * @param {object} [payload]
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object, overallScore: number|null, eligibleForVerified: boolean, evidenceResults?: object[], evidenceChecks?: object[] }>}
 */
export async function completeInterviewSession(sessionId, payload = {}, { signal } = {}) {
  if (!sessionId) throw new Error('sessionId is required.');

  const body = await post(
    `/api/interviews/sessions/${encodeURIComponent(sessionId)}/complete`,
    payload,
    { signal },
  );
  const data = body?.data;
  if (!data?.session) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return {
    session: toInterviewSession(data.session),
    overallScore: typeof data.overallScore === 'number' ? data.overallScore : (data.session.overallScore ?? null),
    eligibleForVerified: Boolean(data.eligibleForVerified),
    evidenceResults: Array.isArray(data.evidenceResults) ? data.evidenceResults : [],
    evidenceChecks: Array.isArray(data.evidenceChecks) ? data.evidenceChecks : [],
  };
}
