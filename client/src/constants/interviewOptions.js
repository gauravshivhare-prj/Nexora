/**
 * Client-side interview contract options, constants, and presentation tokens.
 *
 * Mirrors the canonical values in server/src/domain/interview/interviewContract.js
 * while providing UI-ready presentation mappings adhering to the Sunset Warm theme.
 */

/** AI Interview Domain Contract Version. */
export const INTERVIEW_CONTRACT_VERSION = 1;

/** Standard passing mark threshold for interview evaluations (75%). */
export const INTERVIEW_PASS_MARK = 0.75;

/** Standard difficulty tiers for interview sessions. */
export const INTERVIEW_DIFFICULTY = Object.freeze({
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
});

// Alias for plural convention
export const INTERVIEW_DIFFICULTY_LEVELS = INTERVIEW_DIFFICULTY;

/** Ordered list of difficulty tiers from easiest to hardest. */
export const INTERVIEW_DIFFICULTY_ORDER = Object.freeze([
  INTERVIEW_DIFFICULTY.BEGINNER,
  INTERVIEW_DIFFICULTY.INTERMEDIATE,
  INTERVIEW_DIFFICULTY.ADVANCED,
]);

/** UI presentation tokens for each difficulty level adhering to Sunset Warm. */
export const INTERVIEW_DIFFICULTY_PRESENTATION = Object.freeze({
  [INTERVIEW_DIFFICULTY.BEGINNER]: {
    label: 'Beginner',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
    description: 'Foundational concepts, basic language features, and core workflows.',
  },
  [INTERVIEW_DIFFICULTY.INTERMEDIATE]: {
    label: 'Intermediate',
    badgeClass: 'border-orange-200 bg-orange-50 text-brand-text',
    description: 'Practical scenario handling, architecture patterns, and standard engineering practices.',
  },
  [INTERVIEW_DIFFICULTY.ADVANCED]: {
    label: 'Advanced',
    badgeClass: 'border-red-200 bg-red-50 text-red-800',
    description: 'Internal mechanics, concurrency, performance trade-offs, and distributed systems.',
  },
});

/** Standard question archetypes for interviews. */
export const INTERVIEW_QUESTION_TYPES = Object.freeze({
  CONCEPTUAL: 'conceptual',
  SCENARIO: 'scenario',
  BEHAVIORAL: 'behavioral',
  TECHNICAL_DEEP_DIVE: 'technical_deep_dive',
});

/** Human-readable labels for each question format. */
export const INTERVIEW_QUESTION_TYPE_LABELS = Object.freeze({
  [INTERVIEW_QUESTION_TYPES.CONCEPTUAL]: 'Conceptual Knowledge',
  [INTERVIEW_QUESTION_TYPES.SCENARIO]: 'Practical Scenario',
  [INTERVIEW_QUESTION_TYPES.BEHAVIORAL]: 'Technical Collaboration',
  [INTERVIEW_QUESTION_TYPES.TECHNICAL_DEEP_DIVE]: 'Technical Deep Dive',
});

/** Session lifecycle states. */
export const SESSION_STATUS = Object.freeze({
  INITIALIZED: 'initialized',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  TIMED_OUT: 'timed_out',
  ABANDONED: 'abandoned',
  FAILED: 'failed',
});

/** Terminal states where session execution is finished. */
export const TERMINAL_SESSION_STATUSES = Object.freeze([
  SESSION_STATUS.COMPLETED,
  SESSION_STATUS.TIMED_OUT,
  SESSION_STATUS.ABANDONED,
  SESSION_STATUS.FAILED,
]);

/**
 * Checks whether a given session status is terminal.
 *
 * @param {string} status
 * @returns {boolean}
 */
export function isTerminalSessionStatus(status) {
  return TERMINAL_SESSION_STATUSES.includes(status);
}

