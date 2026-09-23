/**
 * Validation constraints, boundaries, and limits for the assessment domain.
 */
export const ASSESSMENT_LIMITS = Object.freeze({
  id: { min: 3, max: 64 },
  title: { min: 3, max: 120 },
  description: { min: 5, max: 1000 },
  passMark: { min: 0.01, max: 1.0 },
  timeLimitMinutes: { min: 1, max: 180 },
  questions: { minItems: 1, maxItems: 50 },
  prompt: { min: 3, max: 1000 },
  explanation: { max: 1000 },
  codeSnippet: { max: 4000 },
  options: { minItems: 2, maxItems: 10 },
  optionId: { min: 1, max: 50 },
  optionText: { min: 1, max: 300 },
  answerText: { max: 1000 },
  maxSubmissionAnswers: 50,
  maxAttemptsPerAssessment: 5,
});

/**
 * Fields that clients must NEVER be permitted to submit or control directly.
 * Attempting to provide these in an attempt submission will trigger immediate validation rejection.
 */
export const FORBIDDEN_CLIENT_VERIFICATION_FIELDS = Object.freeze([
  'eligibleForVerified',
  'score',
  'passed',
  'outcome',
  'evidence',
  'evaluatedBy',
  'status',
  'earnedPoints',
  'maxPoints',
  'correctQuestionsCount',
  'questionResults',
]);
