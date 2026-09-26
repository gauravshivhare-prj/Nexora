import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DIFFICULTY_LEVELS,
  QUESTION_ANSWER_STATUS,
  QUESTION_TYPES,
  SCORING_STRATEGIES,
  evaluateAssessmentSubmission,
  scoreQuestion,
  validateAssessmentDefinition,
} from '../src/domain/assessment/assessmentContract.js';
import { toPublicAssessmentAttempt } from '../src/models/AssessmentAttempt.model.js';
import { EVIDENCE_STRENGTH } from '../src/domain/evidence/evidence.js';

// -----------------------------------------------------------------------------
// Fixture: Canonical multi-type 5-question assessment
// -----------------------------------------------------------------------------
const allTypesAssessment = Object.freeze({
  id: 'asm_scoring_correctness_all_types',
  version: 1,
  skillKey: 'Node.js',
  difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
  title: 'All Types Deterministic Scoring Assessment',
  description: 'Verifies scoring correctness across single_choice, multiple_choice, code_output, short_answer, and boolean.',
  passMark: 0.7,
  timeLimitMinutes: 15,
  questions: [
    {
      id: 'q_sc',
      type: QUESTION_TYPES.SINGLE_CHOICE,
      prompt: 'Which event loop phase executes setImmediate callbacks?',
      weight: 1,
      options: [
        { id: 'opt_check', text: 'Check phase' },
        { id: 'opt_poll', text: 'Poll phase' },
        { id: 'opt_timers', text: 'Timers phase' },
      ],
      expectedAnswer: { correctOptionId: 'opt_check' },
      explanation: 'setImmediate executes in the check phase.',
    },
    {
      id: 'q_mc_partial',
      type: QUESTION_TYPES.MULTIPLE_CHOICE,
      prompt: 'Select all built-in core modules in Node.js:',
      weight: 2,
      options: [
        { id: 'opt_fs', text: 'fs' },
        { id: 'opt_path', text: 'path' },
        { id: 'opt_express', text: 'express' },
        { id: 'opt_react', text: 'react' },
      ],
      expectedAnswer: {
        correctOptionIds: ['opt_fs', 'opt_path'],
        strategy: SCORING_STRATEGIES.PARTIAL_CREDIT,
      },
      explanation: 'fs and path are built-in core modules.',
    },
    {
      id: 'q_mc_all_or_nothing',
      type: QUESTION_TYPES.MULTIPLE_CHOICE,
      prompt: 'Select both truthy values:',
      weight: 1,
      options: [
        { id: 'opt_true_bool', text: 'true' },
        { id: 'opt_nonempty_str', text: '"hello"' },
        { id: 'opt_null', text: 'null' },
        { id: 'opt_zero', text: '0' },
      ],
      expectedAnswer: {
        correctOptionIds: ['opt_true_bool', 'opt_nonempty_str'],
        strategy: SCORING_STRATEGIES.ALL_OR_NOTHING,
      },
    },
    {
      id: 'q_code',
      type: QUESTION_TYPES.CODE_OUTPUT,
      prompt: 'What does console.log(typeof null) output?',
      weight: 1,
      expectedAnswer: {
        expectedOutput: 'object',
        trimWhitespace: true,
        caseSensitive: true,
      },
      explanation: 'typeof null is "object" in JavaScript.',
    },
    {
      id: 'q_sa',
      type: QUESTION_TYPES.SHORT_ANSWER,
      prompt: 'What is the standard command to install npm packages?',
      weight: 1,
      expectedAnswer: {
        acceptedAnswers: ['npm install', 'npm i', 'npm add'],
        caseSensitive: false,
        trimWhitespace: true,
      },
    },
    {
      id: 'q_bool',
      type: QUESTION_TYPES.BOOLEAN,
      prompt: 'JavaScript is a dynamically typed language.',
      weight: 1,
      expectedAnswer: { expectedValue: true },
    },
  ],
});