/** UI presentation tokens for session lifecycle states. */
export const SESSION_STATUS_PRESENTATION = Object.freeze({
  [SESSION_STATUS.INITIALIZED]: {
    label: 'Initialized',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  [SESSION_STATUS.IN_PROGRESS]: {
    label: 'In Progress',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  [SESSION_STATUS.COMPLETED]: {
    label: 'Completed',
    badgeClass: 'border-green-200 bg-green-50 text-green-800',
  },
  [SESSION_STATUS.TIMED_OUT]: {
    label: 'Timed Out',
    badgeClass: 'border-orange-200 bg-orange-50 text-brand-text',
  },
  [SESSION_STATUS.ABANDONED]: {
    label: 'Abandoned',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  [SESSION_STATUS.FAILED]: {
    label: 'Failed',
    badgeClass: 'border-red-200 bg-red-50 text-red-800',
  },
});

/** Evaluator authority types. */
export const EVALUATOR_TYPES = Object.freeze({
  AI: 'ai',
  HUMAN: 'human',
});

/** Human-readable labels for evaluator types. */
export const EVALUATOR_TYPE_LABELS = Object.freeze({
  [EVALUATOR_TYPES.AI]: 'AI Evaluator (Advisory)',
  [EVALUATOR_TYPES.HUMAN]: 'Human Examiner (Verified)',
});

/** Standard rubric dimensions for answer evaluation. */
export const RUBRIC_DIMENSIONS = Object.freeze({
  TECHNICAL_ACCURACY: 'accuracy',
  DEPTH_OF_KNOWLEDGE: 'depth',
  COMMUNICATION_CLARITY: 'clarity',
  RELEVANCE_TO_QUESTION: 'relevance',
});

/** Human-readable labels for rubric dimensions. */
export const RUBRIC_DIMENSION_LABELS = Object.freeze({
  [RUBRIC_DIMENSIONS.TECHNICAL_ACCURACY]: 'Technical Accuracy',
  [RUBRIC_DIMENSIONS.DEPTH_OF_KNOWLEDGE]: 'Depth of Knowledge',
  [RUBRIC_DIMENSIONS.COMMUNICATION_CLARITY]: 'Communication Clarity',
  [RUBRIC_DIMENSIONS.RELEVANCE_TO_QUESTION]: 'Relevance to Question',
});

/** Deterministic dimension weighting summing exactly to 1.0. */
export const RUBRIC_DIMENSION_WEIGHTS = Object.freeze({
  accuracy: 0.35,
  depth: 0.30,
  clarity: 0.20,
  relevance: 0.15,
});

/** Bounded limits for interview sessions, questions, and answers. */
export const INTERVIEW_LIMITS = Object.freeze({
  minQuestions: 1,
  maxQuestions: 10,
  maxTargetSkills: 5,
  studentAnswer: Object.freeze({ min: 10, max: 5000 }),
  questionPrompt: Object.freeze({ min: 10, max: 2000 }),
  feedbackSummary: Object.freeze({ min: 10, max: 2000 }),
  maxTimePerQuestionSeconds: 600,
  maxSessionMinutes: 90,
});

/**
 * Allowed lifecycle transitions map (object representation matching server contract).
 */
export const ALLOWED_SESSION_TRANSITIONS = Object.freeze({
  [SESSION_STATUS.INITIALIZED]: Object.freeze([
    SESSION_STATUS.IN_PROGRESS,
    SESSION_STATUS.ABANDONED,
    SESSION_STATUS.TIMED_OUT,
    SESSION_STATUS.FAILED,
  ]),
  [SESSION_STATUS.IN_PROGRESS]: Object.freeze([
    SESSION_STATUS.COMPLETED,
    SESSION_STATUS.TIMED_OUT,
    SESSION_STATUS.ABANDONED,
    SESSION_STATUS.FAILED,
  ]),
  [SESSION_STATUS.COMPLETED]: Object.freeze([]),
  [SESSION_STATUS.TIMED_OUT]: Object.freeze([]),
  [SESSION_STATUS.ABANDONED]: Object.freeze([]),
  [SESSION_STATUS.FAILED]: Object.freeze([]),
});

/**
 * Validates whether transitioning from currentStatus to nextStatus is permitted.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
export function canTransitionSession(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  const allowed = ALLOWED_SESSION_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

/**
 * Checks whether an interview session is currently active and within time limit.
 *
 * @param {object} session
 * @returns {boolean}
 */
export function isSessionActive(session) {
  if (!session || typeof session !== 'object') return false;
  if (session.status !== SESSION_STATUS.IN_PROGRESS) return false;
  if (session.expiresAt && new Date(session.expiresAt) <= new Date()) return false;
  return true;
}

/**
 * Checks whether an interview session has expired.
 *
 * @param {object} session
 * @returns {boolean}
 */
export function isSessionExpired(session) {
  if (!session || typeof session !== 'object') return false;
  if (session.status === SESSION_STATUS.TIMED_OUT) return true;
  if (session.expiresAt && new Date(session.expiresAt) <= new Date()) return true;
  return false;
}

/**
 * Checks whether the session can be started.
 *
 * @param {object} session
 * @returns {boolean}
 */
export function canStartSession(session) {
  return Boolean(session && session.status === SESSION_STATUS.INITIALIZED);
}

/**
 * Checks whether the candidate can submit an answer for the session.
 *
 * @param {object} session
 * @param {string} [questionId] Optional specific question ID check
 * @returns {boolean}
 */
export function canAnswerSession(session, questionId) {
  if (!isSessionActive(session)) return false;
  if (typeof session.maxAttemptsTotal === 'number' && typeof session.attemptCount === 'number') {
    if (session.attemptCount >= session.maxAttemptsTotal) return false;
  }
  if (questionId && Array.isArray(session.questions)) {
    const q = session.questions.find((item) => (item.id || item.questionId) === questionId);
    if (q && q.answer && typeof session.attemptLimitPerQuestion === 'number') {
      const attempts = q.answer.attemptNumber || 1;
      if (attempts >= session.attemptLimitPerQuestion) return false;
    }
  }
  return true;
}

/**
 * Checks whether the session can be completed.
 *
 * @param {object} session
 * @returns {boolean}
 */
export function canCompleteSession(session) {
  return isSessionActive(session);
}

/**
 * Checks whether the session can be abandoned.
 *
 * @param {object} session
 * @returns {boolean}
 */
export function canAbandonSession(session) {
  if (!session || typeof session !== 'object') return false;
  return session.status === SESSION_STATUS.INITIALIZED || session.status === SESSION_STATUS.IN_PROGRESS;
}

/**
 * Checks whether the session evaluation met the standard passing threshold (75%).
 *
 * @param {object} session
 * @returns {boolean}
 */
export function isSessionPassed(session) {
  if (!session || typeof session !== 'object') return false;
  return (
    session.status === SESSION_STATUS.COMPLETED &&
    typeof session.overallScore === 'number' &&
    session.overallScore >= INTERVIEW_PASS_MARK
  );
}

/**
 * Canonical interview error codes returned by the backend API.
 */
export const INTERVIEW_ERROR_CODES = Object.freeze({
  INTERVIEW_SESSION_NOT_FOUND: 'INTERVIEW_SESSION_NOT_FOUND',
  INTERVIEW_SESSION_EXPIRED: 'INTERVIEW_SESSION_EXPIRED',
  INTERVIEW_INVALID_STATE: 'INTERVIEW_INVALID_STATE',
  INTERVIEW_ATTEMPT_LIMIT_REACHED: 'INTERVIEW_ATTEMPT_LIMIT_REACHED',
  INTERVIEW_EVALUATION_FAILED: 'INTERVIEW_EVALUATION_FAILED',
  AI_PROVIDER_NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  AI_PROVIDER_FAILED: 'AI_PROVIDER_FAILED',
  AI_OUTPUT_INVALID: 'AI_OUTPUT_INVALID',
  CAREER_ROLE_NOT_FOUND: 'CAREER_ROLE_NOT_FOUND',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  CONFLICT: 'CONFLICT',
  BAD_REQUEST: 'BAD_REQUEST',
});

/**
 * UI presentation tokens for interview error codes adhering to Sunset Warm design system.
 */
export const INTERVIEW_ERROR_PRESENTATION = Object.freeze({
  [INTERVIEW_ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND]: {
    title: 'Session Not Found',
    message: 'The requested interview session could not be located.',
    userAction: 'Return to the interview dashboard to start or select an active session.',
    retryable: false,
  },
  [INTERVIEW_ERROR_CODES.INTERVIEW_SESSION_EXPIRED]: {
    title: 'Session Expired',
    message: 'The allotted time limit for this interview session has expired.',
    userAction: 'Review your completed answers or start a new practice session.',
    retryable: false,
  },
  [INTERVIEW_ERROR_CODES.INTERVIEW_INVALID_STATE]: {
    title: 'Invalid Action',
    message: 'This operation cannot be performed in the current session state.',
    userAction: 'Refresh the session state or navigate to the active question.',
    retryable: false,
  },
  [INTERVIEW_ERROR_CODES.INTERVIEW_ATTEMPT_LIMIT_REACHED]: {
    title: 'Attempt Limit Reached',
    message: 'You have reached the maximum number of answer attempts for this session.',
    userAction: 'Finalize and submit your session for overall evaluation.',
    retryable: false,
  },
  [INTERVIEW_ERROR_CODES.INTERVIEW_EVALUATION_FAILED]: {
    title: 'Evaluation Error',
    message: 'Unable to evaluate your answer at this time.',
    userAction: 'Please try submitting your answer again in a few moments.',
    retryable: true,
  },
  [INTERVIEW_ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED]: {
    title: 'Evaluator Unavailable',
    message: 'The AI evaluation service is temporarily unconfigured.',
    userAction: 'Please contact support or try again later.',
    retryable: false,
  },
  [INTERVIEW_ERROR_CODES.AI_PROVIDER_FAILED]: {
    title: 'Service Interruption',
    message: 'The AI provider encountered an issue while generating feedback.',
    userAction: 'You can retry submitting your answer without penalty.',
    retryable: true,
  },
  [INTERVIEW_ERROR_CODES.AI_OUTPUT_INVALID]: {
    title: 'Evaluation Retry Needed',
    message: 'The evaluation response did not meet verification standards.',
    userAction: 'Please resubmit your answer.',
    retryable: true,
  },
  [INTERVIEW_ERROR_CODES.CAREER_ROLE_NOT_FOUND]: {
    title: 'Role Not Found',
    message: 'The selected target role could not be resolved from the catalogue.',
    userAction: 'Select a valid role from the career catalogue.',
    retryable: false,
  },
  [INTERVIEW_ERROR_CODES.RATE_LIMIT_EXCEEDED]: {
    title: 'Too Many Requests',
    message: 'You have made too many requests in a short period.',
    userAction: 'Please wait a moment before trying again.',
    retryable: true,
  },
  [INTERVIEW_ERROR_CODES.CONFLICT]: {
    title: 'Conflict Detected',
    message: 'Another evaluation or state change is already underway.',
    userAction: 'Wait a few seconds and refresh the interview view.',
    retryable: true,
  },
  [INTERVIEW_ERROR_CODES.BAD_REQUEST]: {
    title: 'Invalid Request',
    message: 'The submission contained invalid or incomplete parameters.',
    userAction: 'Check your response length and format before resubmitting.',
    retryable: false,
  },
});

/**
 * Resolves an error into a standardized presentation object for the interview UI.
 *
 * @param {any} error
 * @returns {{ code: string, title: string, message: string, userAction: string, retryable: boolean, status: number }}
 */
export function resolveInterviewError(error) {
  const code =
    error?.errorCode ||
    error?.code ||
    (typeof error?.message === 'string' && error.message.toLowerCase().includes('expired')
      ? INTERVIEW_ERROR_CODES.INTERVIEW_SESSION_EXPIRED
      : null);
  const status = typeof error?.status === 'number' ? error.status : 500;

  if (code && INTERVIEW_ERROR_PRESENTATION[code]) {
    const presentation = INTERVIEW_ERROR_PRESENTATION[code];
    return {
      code,
      title: presentation.title,
      message: error?.message || presentation.message,
      userAction: presentation.userAction,
      retryable: presentation.retryable,
      status,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    title: 'Unexpected Error',
    message: error?.message || 'An unexpected error occurred during the interview.',
    userAction: 'Please refresh the page or try again in a few moments.',
    retryable: true,
    status,
  };
}

/**
 * Canonical evidence status categories for completed interview evaluations.
 */
export const INTERVIEW_EVIDENCE_STATUS = Object.freeze({
  VERIFIED: 'verified',
  ADVISORY_SUPPORTED: 'advisory_supported',
  UNVERIFIED_BELOW_PASS: 'unverified_below_pass',
  PENDING: 'pending',
});

/**
 * UI presentation tokens for interview evidence statuses adhering to Sunset Warm.
 */
export const INTERVIEW_EVIDENCE_STATUS_PRESENTATION = Object.freeze({
  [INTERVIEW_EVIDENCE_STATUS.VERIFIED]: {
    label: 'Institutionally Verified',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    description: 'Human examiner verified competency meeting institutional standards (≥75%). Eligible for official credentials.',
  },
  [INTERVIEW_EVIDENCE_STATUS.ADVISORY_SUPPORTED]: {
    label: 'Advisory Supported',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
    description: 'AI-evaluated demonstration meeting standard threshold (≥75%). Valid for practice tracking and CareerTwin readiness guidance.',
  },
  [INTERVIEW_EVIDENCE_STATUS.UNVERIFIED_BELOW_PASS]: {
    label: 'Below Passing Threshold',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-800',
    description: 'Score fell below the 75% threshold. Continued practice recommended before re-assessment.',
  },
  [INTERVIEW_EVIDENCE_STATUS.PENDING]: {
    label: 'Evaluation Pending',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
    description: 'Session is in progress or awaiting evaluation finalization.',
  },
});

/**
 * Resolves the institutional evidence status and presentation tokens for an interview session or result.
 *
 * @param {object} [params]
 * @param {number|null} [params.overallScore] Composite score 0.0 - 1.0
 * @param {string} [params.evaluatorType] 'ai' | 'human'
 * @param {boolean} [params.eligibleForVerified]
 * @param {string} [params.status] Session status
 * @returns {object} Evidence status descriptor with UI presentation
 */
export function resolveInterviewEvidenceStatus({ overallScore, evaluatorType, eligibleForVerified, status } = {}) {
  if (status && status !== SESSION_STATUS.COMPLETED) {
    return {
      statusKey: INTERVIEW_EVIDENCE_STATUS.PENDING,
      ...INTERVIEW_EVIDENCE_STATUS_PRESENTATION[INTERVIEW_EVIDENCE_STATUS.PENDING],
      isVerified: false,
      isSupported: false,
      isPassing: false,
    };
  }

  const score = typeof overallScore === 'number' ? overallScore : null;
  const isPassing = score !== null && score >= INTERVIEW_PASS_MARK;

  if (eligibleForVerified && isPassing && evaluatorType === EVALUATOR_TYPES.HUMAN) {
    return {
      statusKey: INTERVIEW_EVIDENCE_STATUS.VERIFIED,
      ...INTERVIEW_EVIDENCE_STATUS_PRESENTATION[INTERVIEW_EVIDENCE_STATUS.VERIFIED],
      isVerified: true,
      isSupported: true,
      isPassing: true,
    };
  }

  if (isPassing) {
    return {
      statusKey: INTERVIEW_EVIDENCE_STATUS.ADVISORY_SUPPORTED,
      ...INTERVIEW_EVIDENCE_STATUS_PRESENTATION[INTERVIEW_EVIDENCE_STATUS.ADVISORY_SUPPORTED],
      isVerified: false,
      isSupported: true,
      isPassing: true,
    };
  }

  return {
    statusKey: INTERVIEW_EVIDENCE_STATUS.UNVERIFIED_BELOW_PASS,
    ...INTERVIEW_EVIDENCE_STATUS_PRESENTATION[INTERVIEW_EVIDENCE_STATUS.UNVERIFIED_BELOW_PASS],
    isVerified: false,
    isSupported: false,
    isPassing: false,
  };
}
