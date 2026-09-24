import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ASSESSMENT_CONTRACT_VERSION,
  ATTEMPT_STATUS,
  DEFAULT_GRACE_PERIOD_SECONDS,
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  SCORING_STRATEGIES,
  createAssessmentAttempt,
  evaluateAssessmentSubmission,
  sanitizeAssessmentForStudent,
  scoreQuestion,
  validateAssessmentDefinition,
} from '../src/domain/assessment/assessmentContract.js';

import {
  ASSESSMENT_CATALOG,
  getAssessmentById,
  getAssessmentCatalog,
  getAssessmentsForSkill,
} from '../src/domain/assessment/assessmentCatalog.js';

import { buildCareerTwin } from '../src/domain/careerTwin/buildCareerTwin.js';
import { CHECK_OUTCOMES } from '../src/domain/evidence/skillEvidenceCheck.js';

describe('Assessment Domain Contract: Versioning and Enums', () => {
  it('exposes contract version 1', () => {
    assert.equal(ASSESSMENT_CONTRACT_VERSION, 1);
  });

  it('defines frozen difficulty levels', () => {
    assert.deepEqual(Object.values(DIFFICULTY_LEVELS), ['beginner', 'intermediate', 'advanced']);
    assert.throws(() => {
      DIFFICULTY_LEVELS.EXPERT = 'expert';
    });
  });

  it('defines frozen question types and attempt statuses', () => {
    assert.deepEqual(Object.values(QUESTION_TYPES), [
      'single_choice',
      'multiple_choice',
      'code_output',
      'short_answer',
      'boolean',
    ]);
    assert.deepEqual(Object.values(ATTEMPT_STATUS), [
      'in_progress',
      'submitted',
      'evaluated',
      'timed_out',
      'abandoned',
    ]);
  });
});

describe('Assessment Domain Contract: Definition Validation', () => {
  const validAssessment = {
    id: 'asm_test_javascript',
    version: 1,
    skillKey: 'JavaScript',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    title: 'JS Test',
    description: 'Testing validation',
    passMark: 0.7,
    timeLimitMinutes: 30,
    questions: [
      {
        id: 'q1',
        type: QUESTION_TYPES.SINGLE_CHOICE,
        prompt: 'Select opt 1',
        options: [
          { id: 'opt_1', text: 'Option 1' },
          { id: 'opt_2', text: 'Option 2' },
        ],
        expectedAnswer: {
          correctOptionId: 'opt_1',
        },
      },
    ],
  };

  it('successfully validates a well-formed assessment definition', () => {
    const validated = validateAssessmentDefinition(validAssessment);
    assert.equal(validated.id, 'asm_test_javascript');
    assert.equal(validated.skillKey, 'javascript');
    assert.equal(validated.skillName, 'JavaScript');
    assert.equal(validated.questions.length, 1);
  });

  it('resolves skill aliases to canonical skills', () => {
    const aliased = { ...validAssessment, skillKey: 'js' };
    const validated = validateAssessmentDefinition(aliased);
    assert.equal(validated.skillKey, 'javascript');
    assert.equal(validated.skillName, 'JavaScript');
  });

  it('rejects unknown skills not in Nexora taxonomy', () => {
    const unknown = { ...validAssessment, skillKey: 'HypotheticalTech_XYZ' };
    assert.throws(() => validateAssessmentDefinition(unknown), /Unknown canonical skill/);
  });

  it('rejects invalid assessment IDs', () => {
    assert.throws(
      () => validateAssessmentDefinition({ ...validAssessment, id: 'bad id with spaces!' }),
      /Assessment ID must be a non-empty alphanumeric slug/,
    );
    assert.throws(
      () => validateAssessmentDefinition({ ...validAssessment, id: '' }),
      /Assessment ID must be a non-empty alphanumeric slug/,
    );
  });

  it('rejects invalid passMark boundaries', () => {
    assert.throws(
      () => validateAssessmentDefinition({ ...validAssessment, passMark: 0 }),
      /passMark must be a number greater than 0 and at most 1/,
    );
    assert.throws(
      () => validateAssessmentDefinition({ ...validAssessment, passMark: 1.05 }),
      /passMark must be a number greater than 0 and at most 1/,
    );
  });

  it('rejects duplicate question IDs', () => {
    const duplicateQ = {
      ...validAssessment,
      questions: [
        validAssessment.questions[0],
        { ...validAssessment.questions[0], prompt: 'Another prompt' },
      ],
    };
    assert.throws(() => validateAssessmentDefinition(duplicateQ), /Duplicate question id: "q1"/);
  });

  it('rejects single-choice questions with non-existent correctOptionId', () => {
    const badChoice = {
      ...validAssessment,
      questions: [
        {
          id: 'q1',
          type: QUESTION_TYPES.SINGLE_CHOICE,
          prompt: 'Choose one',
          options: [
            { id: 'opt_1', text: 'Option 1' },
            { id: 'opt_2', text: 'Option 2' },
          ],
          expectedAnswer: { correctOptionId: 'opt_does_not_exist' },
        },
      ],
    };
    assert.throws(() => validateAssessmentDefinition(badChoice), /does not match any valid option ID/);
  });

  it('rejects multiple-choice questions with fewer than 2 options or invalid correct IDs', () => {
    const insufficientOpts = {
      ...validAssessment,
      questions: [
        {
          id: 'q1',
          type: QUESTION_TYPES.MULTIPLE_CHOICE,
          prompt: 'Choose multi',
          options: [{ id: 'opt_1', text: 'Option 1' }],
          expectedAnswer: { correctOptionIds: ['opt_1'] },
        },
      ],
    };
    assert.throws(() => validateAssessmentDefinition(insufficientOpts), /must have at least 2 options/);
  });
});