// Total questions: 6
// Weights: q_sc (1) + q_mc_partial (2) + q_mc_all_or_nothing (1) + q_code (1) + q_sa (1) + q_bool (1) = 7 max points

describe('TASK A08 — Assessment Scoring Correctness: Zero Submissions', () => {
  it('correctly scores empty submission ({}) as zero score with all questions skipped', () => {
    const result = evaluateAssessmentSubmission({
      assessment: allTypesAssessment,
      submission: {
        studentId: 'student_zero_empty',
        assessmentId: allTypesAssessment.id,
        answers: {},
      },
    });

    assert.equal(result.score, 0);
    assert.equal(result.earnedPoints, 0);
    assert.equal(result.maxPoints, 7);
    assert.equal(result.passed, false);
    assert.equal(result.outcome, 'fail');
    assert.equal(result.correctQuestionsCount, 0);

    assert.equal(result.scoringSummary.skippedCount, 6);
    assert.equal(result.scoringSummary.correctCount, 0);
    assert.equal(result.scoringSummary.partialCount, 0);
    assert.equal(result.scoringSummary.incorrectCount, 0);
    assert.equal(result.scoringSummary.invalidCount, 0);

    for (const qr of result.questionResults) {
      assert.equal(qr.status, QUESTION_ANSWER_STATUS.SKIPPED);
      assert.equal(qr.isCorrect, false);
      assert.equal(qr.earnedPoints, 0);
      assert.equal(qr.ratio, 0);
      assert.equal(qr.scoringRule, 'skipped_no_answer');
    }
  });

  it('correctly scores null/omitted answers across all 5 supported question types', () => {
    const result = evaluateAssessmentSubmission({
      assessment: allTypesAssessment,
      submission: {
        studentId: 'student_zero_nulls',
        assessmentId: allTypesAssessment.id,
        answers: {
          q_sc: null,
          q_mc_partial: null,
          q_mc_all_or_nothing: undefined,
          q_code: null,
          q_sa: undefined,
          q_bool: null,
        },
      },
    });

    assert.equal(result.score, 0);
    assert.equal(result.scoringSummary.skippedCount, 6);
    for (const qr of result.questionResults) {
      assert.equal(qr.status, QUESTION_ANSWER_STATUS.SKIPPED);
      assert.equal(qr.scoringRule, 'skipped_no_answer');
    }
  });

  it('correctly identifies empty inputs ("", []) as skipped rather than format errors', () => {
    const result = evaluateAssessmentSubmission({
      assessment: allTypesAssessment,
      submission: {
        studentId: 'student_zero_empty_inputs',
        assessmentId: allTypesAssessment.id,
        answers: {
          q_sc: '   ', // single choice empty whitespace
          q_mc_partial: [], // multiple choice empty selection
          q_mc_all_or_nothing: [],
          q_code: '  ', // code output empty whitespace
          q_sa: '   ', // short answer empty whitespace
          q_bool: '', // boolean empty string
        },
      },
    });

    assert.equal(result.score, 0);
    assert.equal(result.scoringSummary.skippedCount, 6);
    assert.equal(result.scoringSummary.invalidCount, 0);

    const sc = result.questionResults.find((q) => q.questionId === 'q_sc');
    assert.equal(sc.status, QUESTION_ANSWER_STATUS.SKIPPED);
    assert.equal(sc.scoringRule, 'skipped_empty_single_choice');

    const mcPart = result.questionResults.find((q) => q.questionId === 'q_mc_partial');
    assert.equal(mcPart.status, QUESTION_ANSWER_STATUS.SKIPPED);
    assert.equal(mcPart.scoringRule, 'skipped_empty_selection');

    const code = result.questionResults.find((q) => q.questionId === 'q_code');
    assert.equal(code.status, QUESTION_ANSWER_STATUS.SKIPPED);
    assert.equal(code.scoringRule, 'skipped_empty_code_output');

    const sa = result.questionResults.find((q) => q.questionId === 'q_sa');
    assert.equal(sa.status, QUESTION_ANSWER_STATUS.SKIPPED);
    assert.equal(sa.scoringRule, 'skipped_empty_short_answer');

    const bool = result.questionResults.find((q) => q.questionId === 'q_bool');
    assert.equal(bool.status, QUESTION_ANSWER_STATUS.SKIPPED);
    assert.equal(bool.scoringRule, 'skipped_empty_boolean');
  });

  it('correctly scores all-incorrect submission as zero points and outcome fail', () => {
    const result = evaluateAssessmentSubmission({
      assessment: allTypesAssessment,
      submission: {
        studentId: 'student_zero_all_incorrect',
        assessmentId: allTypesAssessment.id,
        answers: {
          q_sc: 'opt_timers', // wrong
          q_mc_partial: ['opt_express', 'opt_react'], // both wrong
          q_mc_all_or_nothing: ['opt_null'], // wrong
          q_code: 'undefined', // wrong
          q_sa: 'pip install', // wrong
          q_bool: false, // wrong
        },
      },
    });

    assert.equal(result.score, 0);
    assert.equal(result.earnedPoints, 0);
    assert.equal(result.passed, false);
    assert.equal(result.outcome, 'fail');
    assert.equal(result.scoringSummary.incorrectCount, 6);
    assert.equal(result.scoringSummary.correctCount, 0);
  });
});

