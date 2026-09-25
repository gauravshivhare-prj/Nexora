import { post, request } from './apiClient.js';
import {
  EVALUATOR_TYPES,
  EVALUATOR_TYPE_LABELS,
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_LEVELS,
  INTERVIEW_DIFFICULTY_ORDER,
  INTERVIEW_DIFFICULTY_PRESENTATION,
  INTERVIEW_LIMITS,
  INTERVIEW_PASS_MARK,
  INTERVIEW_QUESTION_TYPES,
  INTERVIEW_QUESTION_TYPE_LABELS,
  RUBRIC_DIMENSIONS,
  RUBRIC_DIMENSION_LABELS,
  RUBRIC_DIMENSION_WEIGHTS,
  SESSION_STATUS,
  SESSION_STATUS_PRESENTATION,
} from '../constants/interviewOptions.js';

// Re-export constants for easy access by UI consumers
export {
  EVALUATOR_TYPES,
  EVALUATOR_TYPE_LABELS,
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_LEVELS,
  INTERVIEW_DIFFICULTY_ORDER,
  INTERVIEW_DIFFICULTY_PRESENTATION,
  INTERVIEW_LIMITS,
  INTERVIEW_PASS_MARK,
  INTERVIEW_QUESTION_TYPES,
  INTERVIEW_QUESTION_TYPE_LABELS,
  RUBRIC_DIMENSIONS,
  RUBRIC_DIMENSION_LABELS,
  RUBRIC_DIMENSION_WEIGHTS,
  SESSION_STATUS,
  SESSION_STATUS_PRESENTATION,
};

/**
 * Normalizes an interview session record from the backend response.
 * Strips internal database fields, user IDs, and Mongoose version keys.
 *
 * @param {object} raw
 * @returns {object} Public session DTO safe for UI consumption
 */
export function toInterviewSession(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid interview session data: expected an object.');
  }

  const id = String(raw.id || raw._id || raw.sessionId || '');

  return {
    id,
    sessionId: id,
    status: raw.status ?? SESSION_STATUS.INITIALIZED,
    targetRole: raw.targetRole ?? '',
    targetSkills: Array.isArray(raw.targetSkills)
      ? raw.targetSkills.map((s) => {
          if (typeof s === 'string') return { key: s.toLowerCase().replace(/[^a-z0-9]/g, ''), name: s };
          return {
            key: s?.key ?? '',
            name: s?.name ?? s?.key ?? '',
          };
        })
      : [],
    difficulty: raw.difficulty ?? INTERVIEW_DIFFICULTY.INTERMEDIATE,
    questionCount: typeof raw.questionCount === 'number' ? raw.questionCount : 0,
    currentQuestionIndex: typeof raw.currentQuestionIndex === 'number' ? raw.currentQuestionIndex : 0,
    attemptCount: typeof raw.attemptCount === 'number' ? raw.attemptCount : 0,
    maxAttemptsTotal: typeof raw.maxAttemptsTotal === 'number' ? raw.maxAttemptsTotal : 10,
    attemptLimitPerQuestion: typeof raw.attemptLimitPerQuestion === 'number' ? raw.attemptLimitPerQuestion : 1,
    questions: Array.isArray(raw.questions) ? raw.questions.map(toInterviewQuestion) : [],
    overallScore: typeof raw.overallScore === 'number' ? raw.overallScore : null,
    evaluatorType: raw.evaluatorType ?? EVALUATOR_TYPES.AI,
    evidenceCheck: raw.evidenceCheck ? String(raw.evidenceCheck) : null,
    providerMetadata: raw.providerMetadata
      ? {
          provider: raw.providerMetadata.provider ?? null,
          model: raw.providerMetadata.model ?? null,
          latencyMs: raw.providerMetadata.latencyMs ?? null,
          contractVersion: raw.providerMetadata.contractVersion ?? INTERVIEW_CONTRACT_VERSION,
        }
      : null,
    startedAt: raw.startedAt ?? null,
    completedAt: raw.completedAt ?? null,
    expiresAt: raw.expiresAt ?? null,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

/**
 * Normalizes an interview question subdocument from the backend response.
 *
 * @param {object} raw
 * @returns {object} Clean question DTO
 */
export function toInterviewQuestion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid interview question data: expected an object.');
  }

  return {
    questionId: raw.questionId ?? raw.id ?? '',
    order: typeof raw.order === 'number' ? raw.order : 1,
    type: raw.type ?? INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
    prompt: raw.prompt ?? '',
    targetSkill: raw.targetSkill ?? raw.targetSkillName ?? raw.targetSkillKey ?? '',
    difficulty: raw.difficulty ?? INTERVIEW_DIFFICULTY.INTERMEDIATE,
    rubricCriteria: Array.isArray(raw.rubricCriteria) ? [...raw.rubricCriteria] : [],
    answer: raw.answer
      ? {
          answerText: raw.answer.answerText ?? '',
          submittedAt: raw.answer.submittedAt ?? null,
          durationSeconds: typeof raw.answer.durationSeconds === 'number' ? raw.answer.durationSeconds : null,
          attemptNumber: typeof raw.answer.attemptNumber === 'number' ? raw.answer.attemptNumber : 1,
        }
      : null,
    evaluation: raw.evaluation ? toInterviewEvaluation(raw.evaluation) : null,
  };
}

/**
 * Normalizes an evaluation subdocument on an answered question.
 *
 * @param {object} raw
 * @returns {object} Clean evaluation DTO
 */