describe('Assessment Domain Contract: Student View Sanitization', () => {
  it('strips expected answers and explanations from student view', () => {
    const raw = {
      id: 'asm_student_view_test',
      skillKey: 'Node.js',
      difficulty: DIFFICULTY_LEVELS.BEGINNER,
      title: 'Node Sanitization Test',
      description: 'Check data leakage',
      questions: [
        {
          id: 'q_secret',
          type: QUESTION_TYPES.SINGLE_CHOICE,
          prompt: 'What is hidden?',
          options: [
            { id: 'opt_a', text: 'A' },
            { id: 'opt_b', text: 'B' },
          ],
          expectedAnswer: { correctOptionId: 'opt_a' },
          explanation: 'Top secret reason',
        },
      ],
    };

    const sanitized = sanitizeAssessmentForStudent(raw);
    assert.equal(sanitized.id, 'asm_student_view_test');
    assert.equal(sanitized.questions.length, 1);

    const q = sanitized.questions[0];
    assert.equal(q.id, 'q_secret');
    assert.equal(q.expectedAnswer, undefined);
    assert.equal(q.explanation, undefined);
    assert.deepEqual(q.options, [
      { id: 'opt_a', text: 'A' },
      { id: 'opt_b', text: 'B' },
    ]);
  });
});