describe('TASK A08 — Assessment Scoring Correctness: Partial Submissions', () => {
  it('correctly calculates proportional partial credit for multiple-choice questions', () => {
    const q = allTypesAssessment.questions.find((x) => x.id === 'q_mc_partial');

    // 1 of 2 correct selected -> ratio = 0.5, earned = 0.5 * 2 = 1.0
    const oneOfTwo = scoreQuestion(q, ['opt_fs']);
    assert.equal(oneOfTwo.status, QUESTION_ANSWER_STATUS.PARTIAL);
    assert.equal(oneOfTwo.isCorrect, false);
    assert.equal(oneOfTwo.ratio, 0.5);
    assert.equal(oneOfTwo.earnedPoints, 1.0);
    assert.equal(oneOfTwo.scoringRule, 'partial_credit_proportional');

    // 2 correct + 1 wrong selected -> ratio = (2 - 1) / 2 = 0.5, earned = 1.0
    const twoCorrectOneWrong = scoreQuestion(q, ['opt_fs', 'opt_path', 'opt_express']);
    assert.equal(twoCorrectOneWrong.status, QUESTION_ANSWER_STATUS.PARTIAL);
    assert.equal(twoCorrectOneWrong.ratio, 0.5);
    assert.equal(twoCorrectOneWrong.earnedPoints, 1.0);
    assert.equal(twoCorrectOneWrong.scoringRule, 'partial_credit_proportional');

    // 1 correct + 1 wrong selected -> ratio = (1 - 1) / 2 = 0.0 -> penalized to zero
    const oneCorrectOneWrong = scoreQuestion(q, ['opt_fs', 'opt_express']);
    assert.equal(oneCorrectOneWrong.status, QUESTION_ANSWER_STATUS.INCORRECT);
    assert.equal(oneCorrectOneWrong.ratio, 0);
    assert.equal(oneCorrectOneWrong.earnedPoints, 0);
    assert.equal(oneCorrectOneWrong.scoringRule, 'partial_credit_penalized_to_zero');

    // 2 correct + 2 wrong selected -> ratio = (2 - 2) / 2 = 0.0 -> penalized to zero
    const allSelected = scoreQuestion(q, ['opt_fs', 'opt_path', 'opt_express', 'opt_react']);
    assert.equal(allSelected.status, QUESTION_ANSWER_STATUS.INCORRECT);
    assert.equal(allSelected.ratio, 0);
    assert.equal(allSelected.earnedPoints, 0);
    assert.equal(allSelected.scoringRule, 'partial_credit_penalized_to_zero');
  });

  it('strictly rejects partial selections on all-or-nothing multiple-choice questions', () => {
    const q = allTypesAssessment.questions.find((x) => x.id === 'q_mc_all_or_nothing');

    // Incomplete selection (1 of 2) -> 0 points, incorrect
    const partial = scoreQuestion(q, ['opt_true_bool']);
    assert.equal(partial.status, QUESTION_ANSWER_STATUS.INCORRECT);
    assert.equal(partial.isCorrect, false);
    assert.equal(partial.ratio, 0);
    assert.equal(partial.earnedPoints, 0);
    assert.equal(partial.scoringRule, 'all_or_nothing_mismatch');

    // Over-selection (2 correct + 1 wrong) -> 0 points, incorrect
    const over = scoreQuestion(q, ['opt_true_bool', 'opt_nonempty_str', 'opt_null']);
    assert.equal(over.status, QUESTION_ANSWER_STATUS.INCORRECT);
    assert.equal(over.ratio, 0);
    assert.equal(over.earnedPoints, 0);
    assert.equal(over.scoringRule, 'all_or_nothing_mismatch');
  });

  it('correctly aggregates mixed partial assessment scores with weighted questions', () => {
    // Assessment weights:
    // q_sc (1 pt): correct -> 1 pt
    // q_mc_partial (2 pt): partial 1 of 2 -> 1 pt
    // q_mc_all_or_nothing (1 pt): wrong -> 0 pt
    // q_code (1 pt): correct -> 1 pt
    // q_sa (1 pt): skipped -> 0 pt
    // q_bool (1 pt): correct -> 1 pt
    // Total earned: 1 + 1 + 0 + 1 + 0 + 1 = 4 points out of 7 = 4 / 7 = 0.5714 (57.14%)
    const result = evaluateAssessmentSubmission({
      assessment: allTypesAssessment,
      submission: {
        studentId: 'student_partial_aggregate',
        assessmentId: allTypesAssessment.id,
        answers: {
          q_sc: 'opt_check', // 1/1
          q_mc_partial: ['opt_fs'], // 1/2
          q_mc_all_or_nothing: ['opt_null'], // 0/1
          q_code: 'object', // 1/1
          q_sa: null, // 0/1 (skipped)
          q_bool: true, // 1/1
        },
      },
    });

    assert.equal(result.earnedPoints, 4);
    assert.equal(result.maxPoints, 7);
    assert.equal(result.score, 0.5714);
    assert.equal(result.scoringSummary.percentage, 57.14);
    assert.equal(result.passed, false); // passMark is 0.70
    assert.equal(result.outcome, 'fail');

    assert.equal(result.scoringSummary.correctCount, 3);
    assert.equal(result.scoringSummary.partialCount, 1);
    assert.equal(result.scoringSummary.incorrectCount, 1);
    assert.equal(result.scoringSummary.skippedCount, 1);
    assert.equal(result.scoringSummary.invalidCount, 0);
  });
});