export function toInterviewEvaluation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid interview evaluation data: expected an object.');
  }

  const dimensions = raw.dimensions && typeof raw.dimensions === 'object'
    ? {
        accuracy: typeof raw.dimensions.accuracy === 'number' ? raw.dimensions.accuracy : 0,
        depth: typeof raw.dimensions.depth === 'number' ? raw.dimensions.depth : 0,
        clarity: typeof raw.dimensions.clarity === 'number' ? raw.dimensions.clarity : 0,
        relevance: typeof raw.dimensions.relevance === 'number' ? raw.dimensions.relevance : 0,
      }
    : null;

  return {
    dimensions,
    compositeScore: typeof raw.compositeScore === 'number' ? raw.compositeScore : null,
    feedback: raw.feedback ?? '',
    strengths: Array.isArray(raw.strengths) ? [...raw.strengths] : [],
    growthAreas: Array.isArray(raw.growthAreas) ? [...raw.growthAreas] : [],
    groundedSkills: Array.isArray(raw.groundedSkills) ? [...raw.groundedSkills] : [],
    evaluatedAt: raw.evaluatedAt ?? null,
  };
}

/**
 * POST /api/interviews/sessions
 * Initializes a new mock interview session targeting a role and canonical skills.
 *
 * @param {object} payload
 * @param {string} payload.targetRole Name or ID of role from catalogue
 * @param {string[]} payload.targetSkills List of canonical skills to evaluate
 * @param {string} [payload.difficulty] 'beginner' | 'intermediate' | 'advanced'
 * @param {number} [payload.questionCount] Number of questions to generate (1-10)
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function createInterviewSession(payload, { signal } = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Interview session payload is required.');
  }

  const body = await post('/api/interviews/sessions', payload, { signal });

  const session = body?.data?.session;
  if (!session) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return { session: toInterviewSession(session) };
}

/**
 * GET /api/interviews/sessions
 * Lists all interview sessions belonging to the authenticated student.
 *
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ sessions: Array<object>, count: number }>}
 */
export async function fetchInterviewSessions({ signal } = {}) {
  const body = await request('/api/interviews/sessions', { signal });

  const data = body?.data;
  if (!Array.isArray(data?.sessions)) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return {
    sessions: data.sessions.map(toInterviewSession),
    count: typeof data.count === 'number' ? data.count : data.sessions.length,
  };
}

/**
 * GET /api/interviews/sessions/:sessionId
 * Retrieves a single session owned by the caller with questions and evaluations.
 *
 * @param {string} sessionId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function fetchInterviewSessionById(sessionId, { signal } = {}) {
  if (!sessionId) throw new Error('sessionId is required.');

  const body = await request(`/api/interviews/sessions/${encodeURIComponent(sessionId)}`, { signal });

  const session = body?.data?.session;
  if (!session) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return { session: toInterviewSession(session) };
}

/**
 * POST /api/interviews/sessions/:sessionId/start
 * Transitions an initialized session to in_progress.
 *
 * @param {string} sessionId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function startInterviewSession(sessionId, { signal } = {}) {
  if (!sessionId) throw new Error('sessionId is required.');

  const body = await post(`/api/interviews/sessions/${encodeURIComponent(sessionId)}/start`, {}, { signal });

  const session = body?.data?.session;
  if (!session) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return { session: toInterviewSession(session) };
}

/**
 * POST /api/interviews/sessions/:sessionId/questions/:questionId/answers
 * Submits an answer for AI evaluation and updates the session question state.
 *
 * @param {string} sessionId
 * @param {string} questionId
 * @param {object} payload
 * @param {string} payload.answerText Candidate answer (10-5000 chars)
 * @param {number} [payload.durationSeconds] Duration spent answering
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object, evaluatedQuestion: object, warnings?: string[] }>}
 */
export async function submitInterviewAnswer(sessionId, questionId, payload, { signal } = {}) {
  if (!sessionId) throw new Error('sessionId is required.');
  if (!questionId) throw new Error('questionId is required.');
  if (!payload || typeof payload !== 'object') {
    throw new Error('Answer payload is required.');
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
    evaluatedQuestion: data.evaluatedQuestion ? toInterviewQuestion(data.evaluatedQuestion) : null,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

/**
 * POST /api/interviews/sessions/:sessionId/complete
 * Finalizes the session, computes the composite overall score, and persists SkillEvidenceCheck.
 *
 * @param {string} sessionId
 * @param {object} [payload] Optional evaluator parameters (e.g. evaluatorType)
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object, overallScore: number, eligibleForVerified: boolean, evidenceResults?: Array<object> }>}
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
    overallScore: typeof data.overallScore === 'number' ? data.overallScore : (data.session?.overallScore ?? null),
    eligibleForVerified: Boolean(data.eligibleForVerified),
    evidenceResults: Array.isArray(data.evidenceResults) ? data.evidenceResults : [],
  };
}

/**
 * POST /api/interviews/sessions/:sessionId/abandon
 * Abandons an active interview session, moving it to terminal 'abandoned' state.
 *
 * @param {string} sessionId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function abandonInterviewSession(sessionId, { signal } = {}) {
  if (!sessionId) throw new Error('sessionId is required.');

  const body = await post(
    `/api/interviews/sessions/${encodeURIComponent(sessionId)}/abandon`,
    {},
    { signal },
  );

  const session = body?.data?.session;
  if (!session) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return { session: toInterviewSession(session) };
}
