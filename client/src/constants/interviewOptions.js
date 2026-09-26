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
