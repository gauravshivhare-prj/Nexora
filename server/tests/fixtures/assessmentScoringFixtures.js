import {
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  SCORING_STRATEGIES,
} from '../../src/domain/assessment/assessmentContract.js';

/**
 * Standard test assessment for scoring fixtures.
 * Intermediate difficulty Node.js assessment with 4 diverse question types.
 */
export const scoringTestAssessment = Object.freeze({
  id: 'asm_scoring_fixture_node',
  version: 1,
  skillKey: 'Node.js',
  difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
  title: 'Node.js Scoring Fixture Test',
  description: 'Used for verifying transparent deterministic scoring rules.',
  passMark: 0.7,
  timeLimitMinutes: 20,
  questions: [
    {
      id: 'q_sc_single',
      type: QUESTION_TYPES.SINGLE_CHOICE,
      prompt: 'Which method handles stream backpressure?',
      weight: 1,
      options: [
        { id: 'opt_pipe', text: 'readable.pipe(writable)' },
        { id: 'opt_write', text: 'writable.write(chunk)' },
      ],
      expectedAnswer: { correctOptionId: 'opt_pipe' },
      explanation: 'pipe automatically handles backpressure.',
    },
    {
      id: 'q_mc_partial',
      type: QUESTION_TYPES.MULTIPLE_CHOICE,
      prompt: 'Select asynchronous primitives in Node.js:',
      weight: 2,
      options: [
        { id: 'opt_promise', text: 'Promise' },
        { id: 'opt_nexttick', text: 'process.nextTick' },
        { id: 'opt_sync', text: 'fs.readFileSync' },
      ],
      expectedAnswer: {
        correctOptionIds: ['opt_promise', 'opt_nexttick'],
        strategy: SCORING_STRATEGIES.PARTIAL_CREDIT,
      },
      explanation: 'Promise and process.nextTick are asynchronous.',
    },
    {
      id: 'q_code_out',
      type: QUESTION_TYPES.CODE_OUTPUT,
      prompt: 'What does console.log("OK") print?',
      weight: 1,
      expectedAnswer: {
        expectedOutput: 'OK',
        trimWhitespace: true,
        caseSensitive: true,
      },
      explanation: 'Prints OK to stdout.',
    },
    {
      id: 'q_bool_val',
      type: QUESTION_TYPES.BOOLEAN,
      prompt: 'Node.js is single-threaded in its JavaScript execution thread.',
      weight: 1,
      expectedAnswer: { expectedValue: true },
      explanation: 'The main event loop runs on a single thread.',
    },
  ],
});

/**
 * Beginner assessment for verifying evidence policy separation.
 * Even a 100% score on this assessment should NOT grant verified evidence.
 */
export const beginnerTestAssessment = Object.freeze({
  id: 'asm_scoring_beginner_fixture',
  version: 1,
  skillKey: 'Node.js',
  difficulty: DIFFICULTY_LEVELS.BEGINNER,
  title: 'Introductory Node.js Check',
  description: 'Introductory check assessing basic familiarity.',
  passMark: 0.7,
  timeLimitMinutes: 10,
  questions: [
    {
      id: 'q_beg_1',
      type: QUESTION_TYPES.SINGLE_CHOICE,
      prompt: 'What is Node.js?',
      weight: 1,
      options: [
        { id: 'opt_runtime', text: 'A JavaScript runtime' },
        { id: 'opt_db', text: 'A relational database' },
      ],
      expectedAnswer: { correctOptionId: 'opt_runtime' },
    },
    {
      id: 'q_beg_2',
      type: QUESTION_TYPES.BOOLEAN,
      prompt: 'Node.js uses the V8 engine.',
      weight: 1,
      expectedAnswer: { expectedValue: true },
    },
    {
      id: 'q_beg_3',
      type: QUESTION_TYPES.SHORT_ANSWER,
      prompt: 'Default package manager for Node.js:',
      weight: 1,
      expectedAnswer: {
        acceptedAnswers: ['npm'],
        caseSensitive: false,
        trimWhitespace: true,
      },
    },
  ],
});

