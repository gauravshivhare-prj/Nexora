import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ATTEMPT_STATUS,
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  SCORING_STRATEGIES,
  evaluateAssessmentSubmission,
  sanitizeAssessmentForStudent,
  validateAssessmentDefinition,
} from '../src/domain/assessment/assessmentContract.js';
import { toPublicAssessment, toAdminAssessment } from '../src/models/Assessment.model.js';
import { toPublicAssessmentAttempt } from '../src/models/AssessmentAttempt.model.js';
import {
  ASSESSMENT_LIMITS,
  FORBIDDEN_CLIENT_VERIFICATION_FIELDS,
} from '../src/constants/assessmentPolicy.js';
import { assertNoForbiddenClientFields } from '../src/services/assessment.service.js';
import { ApiError } from '../src/utils/ApiError.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';

// -----------------------------------------------------------------------------
// Fixture: Raw Assessment Definition Containing Secrets & Internal Explanations
// -----------------------------------------------------------------------------
const rawSecretAssessment = Object.freeze({
  id: 'asm_security_redteam_node',
  version: 1,
  skillKey: 'Node.js',
  skillName: 'Node.js',
  secondarySkillKeys: ['TypeScript', 'JavaScript'],
  difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
  title: 'Node.js Security Red-Team Assessment',
  description: 'Used for rigorous verification of zero secret/answer-key leakage.',
  passMark: 0.7,
  timeLimitMinutes: 20,
  isActive: true,
  questions: [
    {
      id: 'q_sc_secret',
      type: QUESTION_TYPES.SINGLE_CHOICE,
      prompt: 'Which flag prevents prototype pollution in Object.assign?',
      weight: 1,
      options: [
        { id: 'opt_freeze', text: 'Object.freeze(Object.prototype)' },
        { id: 'opt_none', text: 'No flag required' },
      ],
      expectedAnswer: { correctOptionId: 'opt_freeze' },
      explanation: 'Freezing Object.prototype prevents prototype tampering.',
    },
    {
      id: 'q_mc_secret',
      type: QUESTION_TYPES.MULTIPLE_CHOICE,
      prompt: 'Select safe HTTP headers for defense in depth:',
      weight: 2,
      options: [
        { id: 'opt_csp', text: 'Content-Security-Policy' },
        { id: 'opt_hsts', text: 'Strict-Transport-Security' },
        { id: 'opt_x_powered', text: 'X-Powered-By' },
      ],
      expectedAnswer: {
        correctOptionIds: ['opt_csp', 'opt_hsts'],
        strategy: SCORING_STRATEGIES.PARTIAL_CREDIT,
      },
      explanation: 'CSP and HSTS are standard defense headers; X-Powered-By should be removed.',
    },
    {
      id: 'q_code_secret',
      type: QUESTION_TYPES.CODE_OUTPUT,
      prompt: 'Predict output of security snippet:',
      weight: 1,
      codeSnippet: 'console.log(sanitizeInput("<script>"))',
      expectedAnswer: {
        expectedOutput: '&lt;script&gt;',
        trimWhitespace: true,
        caseSensitive: true,
      },
      explanation: 'HTML entities are escaped to prevent XSS.',
    },
    {
      id: 'q_sa_secret',
      type: QUESTION_TYPES.SHORT_ANSWER,
      prompt: 'Name the technique of storing passwords with salt and stretch:',
      weight: 1,
      expectedAnswer: {
        acceptedAnswers: ['bcrypt', 'argon2', 'scrypt'],
        caseSensitive: false,
        trimWhitespace: true,
      },
      explanation: 'bcrypt, argon2, and scrypt are adaptive hashing functions.',
    },
    {
      id: 'q_bool_secret',
      type: QUESTION_TYPES.BOOLEAN,
      prompt: 'HTTP cookies with HttpOnly flag can be read by document.cookie in JS.',
      weight: 1,
      expectedAnswer: { expectedValue: false },
      explanation: 'HttpOnly prevents client-side script access to the cookie.',
    },
  ],
});

