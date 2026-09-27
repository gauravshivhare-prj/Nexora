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
  scoreQuestion,
  validateAssessmentDefinition,
} from '../src/domain/assessment/assessmentContract.js';
import { getAssessmentCatalog } from '../src/domain/assessment/assessmentCatalog.js';
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

describe('A06 — Question-Bank Quality & Cross-Platform Integrity Audit', () => {
  const bank = getQuestionBank();
  const catalog = getAssessmentCatalog();
  const catalogQuestions = catalog.flatMap((asm) => asm.questions);

  it('audits answer validity across all questions in question bank', () => {
    for (const q of bank) {
      if (q.type === QUESTION_TYPES.SINGLE_CHOICE) {
        assert.ok(Array.isArray(q.options) && q.options.length >= 2);
        const optIds = q.options.map((o) => o.id);
        assert.ok(optIds.includes(q.expectedAnswer.correctOptionId));
        const evalRes = scoreQuestion(q, q.expectedAnswer.correctOptionId);
        assert.equal(evalRes.isCorrect, true);
        assert.equal(evalRes.status, 'correct');
      } else if (q.type === QUESTION_TYPES.MULTIPLE_CHOICE) {
        assert.ok(Array.isArray(q.options) && q.options.length >= 2);
        const optIds = q.options.map((o) => o.id);
        for (const correctId of q.expectedAnswer.correctOptionIds) {
          assert.ok(optIds.includes(correctId));
        }
        const evalRes = scoreQuestion(q, q.expectedAnswer.correctOptionIds);
        assert.equal(evalRes.isCorrect, true);
        assert.equal(evalRes.status, 'correct');
      } else if (q.type === QUESTION_TYPES.CODE_OUTPUT) {
        assert.equal(typeof q.expectedAnswer.expectedOutput, 'string');
        assert.ok(q.expectedAnswer.expectedOutput.length > 0);
        const evalRes = scoreQuestion(q, q.expectedAnswer.expectedOutput);
        assert.equal(evalRes.isCorrect, true);
        const crlfAnswer = q.expectedAnswer.expectedOutput.replace(/\n/g, '\r\n');
        const evalCrlf = scoreQuestion(q, crlfAnswer);
        assert.equal(evalCrlf.isCorrect, true);
      } else if (q.type === QUESTION_TYPES.SHORT_ANSWER) {
        assert.ok(Array.isArray(q.expectedAnswer.acceptedAnswers));
        assert.ok(q.expectedAnswer.acceptedAnswers.length > 0);
        for (const accepted of q.expectedAnswer.acceptedAnswers) {
          assert.equal(typeof accepted, 'string');
          assert.ok(accepted.trim().length > 0);
          const evalRes = scoreQuestion(q, accepted);
          assert.equal(evalRes.isCorrect, true);
        }
      } else if (q.type === QUESTION_TYPES.BOOLEAN) {
        assert.equal(typeof q.expectedAnswer.expectedValue, 'boolean');
        const evalCorrect = scoreQuestion(q, q.expectedAnswer.expectedValue);
        assert.equal(evalCorrect.isCorrect, true);
        const evalWrong = scoreQuestion(q, !q.expectedAnswer.expectedValue);
        assert.equal(evalWrong.isCorrect, false);
      }
    }
  });

  it('audits answer validity across all questions in assessment catalog', () => {
    for (const q of catalogQuestions) {
      if (q.type === QUESTION_TYPES.SINGLE_CHOICE) {
        assert.ok(Array.isArray(q.options) && q.options.length >= 2);
        const optIds = q.options.map((o) => o.id);
        assert.ok(optIds.includes(q.expectedAnswer.correctOptionId));
        const evalRes = scoreQuestion(q, q.expectedAnswer.correctOptionId);
        assert.equal(evalRes.isCorrect, true);
      } else if (q.type === QUESTION_TYPES.MULTIPLE_CHOICE) {
        assert.ok(Array.isArray(q.options) && q.options.length >= 2);
        const optIds = q.options.map((o) => o.id);
        for (const correctId of q.expectedAnswer.correctOptionIds) {
          assert.ok(optIds.includes(correctId));
        }
        const evalRes = scoreQuestion(q, q.expectedAnswer.correctOptionIds);
        assert.equal(evalRes.isCorrect, true);
      } else if (q.type === QUESTION_TYPES.CODE_OUTPUT) {
        assert.equal(typeof q.expectedAnswer.expectedOutput, 'string');
        const evalRes = scoreQuestion(q, q.expectedAnswer.expectedOutput);
        assert.equal(evalRes.isCorrect, true);
        const crlfAnswer = q.expectedAnswer.expectedOutput.replace(/\n/g, '\r\n');
        assert.equal(scoreQuestion(q, crlfAnswer).isCorrect, true);
      } else if (q.type === QUESTION_TYPES.SHORT_ANSWER) {
        assert.ok(Array.isArray(q.expectedAnswer.acceptedAnswers));
        for (const accepted of q.expectedAnswer.acceptedAnswers) {
          assert.equal(scoreQuestion(q, accepted).isCorrect, true);
        }
      } else if (q.type === QUESTION_TYPES.BOOLEAN) {
        assert.equal(typeof q.expectedAnswer.expectedValue, 'boolean');
        assert.equal(scoreQuestion(q, q.expectedAnswer.expectedValue).isCorrect, true);
        assert.equal(scoreQuestion(q, !q.expectedAnswer.expectedValue).isCorrect, false);
      }
    }
  });

  it('verifies verified quality fixes for short-answer accepted answers', () => {
    // Git staging in question bank
    const gitQ = getQuestionById('qb_git_beg_staging');
    assert.ok(gitQ);
    assert.ok(gitQ.expectedAnswer.acceptedAnswers.includes('git add --all'));
    assert.equal(scoreQuestion(gitQ, 'git add --all').isCorrect, true);
    assert.equal(scoreQuestion(gitQ, '  GIT ADD --ALL  ').isCorrect, true);

    // Docker CLI in assessment catalog
    const dockerQ = catalogQuestions.find((q) => q.id === 'q_docker_cli');
    assert.ok(dockerQ);
    assert.ok(dockerQ.expectedAnswer.acceptedAnswers.includes('docker container prune --force'));
    assert.ok(dockerQ.expectedAnswer.acceptedAnswers.includes('docker system prune -f'));
    assert.ok(dockerQ.expectedAnswer.acceptedAnswers.includes('docker system prune --force'));
    assert.equal(scoreQuestion(dockerQ, 'docker container prune --force').isCorrect, true);
    assert.equal(scoreQuestion(dockerQ, 'docker system prune -f').isCorrect, true);
  });

  it('verifies cross-platform newline normalization when trimWhitespace is false', () => {
    const qNoTrim = {
      id: 'q_custom_notrim',
      type: QUESTION_TYPES.CODE_OUTPUT,
      weight: 1,
      expectedAnswer: {
        expectedOutput: 'Line1\nLine2',
        trimWhitespace: false,
        caseSensitive: true,
      },
    };

    // Submitting with Windows \r\n should match Linux \n expectedOutput even when trimWhitespace is false
    const windowsAnswer = 'Line1\r\nLine2';
    const evalRes = scoreQuestion(qNoTrim, windowsAnswer);
    assert.equal(evalRes.isCorrect, true, 'CRLF must match LF even when trimWhitespace is false');

    // But leading/trailing whitespace difference should still be respected
    const trailingSpaceAnswer = 'Line1\nLine2 ';
    assert.equal(scoreQuestion(qNoTrim, trailingSpaceAnswer).isCorrect, false);
  });

  it('audits skill mapping: all questions ground in canonical taxonomy with coverage for frontend', () => {
    for (const q of bank) {
      const canonical = canonicalSkill(q.skillKey);
      assert.ok(canonical, `Question "${q.id}" has invalid canonical skill "${q.skillKey}"`);
      assert.equal(q.skillKey, canonical.key);
      assert.equal(q.skillName, canonical.name);
    }

    // Verify React and HTML questions are now present and assemblable
    const reactQuestions = getQuestionsForSkill({ skill: 'React' });
    assert.ok(reactQuestions.length >= 2, 'Must have React questions');
    const assembledReact = assembleAssessmentFromBank({ skill: 'React', questionCount: 2 });
    assert.equal(assembledReact.skillKey, 'react');
    assert.equal(assembledReact.questions.length, 2);

    const htmlQuestions = getQuestionsForSkill({ skill: 'HTML' });
    assert.ok(htmlQuestions.length >= 2, 'Must have HTML questions');
    const assembledHtml = assembleAssessmentFromBank({ skill: 'HTML', questionCount: 2 });
    assert.equal(assembledHtml.skillKey, 'html');
    assert.equal(assembledHtml.questions.length, 2);
  });

  it('audits duplicates: verifies zero duplicate IDs or prompts across bank and catalog', () => {
    // 1. Question IDs
    const bankIds = new Set(bank.map((q) => q.id));
    assert.equal(bankIds.size, bank.length, 'No duplicate IDs in question bank');

    const catalogIds = new Set(catalogQuestions.map((q) => q.id));
    assert.equal(catalogIds.size, catalogQuestions.length, 'No duplicate IDs in catalog');

    for (const id of bankIds) {
      assert.ok(!catalogIds.has(id), `Question ID "${id}" duplicated between bank and catalog`);
    }

    // 2. Question prompts (normalized)
    const normalizePrompt = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const bankPrompts = new Map();
    for (const q of bank) {
      const norm = normalizePrompt(q.prompt);
      assert.ok(!bankPrompts.has(norm), `Duplicate prompt in bank: "${q.prompt}" and "${bankPrompts.get(norm)}"`);
      bankPrompts.set(norm, q.id);
    }

    for (const q of catalogQuestions) {
      const norm = normalizePrompt(q.prompt);
      assert.ok(!bankPrompts.has(norm), `Duplicate prompt between catalog ("${q.id}") and bank ("${bankPrompts.get(norm)}")`);
    }
  });

  it('audits difficulty calibration across tiers', () => {
    const difficulties = bank.map((q) => q.difficulty);
    const beginnerCount = difficulties.filter((d) => d === DIFFICULTY_LEVELS.BEGINNER).length;
    const intermediateCount = difficulties.filter((d) => d === DIFFICULTY_LEVELS.INTERMEDIATE).length;
    const advancedCount = difficulties.filter((d) => d === DIFFICULTY_LEVELS.ADVANCED).length;

    assert.ok(beginnerCount >= 5, `Expected >= 5 beginner questions, found ${beginnerCount}`);
    assert.ok(intermediateCount >= 5, `Expected >= 5 intermediate questions, found ${intermediateCount}`);
    assert.ok(advancedCount >= 3, `Expected >= 3 advanced questions, found ${advancedCount}`);
  });
});