describe('TASK A08 — Assessment Scoring Correctness: Full Submissions', () => {
  it('correctly scores 100% full submission across all 5 supported question types', () => {
    const result = evaluateAssessmentSubmission({
      assessment: allTypesAssessment,
      submission: {
        studentId: 'student_full_100',
        assessmentId: allTypesAssessment.id,
        answers: {
          q_sc: 'opt_check',
          q_mc_partial: ['opt_path', 'opt_fs'], // order reversed
          q_mc_all_or_nothing: ['opt_nonempty_str', 'opt_true_bool'], // order reversed
          q_code: 'object',
          q_sa: '  NPM INSTALL  ', // casing and whitespace
          q_bool: 'TRUE', // string format
        },
      },
    });

    assert.equal(result.score, 1);
    assert.equal(result.earnedPoints, 7);
    assert.equal(result.maxPoints, 7);
    assert.equal(result.passed, true);
    assert.equal(result.outcome, 'pass');
    assert.equal(result.scoringSummary.percentage, 100);
    assert.equal(result.correctQuestionsCount, 6);
    assert.equal(result.scoringSummary.correctCount, 6);
    assert.equal(result.scoringSummary.incorrectCount, 0);
    assert.equal(result.scoringSummary.partialCount, 0);
    assert.equal(result.scoringSummary.skippedCount, 0);

    // Provenance verification check
    assert.equal(result.evidenceStatus.eligibleForVerified, true);
    assert.equal(result.evidenceStatus.evidenceStrength, EVIDENCE_STRENGTH.VERIFIED);
    assert.equal(result.evidenceResult.eligibleForVerified, true);
    assert.equal(result.evidenceResult.evidence?.strength, 'verified');
  });

  it('accepts alternative short_answer matches from acceptedAnswers list', () => {
    for (const accepted of ['npm i', 'npm add', 'NPM INSTALL']) {
      const q = allTypesAssessment.questions.find((x) => x.id === 'q_sa');
      const evalRes = scoreQuestion(q, accepted);
      assert.equal(evalRes.isCorrect, true);
      assert.equal(evalRes.earnedPoints, 1);
      assert.equal(evalRes.scoringRule, 'short_answer_keyword_match');
    }
  });
});

