import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  QUESTION_BANK_VERSION,
  assembleAssessmentFromBank,
  getQuestionById,
  getQuestionBank,
  getQuestionsForSkill,
} from '../src/domain/assessment/questionBank.js';
import {
  DIFFICULTY_LEVELS,
  DIFFICULTY_LEVEL_VALUES,
  QUESTION_TYPES,
  evaluateAssessmentSubmission,
  validateAssessmentDefinition,
} from '../src/domain/assessment/assessmentContract.js';
import { canonicalSkill, skillKey } from '../src/domain/skills/skillKey.js';
import { ASSESSMENT_LIMITS } from '../src/constants/assessmentPolicy.js';

describe('A4 — Curated Question Bank: Schema & Integrity', () => {
  const bank = getQuestionBank();

  it('exposes question bank version 1', () => {
    assert.equal(QUESTION_BANK_VERSION, 1);
  });

  it('contains a curated set of questions across canonical Nexora skills', () => {
    assert.ok(bank.length >= 15, `Expected at least 15 curated questions, found ${bank.length}`);
  });

  it('ensures zero duplicate question IDs across the entire bank', () => {
    const seenIds = new Set();
    for (const q of bank) {
      assert.ok(
        !seenIds.has(q.id),
        `Duplicate question ID found: "${q.id}". All IDs must be unique.`,
      );
      seenIds.add(q.id);
    }
  });

  it('validates that every question complies with the strict question schema', () => {
    for (const q of bank) {
      // ID format
      assert.match(
        q.id,
        /^qb_[a-z0-9_-]+$/,
        `Question ID "${q.id}" must match qb_<slug> format.`,
      );

      // Prompt length
      assert.ok(
        typeof q.prompt === 'string' &&
          q.prompt.length >= ASSESSMENT_LIMITS.prompt.min &&
          q.prompt.length <= ASSESSMENT_LIMITS.prompt.max,
        `Question "${q.id}" prompt length (${q.prompt?.length}) out of bounds.`,
      );

      // Type validity
      assert.ok(
        Object.values(QUESTION_TYPES).includes(q.type),
        `Question "${q.id}" has invalid type "${q.type}".`,
      );

      // Weight validity
      assert.ok(
        typeof q.weight === 'number' && Number.isFinite(q.weight) && q.weight > 0,
        `Question "${q.id}" must have a positive finite weight.`,
      );

      // Code snippet length if present
      if (q.codeSnippet) {
        assert.ok(
          q.codeSnippet.length <= ASSESSMENT_LIMITS.codeSnippet.max,
          `Question "${q.id}" code snippet exceeds limit.`,
        );
      }

      // Explanation if present
      if (q.explanation) {
        assert.ok(
          typeof q.explanation === 'string' &&
            q.explanation.length <= ASSESSMENT_LIMITS.explanation.max,
          `Question "${q.id}" explanation exceeds limit.`,
        );
      }

      // Choice options & expectedAnswer
      if (q.type === QUESTION_TYPES.SINGLE_CHOICE || q.type === QUESTION_TYPES.MULTIPLE_CHOICE) {
        assert.ok(
          Array.isArray(q.options) &&
            q.options.length >= ASSESSMENT_LIMITS.options.minItems &&
            q.options.length <= ASSESSMENT_LIMITS.options.maxItems,
          `Question "${q.id}" must have between ${ASSESSMENT_LIMITS.options.minItems} and ${ASSESSMENT_LIMITS.options.maxItems} options.`,
        );

        const optIds = new Set();
        for (const opt of q.options) {
          assert.ok(opt.id && typeof opt.id === 'string', `Option in "${q.id}" missing id`);
          assert.ok(opt.text && typeof opt.text === 'string', `Option "${opt.id}" in "${q.id}" missing text`);
          assert.ok(!optIds.has(opt.id), `Duplicate option ID "${opt.id}" in question "${q.id}"`);
          optIds.add(opt.id);
        }

        if (q.type === QUESTION_TYPES.SINGLE_CHOICE) {
          assert.ok(
            q.expectedAnswer?.correctOptionId,
            `Question "${q.id}" missing expectedAnswer.correctOptionId`,
          );
          assert.ok(
            optIds.has(q.expectedAnswer.correctOptionId),
            `Question "${q.id}" correctOptionId "${q.expectedAnswer.correctOptionId}" not found in options`,
          );
        } else {
          assert.ok(
            Array.isArray(q.expectedAnswer?.correctOptionIds) &&
              q.expectedAnswer.correctOptionIds.length > 0,
            `Question "${q.id}" missing correctOptionIds array`,
          );
          for (const cId of q.expectedAnswer.correctOptionIds) {
            assert.ok(
              optIds.has(cId),
              `Question "${q.id}" correct option "${cId}" not found in options`,
            );
          }
        }
      } else if (q.type === QUESTION_TYPES.CODE_OUTPUT) {
        assert.ok(
          typeof q.expectedAnswer?.expectedOutput === 'string',
          `Question "${q.id}" missing expectedOutput string`,
        );
      } else if (q.type === QUESTION_TYPES.SHORT_ANSWER) {
        assert.ok(
          Array.isArray(q.expectedAnswer?.acceptedAnswers) &&
            q.expectedAnswer.acceptedAnswers.length > 0,
          `Question "${q.id}" missing acceptedAnswers array`,
        );
      } else if (q.type === QUESTION_TYPES.BOOLEAN) {
        assert.ok(
          typeof q.expectedAnswer?.expectedValue === 'boolean',
          `Question "${q.id}" missing expectedValue boolean`,
        );
      }
    }
  });

  it('verifies that every question grounds strictly in Nexora canonical skill taxonomy', () => {
    for (const q of bank) {
      const canonical = canonicalSkill(q.skillKey);
      assert.ok(
        canonical,
        `Question "${q.id}" skillKey "${q.skillKey}" does not exist in Nexora taxonomy.`,
      );
      assert.equal(
        q.skillKey,
        canonical.key,
        `Question "${q.id}" skillKey must be the canonical key "${canonical.key}".`,
      );
      assert.equal(
        q.skillName,
        canonical.name,
        `Question "${q.id}" skillName must be the canonical name "${canonical.name}".`,
      );
    }
  });

  it('verifies appropriate difficulty distributions', () => {
    const difficulties = new Set(bank.map((q) => q.difficulty));
    assert.ok(difficulties.has(DIFFICULTY_LEVELS.BEGINNER), 'Must contain beginner questions');
    assert.ok(difficulties.has(DIFFICULTY_LEVELS.INTERMEDIATE), 'Must contain intermediate questions');
    assert.ok(difficulties.has(DIFFICULTY_LEVELS.ADVANCED), 'Must contain advanced questions');

    for (const q of bank) {
      assert.ok(
        DIFFICULTY_LEVEL_VALUES.includes(q.difficulty),
        `Question "${q.id}" has invalid difficulty "${q.difficulty}"`,
      );
    }
  });
});

