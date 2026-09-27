import { AI_REQUEST_TIMEOUT_MS, post, request } from './apiClient.js';

/**
 * Client service adapter for Nexora AI mock interview sessions.
 * Communicates with /api/interviews/sessions endpoints.
 */

/**
 * Initializes a new interview session.
 *
 * @param {{ targetRoleId: string, skills?: string[] }} payload
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function createInterviewSession({ targetRoleId, skills = [] } = {}, { signal } = {}) {
  const body = await post('/api/interviews/sessions', { targetRoleId, skills }, { signal });
  if (!body?.data?.session) {
    throw new Error('The backend returned an unexpected interview session response.');
  }
  return { session: body.data.session };
}

/**
 * Lists the authenticated user's interview sessions.
 *
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ sessions: object[] }>}
 */
export async function fetchInterviewSessions({ signal } = {}) {
  const body = await request('/api/interviews/sessions', { signal });
  if (!Array.isArray(body?.data?.sessions)) {
    throw new Error('The backend returned an unexpected interview sessions response.');
  }
  return { sessions: body.data.sessions };
}

/**
 * Retrieves details of a single interview session.
 *
 * @param {string} sessionId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function fetchInterviewSessionById(sessionId, { signal } = {}) {
  const body = await request(`/api/interviews/sessions/${encodeURIComponent(sessionId)}`, { signal });
  if (!body?.data?.session) {
    throw new Error('The backend returned an unexpected interview session response.');
  }
  return { session: body.data.session };
}

/**
 * Starts an initialized interview session, transitioning it to in_progress.
 *
 * @param {string} sessionId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function startInterviewSession(sessionId, { signal } = {}) {
  const body = await post(`/api/interviews/sessions/${encodeURIComponent(sessionId)}/start`, {}, { signal });
  if (!body?.data?.session) {
    throw new Error('The backend returned an unexpected interview session response.');
  }
  return { session: body.data.session };
}

/**
 * Submits an answer to a question in the interview session and runs AI evaluation.
 *
 * @param {string} sessionId
 * @param {string} questionId
 * @param {{ answer: string }} payload
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ evaluation: object, session: object }>}
 */
export async function submitInterviewAnswer(sessionId, questionId, { answer } = {}, { signal } = {}) {
  const body = await post(
    `/api/interviews/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/answers`,
    { answer },
    { timeoutMs: AI_REQUEST_TIMEOUT_MS, signal },
  );
  if (!body?.data) {
    throw new Error('The backend returned an unexpected answer evaluation response.');
  }
  return body.data;
}

/**
 * Completes an active interview session, computing final score and recording evidence.
 *
 * @param {string} sessionId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function completeInterviewSession(sessionId, { signal } = {}) {
  const body = await post(`/api/interviews/sessions/${encodeURIComponent(sessionId)}/complete`, {}, { signal });
  if (!body?.data?.session) {
    throw new Error('The backend returned an unexpected interview completion response.');
  }
  return { session: body.data.session };
}

/**
 * Abandons an active interview session.
 *
 * @param {string} sessionId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function abandonInterviewSession(sessionId, { signal } = {}) {
  const body = await post(`/api/interviews/sessions/${encodeURIComponent(sessionId)}/abandon`, {}, { signal });
  if (!body?.data?.session) {
    throw new Error('The backend returned an unexpected interview session response.');
  }
  return { session: body.data.session };
}
