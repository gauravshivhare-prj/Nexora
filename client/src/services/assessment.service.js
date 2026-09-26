import { post, request } from './apiClient.js';
import {
  ATTEMPT_STATUS,
  DIFFICULTY_LEVEL,
  DIFFICULTY_ORDER,
  EVALUATION_OUTCOME,
  EVIDENCE_STATUS,
  QUESTION_RESULT_STATUS,
  QUESTION_TYPE,
  SUBMISSION_LIMITS,
} from '../constants/assessmentOptions.js';

// Re-export constants for easy access by UI consumers
export {
  ATTEMPT_STATUS,
  DIFFICULTY_LEVEL,
  DIFFICULTY_ORDER,
  EVALUATION_OUTCOME,
  EVIDENCE_STATUS,
  QUESTION_RESULT_STATUS,
  QUESTION_TYPE,
  SUBMISSION_LIMITS,
};

/**
 * Normalizes an assessment catalog item from the backend response.
 * Strips any internal secrets and ensures deterministic field defaults.
 *
 * @param {object} raw
 * @returns {object}
 */
export function toAssessment(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid assessment data: expected an object.');
  }

  const assessmentId = raw.assessmentId || raw.id || raw.slug || '';
  return {
    assessmentId,
    id: assessmentId,
    slug: raw.slug || assessmentId,
    title: raw.title ?? '',
    description: raw.description ?? '',
    canonicalSkill: raw.canonicalSkill || raw.skillName || raw.skillKey || '',
    skillKey: raw.skillKey || '',
    skillName: raw.skillName || raw.canonicalSkill || raw.skillKey || '',
    difficulty: raw.difficulty ?? DIFFICULTY_LEVEL.BEGINNER,
    version: raw.version ?? 1,
    durationMinutes: typeof raw.durationMinutes === 'number' ? raw.durationMinutes : (typeof raw.timeLimitMinutes === 'number' ? raw.timeLimitMinutes : 0),
    timeLimitMinutes: typeof raw.timeLimitMinutes === 'number' ? raw.timeLimitMinutes : (typeof raw.durationMinutes === 'number' ? raw.durationMinutes : 0),
    passMark: typeof raw.passMark === 'number' ? raw.passMark : 0.7,
    totalQuestions: typeof raw.totalQuestions === 'number' ? raw.totalQuestions : (raw.questions?.length ?? 0),
    questions: Array.isArray(raw.questions)
      ? raw.questions.map((q) => ({
          questionId: q.questionId || q.id || '',
          id: q.id || q.questionId || '',
          prompt: q.prompt ?? '',
          type: q.type ?? QUESTION_TYPE.SINGLE_CHOICE,
          weight: typeof q.weight === 'number' ? q.weight : 1,
          codeSnippet: q.codeSnippet ?? null,
          options: Array.isArray(q.options)
            ? q.options.map((opt) => ({
                id: opt.id ?? '',
                text: opt.text ?? '',
              }))
            : [],
        }))
      : [],
  };
}

/**
 * Normalizes an assessment attempt record from the backend response.
 *
 * @param {object} raw
 * @returns {object}
 */
export function toAssessmentAttempt(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid assessment attempt data: expected an object.');
  }

  const attemptId = raw.attemptId || raw.id || (raw._id ? String(raw._id) : '');
  return {
    attemptId,
    id: attemptId,
    assessmentId: raw.assessmentId ?? '',
    attemptNumber: typeof raw.attemptNumber === 'number' ? raw.attemptNumber : 1,
    status: raw.status ?? ATTEMPT_STATUS.IN_PROGRESS,
    startedAt: raw.startedAt ?? null,
    expiresAt: raw.expiresAt ?? null,
    submittedAt: raw.submittedAt ?? null,
    timeSpentSeconds: typeof raw.timeSpentSeconds === 'number' ? raw.timeSpentSeconds : null,
    timeLimitMinutes: typeof raw.timeLimitMinutes === 'number' ? raw.timeLimitMinutes : null,
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    result: raw.result ? toAssessmentResult(raw.result) : null,
    evidenceCheck: raw.evidenceCheck ?? null,
  };
}

/**
 * Normalizes an evaluation result payload from the backend response.
 *
 * @param {object} raw
 * @returns {object}
 */
export function toAssessmentResult(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid assessment result data: expected an object.');
  }

  return {
    assessmentId: raw.assessmentId ?? '',
    canonicalSkill: raw.canonicalSkill ?? raw.skillName ?? raw.skillKey ?? '',
    difficulty: raw.difficulty ?? '',
    score: typeof raw.score === 'number' ? raw.score : 0,
    earnedPoints: typeof raw.earnedPoints === 'number' ? raw.earnedPoints : 0,
    maxPoints: typeof raw.maxPoints === 'number' ? raw.maxPoints : 0,
    passMark: typeof raw.passMark === 'number' ? raw.passMark : 0.7,
    passed: Boolean(raw.passed),
    outcome: raw.outcome ?? (raw.passed ? EVALUATION_OUTCOME.PASS : EVALUATION_OUTCOME.FAIL),
    evidenceStatus: raw.evidenceStatus ?? (raw.evidenceCheckId ? EVIDENCE_STATUS.VERIFIED : (raw.passed ? EVIDENCE_STATUS.SUPPORTED : EVIDENCE_STATUS.UNSUPPORTED)),
    completedAt: raw.completedAt ?? null,
    questionBreakdown: Array.isArray(raw.questionBreakdown || raw.questionResults)
      ? (raw.questionBreakdown || raw.questionResults).map((item) => ({
          questionId: item.questionId ?? '',
          status: item.status ?? (item.isCorrect ? QUESTION_RESULT_STATUS.CORRECT : QUESTION_RESULT_STATUS.INCORRECT),
          earnedPoints: typeof item.earnedPoints === 'number' ? item.earnedPoints : 0,
          maxPoints: typeof item.maxPoints === 'number' ? item.maxPoints : 1,
          studentAnswer: item.studentAnswer ?? item.selectedOption ?? null,
          selectedOption: item.selectedOption ?? item.studentAnswer ?? null,
        }))
      : [],
  };
}

