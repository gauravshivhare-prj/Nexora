import { AI_REQUEST_TIMEOUT_MS, post, request } from './apiClient.js';
import {
  ALLOWED_SESSION_TRANSITIONS,
  canTransitionSession,
  isSessionActive,
  isSessionExpired,
  canStartSession,
  canAnswerSession,
  canCompleteSession,
  canAbandonSession,
  isSessionPassed,
  EVALUATOR_TYPES,
  EVALUATOR_TYPE_LABELS,
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_LEVELS,
  INTERVIEW_DIFFICULTY_ORDER,
  INTERVIEW_DIFFICULTY_PRESENTATION,
  INTERVIEW_ERROR_CODES,
  INTERVIEW_ERROR_PRESENTATION,
  resolveInterviewError,
  INTERVIEW_EVIDENCE_STATUS,
  INTERVIEW_EVIDENCE_STATUS_PRESENTATION,
  resolveInterviewEvidenceStatus,
  INTERVIEW_LIMITS,
  INTERVIEW_PASS_MARK,
  INTERVIEW_QUESTION_TYPES,
  INTERVIEW_QUESTION_TYPE_LABELS,
  RUBRIC_DIMENSIONS,
  RUBRIC_DIMENSION_LABELS,
  RUBRIC_DIMENSION_WEIGHTS,
  SESSION_STATUS,
  SESSION_STATUS_PRESENTATION,
  TERMINAL_SESSION_STATUSES,
  isTerminalSessionStatus,
} from '../constants/interviewOptions.js';

// Re-export constants, timeout, and helpers
export {
  AI_REQUEST_TIMEOUT_MS,
  ALLOWED_SESSION_TRANSITIONS,
  canTransitionSession,
  isSessionActive,
  isSessionExpired,
  canStartSession,
  canAnswerSession,
  canCompleteSession,
  canAbandonSession,
  isSessionPassed,
  EVALUATOR_TYPES,
  EVALUATOR_TYPE_LABELS,
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_LEVELS,
  INTERVIEW_DIFFICULTY_ORDER,
  INTERVIEW_DIFFICULTY_PRESENTATION,
  INTERVIEW_ERROR_CODES,
  INTERVIEW_ERROR_PRESENTATION,
  resolveInterviewError,
  INTERVIEW_EVIDENCE_STATUS,
  INTERVIEW_EVIDENCE_STATUS_PRESENTATION,
  resolveInterviewEvidenceStatus,
  INTERVIEW_LIMITS,
  INTERVIEW_PASS_MARK,
  INTERVIEW_QUESTION_TYPES,
  INTERVIEW_QUESTION_TYPE_LABELS,
  RUBRIC_DIMENSIONS,
  RUBRIC_DIMENSION_LABELS,
  RUBRIC_DIMENSION_WEIGHTS,
  SESSION_STATUS,
  SESSION_STATUS_PRESENTATION,
  TERMINAL_SESSION_STATUSES,
  isTerminalSessionStatus,
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
          if (typeof s === 'string') return s;
          return s?.name ?? s?.key ?? String(s);
        })
      : [],
    difficulty: raw.difficulty ?? INTERVIEW_DIFFICULTY.INTERMEDIATE,
    questionCount: typeof raw.questionCount === 'number' ? raw.questionCount : (raw.questions?.length ?? 5),
    timeLimitMinutes: typeof raw.timeLimitMinutes === 'number' ? raw.timeLimitMinutes : 30,
    currentQuestionIndex: typeof raw.currentQuestionIndex === 'number' ? raw.currentQuestionIndex : 0,
    attemptCount: typeof raw.attemptCount === 'number' ? raw.attemptCount : 0,
    maxAttemptsTotal: typeof raw.maxAttemptsTotal === 'number' ? raw.maxAttemptsTotal : 10,
    attemptLimitPerQuestion: typeof raw.attemptLimitPerQuestion === 'number' ? raw.attemptLimitPerQuestion : 1,
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
    overallScore: typeof raw.overallScore === 'number' ? raw.overallScore : null,
    questions: Array.isArray(raw.questions) ? raw.questions.map(toInterviewQuestion) : [],
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

  const questionId = raw.questionId ?? raw.id ?? '';

  return {
    id: questionId,
    questionId,
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
    compositeScore:
      typeof raw.compositeScore === 'number'
        ? raw.compositeScore
        : (typeof raw.score === 'number' ? raw.score : null),
    feedback: raw.feedback ?? '',
    strengths: Array.isArray(raw.strengths) ? [...raw.strengths] : [],
    growthAreas: Array.isArray(raw.growthAreas) ? [...raw.growthAreas] : [],
    groundedSkills: Array.isArray(raw.groundedSkills) ? [...raw.groundedSkills] : [],
    evaluatedAt: raw.evaluatedAt ?? null,
  };
}

/**
 * Normalizes an evidence check record associated with a completed session.
 *
 * @param {object} raw
 * @returns {object} Clean evidence check DTO
 */