describe('TASK A08 — Assessment Scoring Correctness: Boundary Submissions', () => {
  it('correctly handles exact passMark threshold boundary (score === passMark passes, score < passMark fails)', () => {
    // Construct 10-question assessment where each question is weight 1 (total 10 pts, passMark 0.70)
    const thresholdDef = {
      id: 'asm_threshold_check',
      version: 1,
      skillKey: 'Node.js',
      difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
      title: 'Threshold Boundary Check',
      description: 'Checks exact threshold boundary conditions.',
      passMark: 0.7,
      questions: Array.from({ length: 10 }, (_, i) => ({
        id: `q_${i}`,
        type: QUESTION_TYPES.BOOLEAN,
        prompt: `Question ${i}`,
        weight: 1,
        expectedAnswer: { expectedValue: true },
      })),
    };

    // Exactly 7 of 10 correct -> score = 0.7000 === 0.7 -> PASS
    const passBoundary = evaluateAssessmentSubmission({
      assessment: thresholdDef,
      submission: {
        studentId: 'student_exact_pass',
        answers: {
          q_0: true, q_1: true, q_2: true, q_3: true, q_4: true, q_5: true, q_6: true,
          q_7: false, q_8: false, q_9: false,
        },
      },
    });
    assert.equal(passBoundary.score, 0.7);
    assert.equal(passBoundary.passed, true);
    assert.equal(passBoundary.outcome, 'pass');

    // 6 of 10 correct -> score = 0.6000 < 0.7 -> FAIL
    const failBoundary = evaluateAssessmentSubmission({
      assessment: thresholdDef,
      submission: {
        studentId: 'student_just_below_pass',
        answers: {
          q_0: true, q_1: true, q_2: true, q_3: true, q_4: true, q_5: true,
          q_6: false, q_7: false, q_8: false, q_9: false,
        },
      },
    });
    assert.equal(failBoundary.score, 0.6);
    assert.equal(failBoundary.passed, false);
    assert.equal(failBoundary.outcome, 'fail');
  });

  it('correctly handles time limit boundary: inside grace period vs expired timeout', () => {
    const timeLimitDef = {
      ...allTypesAssessment,
      id: 'asm_timed_boundary',
      timeLimitMinutes: 10, // 10 minutes + 60s default grace = 11 minutes total (660,000 ms)
    };
    const startTime = new Date('2026-09-26T12:00:00.000Z');

    // 1. Exactly at 11 minutes (660,000 ms): inside grace period -> evaluated normally
    const onTimeEval = evaluateAssessmentSubmission({
      assessment: timeLimitDef,
      submission: {
        studentId: 'student_ontime',
        startedAt: startTime,
        answers: { q_bool: true },
      },
      evaluatedAt: new Date(startTime.getTime() + 660000), // exactly 11 minutes
    });
    assert.equal(onTimeEval.status, 'evaluated');
    assert.notEqual(onTimeEval.questionResults.find((q) => q.questionId === 'q_bool').scoringRule, 'timed_out_zero_points');

    // 2. At 11 minutes + 1 ms: exceeded grace period -> timed out to zero
    const timedOutEval = evaluateAssessmentSubmission({
      assessment: timeLimitDef,
      submission: {
        studentId: 'student_timeout',
        startedAt: startTime,
        answers: { q_bool: true },
      },
      evaluatedAt: new Date(startTime.getTime() + 660001), // 1ms past grace
    });
    assert.equal(timedOutEval.status, 'timed_out');
    assert.equal(timedOutEval.score, 0);
    assert.equal(timedOutEval.passed, false);
    assert.equal(timedOutEval.outcome, 'fail');
    assert.equal(timedOutEval.evidenceStatus.eligibleForVerified, false);
    assert.match(timedOutEval.evidenceStatus.reason, /timed out/i);
    for (const qr of timedOutEval.questionResults) {
      assert.equal(qr.scoringRule, 'timed_out_zero_points');
      assert.equal(qr.earnedPoints, 0);
    }
  });

  it('normalizes CRLF and lone CR in code_output and short_answer without cross-platform defects', () => {
    const qCode = {
      id: 'q_crlf',
      type: QUESTION_TYPES.CODE_OUTPUT,
      prompt: 'Multi-line code prediction',
      weight: 1,
      expectedAnswer: {
        expectedOutput: 'Line 1\nLine 2',
        trimWhitespace: true,
        caseSensitive: true,
      },
    };

    // Windows CRLF input
    const crlfEval = scoreQuestion(qCode, 'Line 1\r\nLine 2');
    assert.equal(crlfEval.isCorrect, true);
    assert.equal(crlfEval.scoringRule, 'code_output_normalized_match');

    // Classic Mac CR input
    const crEval = scoreQuestion(qCode, 'Line 1\rLine 2');
    assert.equal(crEval.isCorrect, true);
    assert.equal(crEval.scoringRule, 'code_output_normalized_match');
  });

  it('deduplicates multiple-choice student selections without inflating scores or penalties', () => {
    const q = allTypesAssessment.questions.find((x) => x.id === 'q_mc_partial');

    // Duplicate correct selections: ['opt_fs', 'opt_fs', 'opt_path']
    const dedupCorrect = scoreQuestion(q, ['opt_fs', 'opt_fs', 'opt_path']);
    assert.equal(dedupCorrect.status, QUESTION_ANSWER_STATUS.CORRECT);
    assert.equal(dedupCorrect.ratio, 1.0);
    assert.equal(dedupCorrect.earnedPoints, 2.0);

    // Duplicate incorrect selections: ['opt_fs', 'opt_path', 'opt_express', 'opt_express']
    // If not deduplicated: 2 correct - 2 incorrect = 0 points.
    // Because deduplicated: 2 correct - 1 incorrect = (2 - 1) / 2 = 0.5 ratio -> 1.0 earned point (partial)
    const dedupWrong = scoreQuestion(q, ['opt_fs', 'opt_path', 'opt_express', 'opt_express']);
    assert.equal(dedupWrong.status, QUESTION_ANSWER_STATUS.PARTIAL);
    assert.equal(dedupWrong.ratio, 0.5);
    assert.equal(dedupWrong.earnedPoints, 1.0);
  });

  it('supports answer submissions in both key-value object and array formats', () => {
    // Array format answers
    const arrayAnswers = [
      { questionId: 'q_sc', answer: 'opt_check' },
      { questionId: 'q_bool', answer: true },
    ];

    const result = evaluateAssessmentSubmission({
      assessment: allTypesAssessment,
      submission: {
        studentId: 'student_array_fmt',
        assessmentId: allTypesAssessment.id,
        answers: arrayAnswers,
      },
    });

    const sc = result.questionResults.find((q) => q.questionId === 'q_sc');
    assert.equal(sc.status, QUESTION_ANSWER_STATUS.CORRECT);
    assert.equal(sc.earnedPoints, 1);

    const bool = result.questionResults.find((q) => q.questionId === 'q_bool');
    assert.equal(bool.status, QUESTION_ANSWER_STATUS.CORRECT);
    assert.equal(bool.earnedPoints, 1);
  });
});