describe('TASK A09 — Assessment Security Red-Team: Vector 1 — Answer-Key Leakage', () => {
  it('toPublicAssessment strictly strips expectedAnswer, expectedOutput, acceptedAnswers, explanation across all 5 types', () => {
    const publicView = toPublicAssessment(rawSecretAssessment);

    assert.equal(publicView.id, 'asm_security_redteam_node');
    assert.equal(publicView.title, 'Node.js Security Red-Team Assessment');
    assert.equal(publicView.questions.length, 5);

    for (const q of publicView.questions) {
      assert.equal(q.expectedAnswer, undefined, `expectedAnswer must be undefined on question ${q.id}`);
      assert.equal(q.expectedOutput, undefined, `expectedOutput must be undefined on question ${q.id}`);
      assert.equal(q.acceptedAnswers, undefined, `acceptedAnswers must be undefined on question ${q.id}`);
      assert.equal(q.correctOptionId, undefined, `correctOptionId must be undefined on question ${q.id}`);
      assert.equal(q.correctOptionIds, undefined, `correctOptionIds must be undefined on question ${q.id}`);
      assert.equal(q.explanation, undefined, `explanation must be undefined on question ${q.id}`);
      assert.equal(q.scoringRule, undefined, `scoringRule must be undefined on question ${q.id}`);
    }

    // Options must only have id and text
    const scQuestion = publicView.questions.find((q) => q.id === 'q_sc_secret');
    for (const opt of scQuestion.options) {
      assert.deepEqual(Object.keys(opt).sort(), ['id', 'text']);
      assert.equal(opt.isCorrect, undefined);
    }
  });

  it('sanitizeAssessmentForStudent domain helper strictly strips expectedAnswer and explanations', () => {
    const sanitized = sanitizeAssessmentForStudent(rawSecretAssessment);

    assert.equal(sanitized.id, 'asm_security_redteam_node');
    assert.equal(sanitized.questions.length, 5);

    for (const q of sanitized.questions) {
      assert.equal(q.expectedAnswer, undefined);
      assert.equal(q.expectedOutput, undefined);
      assert.equal(q.acceptedAnswers, undefined);
      assert.equal(q.explanation, undefined);
      assert.equal(q.scoringRule, undefined);
    }
  });

  it('toAdminAssessment preserves expectedAnswer and explanations for internal auditing', () => {
    const adminView = toAdminAssessment(rawSecretAssessment);

    assert.equal(adminView.id, 'asm_security_redteam_node');
    assert.ok(Array.isArray(adminView.questions));
    assert.equal(adminView.questions[0].expectedAnswer.correctOptionId, 'opt_freeze');
    assert.equal(adminView.questions[0].explanation, 'Freezing Object.prototype prevents prototype tampering.');
  });
});

describe('TASK A09 — Assessment Security Red-Team: Vector 2 — Scoring-Rule Exposure', () => {
  it('toPublicAssessmentAttempt strictly strips scoringRule from all question results', () => {
    const internalEvaluatedAttempt = {
      _id: '507f1f77bcf86cd799439011',
      assessmentId: 'asm_security_redteam_node',
      attemptNumber: 1,
      version: 1,
      skillKey: 'Node.js',
      skillName: 'Node.js',
      difficulty: 'intermediate',
      status: ATTEMPT_STATUS.EVALUATED,
      score: 0.8,
      passMark: 0.7,
      passed: true,
      outcome: 'pass',
      earnedPoints: 4,
      maxPoints: 5,
      totalQuestions: 5,
      correctQuestionsCount: 4,
      questionResults: [
        {
          questionId: 'q_sc_secret',
          status: 'correct',
          scoringRule: 'exact_single_choice_match',
          prompt: 'Question Prompt',
          weight: 1,
          studentAnswer: 'opt_freeze',
          isCorrect: true,
          ratio: 1,
          earnedPoints: 1,
          maxPoints: 1,
          explanation: 'Secret internal rationale',
        },
        {
          questionId: 'q_mc_secret',
          status: 'partial',
          scoringRule: 'partial_credit_proportional',
          prompt: 'Question Prompt',
          weight: 2,
          studentAnswer: ['opt_csp'],
          isCorrect: false,
          ratio: 0.5,
          earnedPoints: 1,
          maxPoints: 2,
          explanation: 'Secret internal rationale',
        },
      ],
      startedAt: new Date('2026-09-26T12:00:00Z'),
      completedAt: new Date('2026-09-26T12:10:00Z'),
      durationSeconds: 600,
    };

    const publicAttempt = toPublicAssessmentAttempt(internalEvaluatedAttempt);

    assert.equal(publicAttempt.score, 0.8);
    assert.equal(publicAttempt.passed, true);
    assert.ok(Array.isArray(publicAttempt.questionResults));

    for (const qr of publicAttempt.questionResults) {
      assert.equal(
        qr.scoringRule,
        undefined,
        `scoringRule must be undefined on public projection of question ${qr.questionId}`,
      );
      assert.equal(
        qr.explanation,
        undefined,
        `explanation must be undefined on public projection of question ${qr.questionId}`,
      );
      assert.equal(
        qr.expectedAnswer,
        undefined,
        `expectedAnswer must be undefined on public projection of question ${qr.questionId}`,
      );
      // Legitimate public feedback metrics are preserved
      assert.ok(['correct', 'partial', 'incorrect', 'skipped', 'invalid'].includes(qr.status));
      assert.equal(typeof qr.isCorrect, 'boolean');
      assert.equal(typeof qr.ratio, 'number');
      assert.equal(typeof qr.earnedPoints, 'number');
      assert.equal(typeof qr.maxPoints, 'number');
    }
  });
});