/**
 * GET /api/assessments
 * Lists sanitized assessments from the catalog, optionally filtered by skill or difficulty.
 *
 * @param {{ skill?: string, difficulty?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<{ assessments: Array<object> }>}
 */
export async function fetchAssessments({ skill, difficulty, signal } = {}) {
  const query = new URLSearchParams();
  if (skill) query.set('skill', skill);
  if (difficulty) query.set('difficulty', difficulty);

  const suffix = query.toString() ? `?${query}` : '';
  const body = await request(`/api/assessments${suffix}`, { signal });

  const data = body?.data;
  if (!Array.isArray(data?.assessments)) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return { assessments: data.assessments.map(toAssessment) };
}

/**
 * GET /api/assessments/:assessmentId
 * Fetches a single sanitized assessment with its questions.
 *
 * @param {string} assessmentId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ assessment: object }>}
 */
export async function fetchAssessmentById(assessmentId, { signal } = {}) {
  if (!assessmentId) throw new Error('assessmentId is required.');

  const body = await request(`/api/assessments/${encodeURIComponent(assessmentId)}`, { signal });

  const data = body?.data;
  if (!data?.assessment) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return { assessment: toAssessment(data.assessment) };
}

/**
 * POST /api/assessments/:assessmentId/attempts
 * Starts a new attempt or resumes an active in-progress attempt for the authenticated user.
 *
 * @param {string} assessmentId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ attempt: object, assessment: object|null }>}
 */
export async function startAssessmentAttempt(assessmentId, { signal } = {}) {
  if (!assessmentId) throw new Error('assessmentId is required.');

  const body = await post(`/api/assessments/${encodeURIComponent(assessmentId)}/attempts`, {}, { signal });

  const data = body?.data;
  if (!data?.attempt) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return {
    attempt: toAssessmentAttempt(data.attempt),
    assessment: data.assessment ? toAssessment(data.assessment) : null,
  };
}

/**
 * POST /api/assessments/attempts/:attemptId/submit
 * Submits answers for evaluation, transitions attempt state, and records evidence.
 *
 * @param {string} attemptId
 * @param {{ answers: Array<{ questionId: string, answer: any }>, timeSpentSeconds?: number }} payload
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ attempt: object, result: object, verification: object|null }>}
 */
export async function submitAssessmentAttempt(attemptId, { answers, timeSpentSeconds } = {}, { signal } = {}) {
  if (!attemptId) throw new Error('attemptId is required.');
  if (!Array.isArray(answers)) throw new Error('answers must be an array.');

  const body = await post(
    `/api/assessments/attempts/${encodeURIComponent(attemptId)}/submit`,
    { answers, timeSpentSeconds },
    { signal },
  );

  const data = body?.data;
  if (!data?.attempt) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  const rawResult = data.result || data.attempt;

  return {
    attempt: toAssessmentAttempt(data.attempt),
    result: toAssessmentResult(rawResult),
    verification: data.verification ?? data.evidenceResult ?? null,
  };
}

/**
 * GET /api/assessments/attempts/:attemptId
 * Fetches an attempt owned by the current student with its result details.
 *
 * @param {string} attemptId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ attempt: object }>}
 */
export async function fetchAttemptById(attemptId, { signal } = {}) {
  if (!attemptId) throw new Error('attemptId is required.');

  const body = await request(`/api/assessments/attempts/${encodeURIComponent(attemptId)}`, { signal });

  const data = body?.data;
  if (!data?.attempt) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return { attempt: toAssessmentAttempt(data.attempt) };
}

/**
 * GET /api/assessments/attempts
 * Lists the student's attempt history in reverse chronological order.
 *
 * @param {{ assessmentId?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<{ attempts: Array<object> }>}
 */
export async function fetchUserAttempts({ assessmentId, signal } = {}) {
  const query = new URLSearchParams();
  if (assessmentId) query.set('assessmentId', assessmentId);

  const suffix = query.toString() ? `?${query}` : '';
  const body = await request(`/api/assessments/attempts${suffix}`, { signal });

  const data = body?.data;
  if (!Array.isArray(data?.attempts)) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  return { attempts: data.attempts.map(toAssessmentAttempt) };
}

/**
 * GET /api/assessments/:assessmentId/latest
 * Fetches the student's latest completed assessment result for an assessment.
 *
 * @param {string} assessmentId
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ result: object|null }>}
 */
export async function fetchLatestAssessmentResult(assessmentId, { signal } = {}) {
  if (!assessmentId) throw new Error('assessmentId is required.');

  const body = await request(`/api/assessments/${encodeURIComponent(assessmentId)}/latest`, { signal });

  const data = body?.data;
  if (data === undefined) {
    throw new Error('The backend returned an unexpected response shape.');
  }

  const rawResult = data?.result ?? (data?.attempt?.score !== undefined ? data.attempt : null);

  return {
    attempt: data?.attempt ? toAssessmentAttempt(data.attempt) : null,
    result: rawResult ? toAssessmentResult(rawResult) : null,
  };
}