describe('TASK A08 — Assessment Scoring Correctness: Malformed Submissions', () => {
  it('gracefully marks malformed inputs as INVALID across all 5 supported question types', () => {
    const qSc = allTypesAssessment.questions.find((x) => x.id === 'q_sc');
    const qMc = allTypesAssessment.questions.find((x) => x.id === 'q_mc_partial');
    const qCode = allTypesAssessment.questions.find((x) => x.id === 'q_code');
    const qSa = allTypesAssessment.questions.find((x) => x.id === 'q_sa');
    const qBool = allTypesAssessment.questions.find((x) => x.id === 'q_bool');

    // 1. Single Choice: non-existent option ID -> invalid_option_id_not_found
    const scInvalidId = scoreQuestion(qSc, 'opt_unknown_999');
    assert.equal(scInvalidId.status, QUESTION_ANSWER_STATUS.INVALID);
    assert.equal(scInvalidId.scoringRule, 'invalid_option_id_not_found');

    // Single Choice: non-scalar type -> invalid_single_choice_type
    const scInvalidType = scoreQuestion(qSc, { malicious: true });
    assert.equal(scInvalidType.status, QUESTION_ANSWER_STATUS.INVALID);
    assert.equal(scInvalidType.scoringRule, 'invalid_single_choice_type');

    // 2. Multiple Choice: non-array answer -> invalid_multiple_choice_expected_array
    const mcInvalidType = scoreQuestion(qMc, 'opt_fs');
    assert.equal(mcInvalidType.status, QUESTION_ANSWER_STATUS.INVALID);
    assert.equal(mcInvalidType.scoringRule, 'invalid_multiple_choice_expected_array');

    // Multiple Choice: unknown option ID in array -> invalid_option_id_in_selection
    const mcInvalidOption = scoreQuestion(qMc, ['opt_fs', 'opt_injection_404']);
    assert.equal(mcInvalidOption.status, QUESTION_ANSWER_STATUS.INVALID);
    assert.equal(mcInvalidOption.scoringRule, 'invalid_option_id_in_selection');

    // 3. Code Output: non-string answer -> invalid_code_output_expected_string
    const codeInvalidType = scoreQuestion(qCode, 12345);
    assert.equal(codeInvalidType.status, QUESTION_ANSWER_STATUS.INVALID);
    assert.equal(codeInvalidType.scoringRule, 'invalid_code_output_expected_string');

    // 4. Short Answer: non-string answer -> invalid_short_answer_expected_string
    const saInvalidType = scoreQuestion(qSa, true);
    assert.equal(saInvalidType.status, QUESTION_ANSWER_STATUS.INVALID);
    assert.equal(saInvalidType.scoringRule, 'invalid_short_answer_expected_string');

    // 5. Boolean: unrecognized string -> invalid_boolean_format
    const boolInvalidFormat = scoreQuestion(qBool, 'maybe_not_sure');
    assert.equal(boolInvalidFormat.status, QUESTION_ANSWER_STATUS.INVALID);
    assert.equal(boolInvalidFormat.scoringRule, 'invalid_boolean_format');
  });

  it('rejects malformed submission payloads missing studentId or with invalid dates', () => {
    assert.throws(
      () => evaluateAssessmentSubmission({
        assessment: allTypesAssessment,
        submission: null,
      }),
      /submission must be an object/i,
    );

    assert.throws(
      () => evaluateAssessmentSubmission({
        assessment: allTypesAssessment,
        submission: { studentId: '' },
      }),
      /submission\.studentId is required/i,
    );

    assert.throws(
      () => evaluateAssessmentSubmission({
        assessment: allTypesAssessment,
        submission: { studentId: 'student_1' },
        evaluatedAt: 'invalid-date-format',
      }),
      /evaluatedAt must be a valid date/i,
    );

    assert.throws(
      () => evaluateAssessmentSubmission({
        assessment: allTypesAssessment,
        submission: {
          studentId: 'student_1',
          assessmentId: 'wrong_asm_id',
        },
      }),
      /does not match definition id/i,
    );
  });

  it('safely ignores extraneous question IDs submitted by the student without corrupting question counts', () => {
    const result = evaluateAssessmentSubmission({
      assessment: allTypesAssessment,
      submission: {
        studentId: 'student_extra_keys',
        assessmentId: allTypesAssessment.id,
        answers: {
          q_sc: 'opt_check',
          extra_unknown_question_1: 'some_answer',
          extra_unknown_question_2: 'another_answer',
        },
      },
    });

    assert.equal(result.totalQuestions, 6);
    assert.equal(result.questionResults.length, 6);
    assert.equal(result.scoringSummary.totalQuestions, 6);
  });
});