describe('Assessment Domain Contract: Deterministic Question Scoring', () => {
  it('scores single-choice questions correctly', () => {
    const q = {
      id: 'q_sc',
      type: QUESTION_TYPES.SINGLE_CHOICE,
      weight: 2,
      expectedAnswer: { correctOptionId: 'opt_correct' },
    };

    const correct = scoreQuestion(q, 'opt_correct');
    assert.equal(correct.isCorrect, true);
    assert.equal(correct.ratio, 1);
    assert.equal(correct.earnedPoints, 2);

    const incorrect = scoreQuestion(q, 'opt_wrong');
    assert.equal(incorrect.isCorrect, false);
    assert.equal(incorrect.ratio, 0);
    assert.equal(incorrect.earnedPoints, 0);

    const missing = scoreQuestion(q, null);
    assert.equal(missing.isCorrect, false);
    assert.equal(missing.earnedPoints, 0);
  });

  it('scores multiple-choice questions with all-or-nothing strategy', () => {
    const q = {
      id: 'q_mc_aon',
      type: QUESTION_TYPES.MULTIPLE_CHOICE,
      weight: 3,
      expectedAnswer: {
        correctOptionIds: ['opt_1', 'opt_3'],
        strategy: SCORING_STRATEGIES.ALL_OR_NOTHING,
      },
    };

    assert.equal(scoreQuestion(q, ['opt_1', 'opt_3']).earnedPoints, 3);
    assert.equal(scoreQuestion(q, ['opt_3', 'opt_1']).earnedPoints, 3);
    assert.equal(scoreQuestion(q, ['opt_1']).earnedPoints, 0); // Partial missing
    assert.equal(scoreQuestion(q, ['opt_1', 'opt_2', 'opt_3']).earnedPoints, 0); // Extra wrong
  });

  it('scores multiple-choice questions with partial credit strategy', () => {
    const q = {
      id: 'q_mc_partial',
      type: QUESTION_TYPES.MULTIPLE_CHOICE,
      weight: 4,
      expectedAnswer: {
        correctOptionIds: ['opt_1', 'opt_2'],
        strategy: SCORING_STRATEGIES.PARTIAL_CREDIT,
      },
    };

    // 1 of 2 correct = 0.5 ratio -> 2 earned points
    const half = scoreQuestion(q, ['opt_1']);
    assert.equal(half.isCorrect, false);
    assert.equal(half.ratio, 0.5);
    assert.equal(half.earnedPoints, 2);

    // 1 correct + 1 incorrect = (1 - 1)/2 = 0 ratio -> 0 earned points
    const penalized = scoreQuestion(q, ['opt_1', 'opt_3']);
    assert.equal(penalized.ratio, 0);
    assert.equal(penalized.earnedPoints, 0);
  });

  it('scores code output questions with whitespace normalization', () => {
    const q = {
      id: 'q_code',
      type: QUESTION_TYPES.CODE_OUTPUT,
      weight: 1,
      expectedAnswer: {
        expectedOutput: 'Hello, World!\nDone',
        trimWhitespace: true,
        caseSensitive: true,
      },
    };

    // Exact with Windows \r\n and trailing space
    assert.equal(scoreQuestion(q, 'Hello, World!\r\nDone  \n').isCorrect, true);
    // Case mismatch when caseSensitive is true
    assert.equal(scoreQuestion(q, 'hello, world!\nDone').isCorrect, false);
  });

  it('scores short answer questions flexibly against accepted answers', () => {
    const q = {
      id: 'q_short',
      type: QUESTION_TYPES.SHORT_ANSWER,
      weight: 2,
      expectedAnswer: {
        acceptedAnswers: ['const', 'let'],
        caseSensitive: false,
        trimWhitespace: true,
      },
    };

    assert.equal(scoreQuestion(q, ' CONST  ').isCorrect, true);
    assert.equal(scoreQuestion(q, 'let').isCorrect, true);
    assert.equal(scoreQuestion(q, 'var').isCorrect, false);
  });

  it('scores boolean questions accurately', () => {
    const q = {
      id: 'q_bool',
      type: QUESTION_TYPES.BOOLEAN,
      weight: 1,
      expectedAnswer: { expectedValue: true },
    };

    assert.equal(scoreQuestion(q, true).isCorrect, true);
    assert.equal(scoreQuestion(q, 'true').isCorrect, true);
    assert.equal(scoreQuestion(q, false).isCorrect, false);
    assert.equal(scoreQuestion(q, 'false').isCorrect, false);
  });
});