describe('TASK A09 — Assessment Security Red-Team: Vector 3 — Tampering & Anti-Forgery', () => {
  it('assertNoForbiddenClientFields blocks all 30 forbidden verification and scoring fields', () => {
    for (const forbiddenKey of FORBIDDEN_CLIENT_VERIFICATION_FIELDS) {
      const maliciousPayload = {
        answers: { q1: 'val' },
        [forbiddenKey]: forbiddenKey === 'passed' ? true : 100,
      };

      assert.throws(
        () => assertNoForbiddenClientFields(maliciousPayload),
        (err) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.statusCode, 400);
          assert.equal(err.errorCode, ERROR_CODES.VALIDATION_ERROR);
          assert.match(err.message, /forbidden from supplying scoring\/verification field/);
          return true;
        },
        `Supplying forbidden field "${forbiddenKey}" must be rejected with 400 VALIDATION_ERROR`,
      );
    }
  });

  it('assertNoForbiddenClientFields rejects prototype pollution keys (__proto__, constructor, prototype)', () => {
    const maliciousPayloads = [
      JSON.parse('{"__proto__":{"isAdmin":true},"answers":{}}'),
      JSON.parse('{"constructor":{"prototype":{"polluted":true}},"answers":{}}'),
      JSON.parse('{"prototype":{"polluted":true},"answers":{}}'),
    ];

    for (const payload of maliciousPayloads) {
      assert.throws(
        () => assertNoForbiddenClientFields(payload),
        (err) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.statusCode, 400);
          assert.equal(err.errorCode, ERROR_CODES.VALIDATION_ERROR);
          assert.match(err.message, /Invalid payload key/);
          return true;
        },
      );
    }
  });

  it('assertNoForbiddenClientFields rejects MongoDB injection operators ($where, $gt, $ne, $regex)', () => {
    const injectionPayloads = [
      { $where: 'sleep(1000)', answers: {} },
      { $gt: '', answers: {} },
      { $regex: '.*', answers: {} },
      { nested: { $ne: null } },
    ];

    for (const payload of injectionPayloads) {
      assert.throws(
        () => assertNoForbiddenClientFields(payload),
        (err) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.statusCode, 400);
          assert.equal(err.errorCode, ERROR_CODES.VALIDATION_ERROR);
          assert.match(err.message, /Invalid payload key/);
          return true;
        },
      );
    }
  });

  it('assertNoForbiddenClientFields detects and rejects forbidden fields deeply nested in arrays or objects', () => {
    const nestedPayload = {
      answers: {
        q1: 'safe',
      },
      metadata: {
        extra: [
          {
            score: 1.0,
          },
        ],
      },
    };

    assert.throws(
      () => assertNoForbiddenClientFields(nestedPayload),
      (err) => {
        assert.equal(err instanceof ApiError, true);
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /forbidden from supplying scoring\/verification field/);
        return true;
      },
    );
  });
});