describe('TASK A08 — Assessment Scoring Correctness: Model Projection Parity', () => {
  it('verifies toPublicAssessmentAttempt accurately projects status and scoringRule for client review', () => {
    const mockAttemptDoc = {
      _id: '507f1f77bcf86cd799439011',
      assessmentId: 'asm_mock_test',
      attemptNumber: 1,
      version: 1,
      skillKey: 'Node.js',
      skillName: 'Node.js',
      difficulty: 'intermediate',
      status: 'evaluated',
      score: 0.75,
      passMark: 0.7,
      passed: true,
      outcome: 'pass',
      earnedPoints: 3,
      maxPoints: 4,
      totalQuestions: 2,
      correctQuestionsCount: 1,
      questionResults: [
        {
          questionId: 'q1',
          status: 'correct',
          scoringRule: 'exact_single_choice_match',
          prompt: 'Question 1',
          weight: 2,
          studentAnswer: 'opt_a',
          isCorrect: true,
          ratio: 1,
          earnedPoints: 2,
          maxPoints: 2,
        },
        {
          questionId: 'q2',
          status: 'partial',
          scoringRule: 'partial_credit_proportional',
          prompt: 'Question 2',
          weight: 2,
          studentAnswer: ['opt_b'],
          isCorrect: false,
          ratio: 0.5,
          earnedPoints: 1,
          maxPoints: 2,
        },
      ],
      startedAt: new Date('2026-09-26T10:00:00Z'),
      completedAt: new Date('2026-09-26T10:05:00Z'),
      durationSeconds: 300,
    };

    const publicAttempt = toPublicAssessmentAttempt(mockAttemptDoc);

    assert.equal(publicAttempt.score, 0.75);
    assert.equal(publicAttempt.passed, true);
    assert.equal(publicAttempt.questionResults.length, 2);

    const qr1 = publicAttempt.questionResults[0];
    assert.equal(qr1.status, 'correct');
    assert.equal(qr1.scoringRule, 'exact_single_choice_match');
    assert.equal(qr1.isCorrect, true);

    const qr2 = publicAttempt.questionResults[1];
    assert.equal(qr2.status, 'partial');
    assert.equal(qr2.scoringRule, 'partial_credit_proportional');
    assert.equal(qr2.isCorrect, false);
  });
});
