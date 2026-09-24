/**
 * Client-side assessment contract options, constants, and presentation tokens.
 *
 * Mirrors the canonical values in server/src/domain/assessment/assessmentContract.js
 * while providing UI-ready presentation mappings adhering to the Sunset Warm theme.
 */

/** Difficulty levels supported in the Nexora assessment taxonomy. */
export const DIFFICULTY_LEVELS = Object.freeze({
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
});

// Alias for singular convention
export const DIFFICULTY_LEVEL = DIFFICULTY_LEVELS;

/** Ordered list of difficulty tiers from easiest to hardest. */
export const DIFFICULTY_ORDER = Object.freeze([
  DIFFICULTY_LEVELS.BEGINNER,
  DIFFICULTY_LEVELS.INTERMEDIATE,
  DIFFICULTY_LEVELS.ADVANCED,
]);

/** UI presentation tokens for each difficulty level. */
export const DIFFICULTY_PRESENTATION = Object.freeze({
  [DIFFICULTY_LEVELS.BEGINNER]: {
    label: 'Beginner',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
    description: 'Foundational concepts and syntax understanding.',
  },
  [DIFFICULTY_LEVELS.INTERMEDIATE]: {
    label: 'Intermediate',
    badgeClass: 'border-orange-200 bg-orange-50 text-brand-text',
    description: 'Applied knowledge, architecture patterns, and standard practices.',
  },
  [DIFFICULTY_LEVELS.ADVANCED]: {
    label: 'Advanced',
    badgeClass: 'border-red-200 bg-red-50 text-red-800',
    description: 'Deep internals, edge cases, distributed systems, and performance tuning.',
  },
});

/** Canonical question types supported by the assessment engine. */
export const QUESTION_TYPES = Object.freeze({
  SINGLE_CHOICE: 'single_choice',
  MULTIPLE_CHOICE: 'multiple_choice',
  CODE_OUTPUT: 'code_output',
  SHORT_ANSWER: 'short_answer',
  BOOLEAN: 'boolean',
});

// Alias for singular convention
export const QUESTION_TYPE = QUESTION_TYPES;

/** Human-readable labels for each question format. */
export const QUESTION_TYPE_LABELS = Object.freeze({
  [QUESTION_TYPES.SINGLE_CHOICE]: 'Single Choice',
  [QUESTION_TYPES.MULTIPLE_CHOICE]: 'Multiple Choice',
  [QUESTION_TYPES.CODE_OUTPUT]: 'Code Output Prediction',
  [QUESTION_TYPES.SHORT_ANSWER]: 'Short Answer',
  [QUESTION_TYPES.BOOLEAN]: 'True / False',
});

/** Lifecycle states for an assessment attempt. */
export const ATTEMPT_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  EVALUATED: 'evaluated',
  TIMED_OUT: 'timed_out',
  ABANDONED: 'abandoned',
});

/** UI presentation tokens for attempt lifecycle states. */
export const ATTEMPT_STATUS_PRESENTATION = Object.freeze({
  [ATTEMPT_STATUS.IN_PROGRESS]: {
    label: 'In Progress',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-800',
  },
  [ATTEMPT_STATUS.SUBMITTED]: {
    label: 'Submitted',
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  [ATTEMPT_STATUS.EVALUATED]: {
    label: 'Completed',
    badgeClass: 'border-green-200 bg-green-50 text-green-800',
  },
  [ATTEMPT_STATUS.TIMED_OUT]: {
    label: 'Timed Out',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  [ATTEMPT_STATUS.ABANDONED]: {
    label: 'Abandoned',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
  },
});

/** High-level evaluation outcome. */
export const EVALUATION_OUTCOME = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  UNCERTAIN: 'uncertain',
});

/** Institutional evidence status awarded by the result. */
export const EVIDENCE_STATUS = Object.freeze({
  VERIFIED: 'verified',
  SUPPORTED: 'supported',
  UNSUPPORTED: 'unsupported',
});

/** Question-level score evaluation status. */
export const QUESTION_ANSWER_STATUS = Object.freeze({
  CORRECT: 'correct',
  PARTIAL: 'partial',
  INCORRECT: 'incorrect',
  SKIPPED: 'skipped',
  INVALID: 'invalid',
});

// Alias for question result status
export const QUESTION_RESULT_STATUS = QUESTION_ANSWER_STATUS;

/** Human-readable labels and badge styles for question evaluation statuses. */
export const QUESTION_RESULT_PRESENTATION = Object.freeze({
  [QUESTION_ANSWER_STATUS.CORRECT]: {
    label: 'Correct',
    glyph: '✓',
    badgeClass: 'border-green-200 bg-green-50 text-green-700',
  },
  [QUESTION_ANSWER_STATUS.INCORRECT]: {
    label: 'Incorrect',
    glyph: '✗',
    badgeClass: 'border-red-200 bg-red-50 text-red-700',
  },
  [QUESTION_ANSWER_STATUS.PARTIAL]: {
    label: 'Partial Credit',
    glyph: '◐',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  [QUESTION_ANSWER_STATUS.SKIPPED]: {
    label: 'Skipped',
    glyph: '—',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  [QUESTION_ANSWER_STATUS.INVALID]: {
    label: 'Invalid Response',
    glyph: '!',
    badgeClass: 'border-red-200 bg-red-50 text-red-600',
  },
});

/** Client submission payload limits matching server validation guards. */
export const SUBMISSION_LIMITS = Object.freeze({
  MAX_ANSWERS: 50,
  MAX_ANSWER_LENGTH: 1000,
});