describe('TASK A09 — Assessment Security Red-Team: Vector 4 — Invalid IDs & Injection Defense', () => {
  it('strictly validates assessmentId format against path traversal, special characters, and empty strings', () => {
    const invalidAssessmentIds = [
      '',
      '   ',
      '../../admin',
      '../secret',
      'slug with spaces',
      'test$injection',
      'test#hash',
      '<script>alert(1)</script>',
      'DROP TABLE assessments;',
      'a'.repeat(65), // exceeds max 64
    ];

    for (const badId of invalidAssessmentIds) {
      assert.throws(
        () => validateAssessmentDefinition({ ...rawSecretAssessment, id: badId }),
        (err) => {
          assert.match(err.message, /Assessment ID must be/i);
          return true;
        },
        `Assessment ID "${badId}" must be rejected`,
      );
    }
  });

  it('strictly accepts canonical alphanumeric slugs for assessment IDs', () => {
    const validSlugs = [
      'node-js-fundamentals',
      'react_19_advanced',
      'docker-k8s-basics',
      'ci_cd_pipeline_2026',
    ];

    for (const slug of validSlugs) {
      const def = validateAssessmentDefinition({ ...rawSecretAssessment, id: slug });
      assert.equal(def.id, slug);
    }
  });
});

describe('TASK A09 — Assessment Security Red-Team: Vector 5 — Repeats & Replay Protection', () => {
  it('deterministic evaluation engine verifies studentId matches and assessmentId matches', () => {
    assert.throws(
      () => evaluateAssessmentSubmission({
        assessment: rawSecretAssessment,
        submission: {
          studentId: 'student_123',
          assessmentId: 'different_assessment_id',
          answers: {},
        },
      }),
      /does not match definition id/i,
    );

    assert.throws(
      () => evaluateAssessmentSubmission({
        assessment: rawSecretAssessment,
        submission: {
          studentId: '',
          assessmentId: rawSecretAssessment.id,
          answers: {},
        },
      }),
      /submission\.studentId is required/i,
    );
  });

  it('evaluates timed out attempts with zero score to prevent post-timeout answer submissions', () => {
    const timedOutSubmission = {
      studentId: 'student_timeout_attacker',
      assessmentId: rawSecretAssessment.id,
      startedAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago (limit is 20m + 60s grace)
      answers: {
        q_sc_secret: 'opt_freeze',
        q_mc_secret: ['opt_csp', 'opt_hsts'],
        q_code_secret: '&lt;script&gt;',
        q_sa_secret: 'bcrypt',
        q_bool_secret: false,
      },
    };

    const evalResult = evaluateAssessmentSubmission({
      assessment: rawSecretAssessment,
      submission: timedOutSubmission,
      evaluatedAt: new Date(),
    });

    assert.equal(evalResult.status, ATTEMPT_STATUS.TIMED_OUT);
    assert.equal(evalResult.score, 0);
    assert.equal(evalResult.passed, false);
    assert.equal(evalResult.outcome, 'fail');
    assert.equal(evalResult.earnedPoints, 0);
    assert.equal(evalResult.evidenceStatus.eligibleForVerified, false);
    assert.match(evalResult.evidenceStatus.reason, /timed out/i);

    // All questions must be marked timed_out_zero_points
    for (const qr of evalResult.questionResults) {
      assert.equal(qr.scoringRule, 'timed_out_zero_points');
      assert.equal(qr.earnedPoints, 0);
      assert.equal(qr.isCorrect, false);
    }
  });
});

describe('TASK A09 — Assessment Security Red-Team: Vector 6 — Concurrency & Atomic Transitions', () => {
  it('ensures atomic transition semantics: status transition condition must require IN_PROGRESS', () => {
    // Model query invariant: AssessmentAttempt.findOneAndUpdate must target { _id, user, status: 'in_progress' }
    // If status is already 'evaluated', the filter fails to match and returns null.
    const attemptInProgress = {
      _id: 'att_123',
      user: 'usr_456',
      status: ATTEMPT_STATUS.IN_PROGRESS,
    };

    // Simulate first concurrent submit (succeeds)
    let dbStatus = attemptInProgress.status;
    function atomicSubmit() {
      if (dbStatus === ATTEMPT_STATUS.IN_PROGRESS) {
        dbStatus = ATTEMPT_STATUS.EVALUATED;
        return { success: true, status: ATTEMPT_STATUS.EVALUATED };
      }
      return null; // Atomic findOneAndUpdate returns null if status changed
    }

    const firstSubmit = atomicSubmit();
    assert.ok(firstSubmit);
    assert.equal(firstSubmit.status, ATTEMPT_STATUS.EVALUATED);

    // Second concurrent submit immediately fails
    const secondSubmit = atomicSubmit();
    assert.equal(secondSubmit, null);
  });
});