describe('A4 — Curated Question Bank: Deterministic Retrieval & Ordering', () => {
  it('guarantees deterministic, stable ordering across multiple retrievals', () => {
    const run1 = getQuestionsForSkill({ skill: 'JavaScript' });
    const run2 = getQuestionsForSkill({ skill: 'JavaScript' });
    const run3 = getQuestionsForSkill({ skill: 'js' }); // alias

    assert.ok(run1.length > 0);
    assert.deepEqual(run1, run2);
    assert.deepEqual(run1, run3);

    // Verify ordering is strictly alphabetical by ID
    const ids = run1.map((q) => q.id);
    const sortedIds = [...ids].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(ids, sortedIds, 'Questions must be sorted deterministically by ID');
  });

  it('correctly filters by difficulty and limit deterministically', () => {
    const beginner = getQuestionsForSkill({ skill: 'Python', difficulty: 'beginner' });
    for (const q of beginner) {
      assert.equal(q.difficulty, 'beginner');
      assert.equal(q.skillKey, 'python');
    }

    const limited = getQuestionsForSkill({ skill: 'JavaScript', limit: 2 });
    assert.equal(limited.length, 2);
    assert.equal(limited[0].id, getQuestionsForSkill({ skill: 'JavaScript' })[0].id);
    assert.equal(limited[1].id, getQuestionsForSkill({ skill: 'JavaScript' })[1].id);
  });

  it('retrieves single questions by ID and returns null for unknown IDs', () => {
    const q = getQuestionById('qb_js_beg_equality');
    assert.ok(q);
    assert.equal(q.id, 'qb_js_beg_equality');
    assert.equal(q.skillKey, 'javascript');

    const notFound = getQuestionById('non_existent_qb_id');
    assert.equal(notFound, null);
  });
});

describe('A4 — Curated Question Bank: Dynamic Assessment Assembly', () => {
  it('assembles a fully compliant assessment definition from the question bank', () => {
    const assembled = assembleAssessmentFromBank({
      skill: 'JavaScript',
      difficulty: 'intermediate',
      questionCount: 3,
    });

    assert.ok(assembled);
    assert.equal(assembled.skillKey, 'javascript');
    assert.equal(assembled.skillName, 'JavaScript');
    assert.equal(assembled.difficulty, 'intermediate');
    assert.equal(assembled.questions.length, 3);

    // Validate using core domain validator
    assert.doesNotThrow(() => validateAssessmentDefinition(assembled));
  });

  it('assembled assessment can be evaluated deterministically and produces verified evidence', () => {
    const assembled = assembleAssessmentFromBank({
      id: 'asm_assembled_python_test',
      skill: 'Python',
      difficulty: 'intermediate',
      questionCount: 2,
    });

    // Provide correct answers to all questions
    const answers = {};
    for (const q of assembled.questions) {
      if (q.type === QUESTION_TYPES.CODE_OUTPUT) {
        answers[q.id] = q.expectedAnswer.expectedOutput;
      } else if (q.type === QUESTION_TYPES.MULTIPLE_CHOICE) {
        answers[q.id] = q.expectedAnswer.correctOptionIds;
      } else if (q.type === QUESTION_TYPES.SINGLE_CHOICE) {
        answers[q.id] = q.expectedAnswer.correctOptionId;
      } else if (q.type === QUESTION_TYPES.BOOLEAN) {
        answers[q.id] = q.expectedAnswer.expectedValue;
      } else if (q.type === QUESTION_TYPES.SHORT_ANSWER) {
        answers[q.id] = q.expectedAnswer.acceptedAnswers[0];
      }
    }

    const evalResult = evaluateAssessmentSubmission({
      assessment: assembled,
      submission: {
        assessmentId: assembled.id,
        studentId: 'student_assembled_test',
        answers,
      },
    });

    assert.equal(evalResult.passed, true);
    assert.equal(evalResult.score, 1);
    assert.equal(evalResult.outcome, 'pass');
    assert.equal(evalResult.evidenceResult.eligibleForVerified, true);
    assert.equal(evalResult.evidenceResult.evidence.strength, 'verified');
    assert.equal(evalResult.evidenceResult.evidence.source, 'assessment');
  });

  it('rejects assembly for unknown canonical skills', () => {
    assert.throws(
      () => assembleAssessmentFromBank({ skill: 'MadeUpLanguage_XYZ' }),
      /Unknown canonical skill/,
    );
  });
});