describe('Assessment Domain Contract: Evaluation Engine & Reproducibility', () => {
  const assessment = {
    id: 'asm_eval_demo',
    skillKey: 'Python',
    difficulty: DIFFICULTY_LEVELS.BEGINNER,
    title: 'Python Evaluation Demo',
    description: 'Verifying score calculations',
    passMark: 0.7,
    timeLimitMinutes: 10,
    questions: [
      {
        id: 'q1',
        type: QUESTION_TYPES.SINGLE_CHOICE,
        prompt: 'Q1',
        weight: 1,
        options: [
          { id: 'opt_a', text: 'A' },
          { id: 'opt_b', text: 'B' },
        ],
        expectedAnswer: { correctOptionId: 'opt_a' },
      },
      {
        id: 'q2',
        type: QUESTION_TYPES.CODE_OUTPUT,
        prompt: 'Q2',
        weight: 2,
        expectedAnswer: { expectedOutput: '42' },
      },
      {
        id: 'q3',
        type: QUESTION_TYPES.BOOLEAN,
        prompt: 'Q3',
        weight: 1,
        expectedAnswer: { expectedValue: false },
      },
    ],
  };

  it('deterministically calculates overall scores across 100 iterations', () => {
    const submission = {
      assessmentId: 'asm_eval_demo',
      studentId: 'student_123',
      answers: {
        q1: 'opt_a', // correct (1/1)
        q2: '42',     // correct (2/2)
        q3: 'true',   // incorrect (0/1)
      },
    };

    // Expected: 3 / 4 points = 0.75 (>= 0.70 pass mark)
    const fixedDate = new Date('2026-09-23T12:00:00Z');
    const firstRun = evaluateAssessmentSubmission({
      assessment,
      submission,
      evaluatedAt: fixedDate,
    });

    assert.equal(firstRun.score, 0.75);
    assert.equal(firstRun.passed, true);
    assert.equal(firstRun.outcome, CHECK_OUTCOMES.PASS);
    assert.equal(firstRun.earnedPoints, 3);
    assert.equal(firstRun.maxPoints, 4);

    for (let i = 0; i < 100; i++) {
      const run = evaluateAssessmentSubmission({
        assessment,
        submission,
        evaluatedAt: fixedDate,
      });
      assert.deepEqual(run, firstRun);
    }
  });

  it('marks assessment failed and timed out when time limit is exceeded', () => {
    const startedAt = new Date('2026-09-23T10:00:00Z');
    // timeLimitMinutes is 10, grace is 60s -> 11 minutes allowed.
    // We submit 15 minutes later.
    const submittedAt = new Date('2026-09-23T10:15:00Z');

    const submission = {
      assessmentId: 'asm_eval_demo',
      studentId: 'student_123',
      startedAt,
      answers: {
        q1: 'opt_a',
        q2: '42',
        q3: 'false',
      },
    };

    const result = evaluateAssessmentSubmission({
      assessment,
      submission,
      evaluatedAt: submittedAt,
    });

    assert.equal(result.status, ATTEMPT_STATUS.TIMED_OUT);
    assert.equal(result.passed, false);
    assert.equal(result.outcome, CHECK_OUTCOMES.FAIL);
    assert.equal(result.score, 0);
  });
});

describe('Assessment Domain Contract: Evidence Semantics & CareerTwin Integration', () => {
  const assessment = {
    id: 'asm_docker_mastery',
    skillKey: 'Docker',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    title: 'Docker Mastery',
    description: 'Container proficiency',
    passMark: 0.7,
    questions: [
      {
        id: 'q1',
        type: QUESTION_TYPES.BOOLEAN,
        prompt: 'Q1',
        weight: 10,
        expectedAnswer: { expectedValue: true },
      },
    ],
  };

  it('emits verified evidence when score meets exact passMark (0.70)', () => {
    // Assessment with 10 questions to test boundary
    const multiQAssessment = {
      id: 'asm_boundary_test',
      skillKey: 'Docker',
      difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
      title: 'Boundary Test',
      description: 'Testing exact 0.70 boundary',
      passMark: 0.7,
      questions: Array.from({ length: 10 }, (_, i) => ({
        id: `q_${i}`,
        type: QUESTION_TYPES.BOOLEAN,
        prompt: `Question ${i}`,
        weight: 1,
        expectedAnswer: { expectedValue: true },
      })),
    };

    // Exactly 7 of 10 correct = 0.7000
    const passAnswers = {};
    for (let i = 0; i < 7; i++) passAnswers[`q_${i}`] = true;
    for (let i = 7; i < 10; i++) passAnswers[`q_${i}`] = false;

    const passResult = evaluateAssessmentSubmission({
      assessment: multiQAssessment,
      submission: { studentId: 'student_boundary', answers: passAnswers },
    });

    assert.equal(passResult.score, 0.7);
    assert.equal(passResult.passed, true);
    assert.equal(passResult.outcome, 'pass');
    assert.equal(passResult.evidenceResult.eligibleForVerified, true);
    assert.equal(passResult.evidenceResult.evidence.strength, 'verified');
    assert.equal(passResult.evidenceResult.evidence.source, 'assessment');
    assert.equal(passResult.evidenceResult.evidence.reference, 'asm_boundary_test');

    // Exactly 6 of 10 correct = 0.6000 (< 0.70)
    const failAnswers = {};
    for (let i = 0; i < 6; i++) failAnswers[`q_${i}`] = true;
    for (let i = 6; i < 10; i++) failAnswers[`q_${i}`] = false;

    const failResult = evaluateAssessmentSubmission({
      assessment: multiQAssessment,
      submission: { studentId: 'student_boundary', answers: failAnswers },
    });

    assert.equal(failResult.score, 0.6);
    assert.equal(failResult.passed, false);
    assert.equal(failResult.outcome, 'fail');
    assert.equal(failResult.evidenceResult.eligibleForVerified, false);
    assert.equal(failResult.evidenceResult.evidence, null);
  });

  it('integrates seamlessly with CareerTwin verified evidence ingestion', () => {
    const submissionResult = evaluateAssessmentSubmission({
      assessment,
      submission: {
        studentId: 'student_twin_test',
        answers: { q1: true },
      },
    });

    assert.equal(submissionResult.passed, true);

    // CareerTwin expects verifiedEvidence items shaped like:
    // { skill: string, evidence: { source, strength, detail, reference } }
    const verifiedItem = {
      skill: submissionResult.evidenceResult.skillName,
      evidence: submissionResult.evidenceResult.evidence,
    };

    const twin = buildCareerTwin({
      profile: {
        skills: [{ name: 'Docker', level: 'beginner' }],
      },
      verifiedEvidence: [verifiedItem],
    });

    const dockerSkill = twin.skills.find((s) => s.key === 'docker');
    assert.ok(dockerSkill, 'Docker skill should be present in CareerTwin');
    assert.equal(dockerSkill.name, 'Docker');

    // Verified evidence from assessment must be attached and have strength 'verified'
    const assessmentEvidence = dockerSkill.evidence.find((e) => e.source === 'assessment');
    assert.ok(assessmentEvidence, 'Assessment evidence should be present on CareerTwin skill');
    assert.equal(assessmentEvidence.strength, 'verified');
    assert.equal(assessmentEvidence.reference, 'asm_docker_mastery');
  });
});