export function toInterviewEvidenceCheck(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid interview evidence check data: expected an object.');
  }

  return {
    id: String(raw.id || raw._id || ''),
    kind: raw.kind ?? 'interview',
    skillKey: raw.skillKey ?? '',
    skillName: raw.skillName ?? '',
    score: typeof raw.score === 'number' ? raw.score : 0,
    passMark: typeof raw.passMark === 'number' ? raw.passMark : INTERVIEW_PASS_MARK,
    outcome: raw.outcome ?? 'uncertain',
    eligibleForVerified: Boolean(raw.eligibleForVerified),
    evaluatedBy: raw.evaluatedBy ?? 'ai',
    reference: String(raw.reference ?? ''),
    completedAt: raw.completedAt ?? null,
  };
}

/**
 * Normalizes an evidence result returned upon session completion.
 *
 * @param {object} raw
 * @returns {object} Clean evidence result DTO
 */
export function toInterviewEvidenceResult(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid interview evidence result data: expected an object.');
  }

  return {
    skillKey: raw.skillKey ?? raw.skill ?? '',
    skillName: raw.skillName ?? raw.skill ?? '',
    score: typeof raw.score === 'number' ? raw.score : 0,
    passMark: typeof raw.passMark === 'number' ? raw.passMark : INTERVIEW_PASS_MARK,
    outcome: raw.outcome ?? 'uncertain',
    eligibleForVerified: Boolean(raw.eligibleForVerified),
    evidenceStrength: raw.evidenceStrength ?? (raw.eligibleForVerified ? 'verified' : 'supported'),
    evaluatedBy: raw.evaluatedBy ?? 'ai',
    kind: raw.kind ?? 'interview',
  };
}

/**
 * POST /api/interviews/sessions
 * Initializes a new interview session.
 *
 * @param {{ targetRole?: string, targetRoleId?: string, targetSkills?: string[], skills?: string[], difficulty?: string, questionCount?: number, evaluatorType?: string }} payload
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function createInterviewSession(payload = {}, { signal } = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Interview session configuration is required.');
  }

  const requestPayload = {
    ...payload,
    ...(payload.targetRoleId && !payload.targetRole ? { targetRole: payload.targetRoleId } : {}),
    ...(payload.skills && !payload.targetSkills ? { targetSkills: payload.skills } : {}),
  };

  const body = await post('/api/interviews/sessions', requestPayload, { signal });
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

  return {
    sessions,
    count: typeof data?.count === 'number' ? data.count : sessions.length,
  };
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
 * @param {{ answerText?: string, answer?: string, durationSeconds?: number }} payload
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object, evaluatedQuestion: object, evaluation?: object, warnings?: string[] }>}
 */
export async function submitInterviewQuestionAnswer(sessionId, questionId, payload, { signal } = {}) {
  if (!sessionId) throw new Error('sessionId is required.');
  if (!questionId) throw new Error('questionId is required.');
  if (!payload || typeof payload !== 'object') {
    throw new Error('Candidate answer text is required.');
  }
  const answerText = typeof payload.answerText === 'string' ? payload.answerText : payload.answer;
  if (typeof answerText !== 'string') {
    throw new Error('Candidate answer text is required.');
  }

  const requestPayload = {
    ...payload,
    answerText,
  };

  const body = await post(
    `/api/interviews/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/answers`,
    requestPayload,
    { timeoutMs: AI_REQUEST_TIMEOUT_MS, signal },
  );
  const data = body?.data;
  if (!data?.session) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  const evaluatedQuestion = data.evaluatedQuestion ? toInterviewQuestion(data.evaluatedQuestion) : null;

  return {
    session: toInterviewSession(data.session),
    evaluatedQuestion,
    evaluation: evaluatedQuestion?.evaluation || data.evaluation || null,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

/**
 * Alias for submitInterviewQuestionAnswer supporting both { answer } and { answerText } payloads.
 */
export const submitInterviewAnswer = submitInterviewQuestionAnswer;

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
    overallScore: typeof data.overallScore === 'number' ? data.overallScore : (data.session?.overallScore ?? null),
    eligibleForVerified: Boolean(data.eligibleForVerified),
    evidenceResults: Array.isArray(data.evidenceResults) ? data.evidenceResults.map(toInterviewEvidenceResult) : [],
    evidenceChecks: Array.isArray(data.evidenceChecks) ? data.evidenceChecks.map(toInterviewEvidenceCheck) : [],
  };
}

/**
 * POST /api/interviews/sessions/:sessionId/abandon
 * Abandons an active interview session.
 *
 * @param {string} sessionId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ session: object }>}
 */
export async function abandonInterviewSession(sessionId, { signal } = {}) {
  if (!sessionId) throw new Error('sessionId is required.');

  const body = await post(`/api/interviews/sessions/${encodeURIComponent(sessionId)}/abandon`, {}, { signal });
  const data = body?.data;
  if (!data?.session) {
    throw new Error('The backend returned an unexpected interview session response.');
  }

  return { session: toInterviewSession(data.session) };
}