/**
 * 1. Correct Submission: All answers 100% correct.
 */
export const correctSubmissionFixture = Object.freeze({
  studentId: 'student_correct_1',
  assessmentId: 'asm_scoring_fixture_node',
  answers: {
    q_sc_single: 'opt_pipe',
    q_mc_partial: ['opt_promise', 'opt_nexttick'],
    q_code_out: 'OK',
    q_bool_val: true,
  },
});

/**
 * 2. Incorrect Submission: All answers wrong.
 */
export const incorrectSubmissionFixture = Object.freeze({
  studentId: 'student_incorrect_1',
  assessmentId: 'asm_scoring_fixture_node',
  answers: {
    q_sc_single: 'opt_write',
    q_mc_partial: ['opt_sync'],
    q_code_out: 'WRONG_OUTPUT',
    q_bool_val: false,
  },
});

/**
 * 3. Partial Submission: Some correct, some partial, some wrong.
 * Multiple choice selects 1 of 2 correct (0.5 ratio on weight 2 = 1.0 point).
 * Total: 1 (single) + 1 (partial) + 0 (code) + 1 (bool) = 3 / 5 points = 0.60.
 */
export const partialSubmissionFixture = Object.freeze({
  studentId: 'student_partial_1',
  assessmentId: 'asm_scoring_fixture_node',
  answers: {
    q_sc_single: 'opt_pipe', // correct (1/1)
    q_mc_partial: ['opt_promise'], // partial: 1 of 2 correct (1/2 points)
    q_code_out: 'FAIL', // incorrect (0/1)
    q_bool_val: true, // correct (1/1)
  },
});

/**
 * 4. Skipped Submission: Omitted answers, nulls, and empty inputs.
 */
export const skippedSubmissionFixture = Object.freeze({
  studentId: 'student_skipped_1',
  assessmentId: 'asm_scoring_fixture_node',
  answers: {
    q_sc_single: null, // explicitly null
    q_mc_partial: [], // empty selection
    // q_code_out omitted completely
    q_bool_val: undefined, // undefined
  },
});

/**
 * 5. Invalid Submission: Malformed data types and non-existent option IDs.
 */
export const invalidSubmissionFixture = Object.freeze({
  studentId: 'student_invalid_1',
  assessmentId: 'asm_scoring_fixture_node',
  answers: {
    q_sc_single: 'opt_non_existent_404', // invalid option ID
    q_mc_partial: 'not_an_array_string', // invalid type for multiple choice
    q_code_out: 12345, // invalid type for code output (number instead of string)
    q_bool_val: 'maybe_neither_true_nor_false', // invalid boolean format
  },
});

/**
 * 6. Beginner High Scorer: 100% correct on beginner assessment.
 * Demonstrates separation of raw score from evidence status.
 */
export const beginnerHighScorerSubmissionFixture = Object.freeze({
  studentId: 'student_beginner_high',
  assessmentId: 'asm_scoring_beginner_fixture',
  answers: {
    q_beg_1: 'opt_runtime',
    q_beg_2: true,
    q_beg_3: 'npm',
  },
});

/**
 * Practice assessment for verifying evidence policy separation.
 * Even a 100% score on this assessment should NOT grant verified evidence or trigger CareerTwin staleness.
 */
export const practiceTestAssessment = Object.freeze({
  id: 'asm_scoring_practice_fixture',
  version: 1,
  skillKey: 'Node.js',
  difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
  isPractice: true,
  title: 'Node.js Practice Assessment',
  description: 'Practice assessment testing intermediate Node.js without verified outcome.',
  passMark: 0.7,
  timeLimitMinutes: 20,
  questions: scoringTestAssessment.questions,
});

/**
 * 7. Practice High Scorer: 100% correct on practice assessment.
 */
export const practiceHighScorerSubmissionFixture = Object.freeze({
  studentId: 'student_practice_high',
  assessmentId: 'asm_scoring_practice_fixture',
  answers: correctSubmissionFixture.answers,
});