describe('Assessment Domain Contract: Attempts Management', () => {
  it('creates an attempt with correct initial state', () => {
    const started = new Date('2026-09-23T10:00:00Z');
    const attempt = createAssessmentAttempt({
      assessmentId: 'asm_test',
      studentId: 'stud_1',
      attemptNumber: 2,
      startedAt: started,
    });

    assert.match(attempt.attemptId, /^att_asm_test_/);
    assert.equal(attempt.assessmentId, 'asm_test');
    assert.equal(attempt.studentId, 'stud_1');
    assert.equal(attempt.attemptNumber, 2);
    assert.equal(attempt.status, ATTEMPT_STATUS.IN_PROGRESS);
    assert.equal(attempt.startedAt.toISOString(), started.toISOString());
    assert.equal(attempt.submittedAt, null);
  });

  it('validates attempt parameters', () => {
    assert.throws(
      () => createAssessmentAttempt({ assessmentId: '', studentId: 's1' }),
      /assessmentId is required/,
    );
    assert.throws(
      () => createAssessmentAttempt({ assessmentId: 'a1', studentId: '' }),
      /studentId is required/,
    );
    assert.throws(
      () => createAssessmentAttempt({ assessmentId: 'a1', studentId: 's1', attemptNumber: 0 }),
      /attemptNumber must be an integer >= 1/,
    );
  });
});

describe('Assessment Catalog: Canonical Nexora Assessments', () => {
  it('validates that every canonical assessment in catalog is compliant', () => {
    const catalog = getAssessmentCatalog();
    assert.ok(catalog.length >= 4, 'Catalog should have at least 4 core skill assessments');

    for (const asm of catalog) {
      assert.doesNotThrow(() => validateAssessmentDefinition(asm));
      assert.ok(asm.questions.length >= 2, `${asm.id} must have at least 2 questions`);
      assert.ok(asm.skillKey, `${asm.id} must have a valid canonical skill key`);
    }
  });

  it('retrieves assessments by ID and skill', () => {
    const jsAsm = getAssessmentById('asm_javascript_intermediate');
    assert.ok(jsAsm);
    assert.equal(jsAsm.skillKey, 'javascript');

    // Find by skill name and alias
    const nodeAsms = getAssessmentsForSkill('Node.js');
    assert.ok(nodeAsms.length > 0);
    assert.equal(nodeAsms[0].id, 'asm_nodejs_intermediate');

    const nodeAliasAsms = getAssessmentsForSkill('nodejs');
    assert.deepEqual(nodeAliasAsms, nodeAsms);

    const nonExistent = getAssessmentById('does_not_exist');
    assert.equal(nonExistent, null);
  });
});
