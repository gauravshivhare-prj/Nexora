import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_VALUES,
  INTERVIEW_QUESTION_TYPES,
  INTERVIEW_QUESTION_TYPE_VALUES,
  INTERVIEW_LIMITS,
  RUBRIC_DIMENSIONS,
  RUBRIC_DIMENSION_KEYS,
  RUBRIC_DIMENSION_WEIGHTS,
  SESSION_STATUS,
  SESSION_STATUS_VALUES,
  EVALUATOR_TYPES,
  EVALUATOR_TYPE_VALUES,
  INTERVIEW_PASS_MARK,
  canTransitionSession,
  validateSessionInit,
  validateInterviewQuestion,
  validateStudentAnswer,
  validateAiQuestionEvaluation,
  calculateCompositeQuestionScore,
  validateProviderMetadata,
  evaluateInterviewSession,
} from '../src/domain/interview/interviewContract.js';
import { CHECK_OUTCOMES } from '../src/domain/evidence/skillEvidenceCheck.js';
import { EVIDENCE_STRENGTH } from '../src/domain/evidence/evidence.js';

describe('R2 — AI Interview Domain Contract Suite', () => {
  describe('1. Constants, Enums & Policies', () => {
    it('declares frozen contract version and standard boundaries', () => {
      assert.equal(INTERVIEW_CONTRACT_VERSION, 1);
      assert.equal(INTERVIEW_PASS_MARK, 0.75);

      assert.equal(INTERVIEW_LIMITS.minQuestions, 1);
      assert.equal(INTERVIEW_LIMITS.maxQuestions, 10);
      assert.equal(INTERVIEW_LIMITS.maxTargetSkills, 5);
      assert.equal(INTERVIEW_LIMITS.studentAnswer.min, 10);
      assert.equal(INTERVIEW_LIMITS.studentAnswer.max, 5000);
    });

    it('declares all expected lifecycle session statuses', () => {
      assert.deepEqual(SESSION_STATUS_VALUES, [
        'initialized',
        'in_progress',
        'completed',
        'timed_out',
        'abandoned',
        'failed',
      ]);
    });

    it('declares all standard interview question types', () => {
      assert.deepEqual(INTERVIEW_QUESTION_TYPE_VALUES, [
        'conceptual',
        'scenario',
        'behavioral',
        'technical_deep_dive',
      ]);
    });

    it('declares normalized rubric dimensions with weights summing to 1.0', () => {
      assert.deepEqual(RUBRIC_DIMENSION_KEYS, ['accuracy', 'depth', 'clarity', 'relevance']);

      const sumWeights = Object.values(RUBRIC_DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
      assert.equal(Math.round(sumWeights * 1000) / 1000, 1.0);
    });
  });

  describe('2. Lifecycle State Transitions', () => {
    it('allows valid lifecycle transitions', () => {
      assert.equal(canTransitionSession(SESSION_STATUS.INITIALIZED, SESSION_STATUS.IN_PROGRESS), true);
      assert.equal(canTransitionSession(SESSION_STATUS.INITIALIZED, SESSION_STATUS.ABANDONED), true);
      assert.equal(canTransitionSession(SESSION_STATUS.INITIALIZED, SESSION_STATUS.FAILED), true);
      assert.equal(canTransitionSession(SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.COMPLETED), true);
      assert.equal(canTransitionSession(SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.TIMED_OUT), true);
      assert.equal(canTransitionSession(SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.ABANDONED), true);
      assert.equal(canTransitionSession(SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.FAILED), true);
    });

    it('disallows invalid or terminal transitions', () => {
      assert.equal(canTransitionSession(SESSION_STATUS.COMPLETED, SESSION_STATUS.IN_PROGRESS), false);
      assert.equal(canTransitionSession(SESSION_STATUS.COMPLETED, SESSION_STATUS.INITIALIZED), false);
      assert.equal(canTransitionSession(SESSION_STATUS.TIMED_OUT, SESSION_STATUS.COMPLETED), false);
      assert.equal(canTransitionSession(SESSION_STATUS.ABANDONED, SESSION_STATUS.IN_PROGRESS), false);
      assert.equal(canTransitionSession(SESSION_STATUS.INITIALIZED, SESSION_STATUS.COMPLETED), false);
    });
  });

  describe('3. Session Initialization Validation', () => {
    const validInitParams = {
      sessionId: 'sess_1234567890abcdef',
      studentId: '507f1f77bcf86cd799439011',
      roleTitle: 'Backend Developer',
      roleSlug: 'backend-developer',
      targetSkills: ['Node.js', 'PostgreSQL'],
      difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
      questionCount: 3,
      timeLimitMinutes: 30,
    };

    it('validates a complete, canonical session initialization payload', () => {
      const validated = validateSessionInit(validInitParams);

      assert.equal(validated.sessionId, 'sess_1234567890abcdef');
      assert.equal(validated.studentId, '507f1f77bcf86cd799439011');
      assert.equal(validated.roleTitle, 'Backend Developer');
      assert.equal(validated.roleSlug, 'backend-developer');
      assert.equal(validated.difficulty, 'intermediate');
      assert.equal(validated.questionCount, 3);
      assert.equal(validated.timeLimitMinutes, 30);
      assert.equal(validated.status, SESSION_STATUS.INITIALIZED);

      // Target skills are mapped to canonical keys
      assert.equal(validated.targetSkills.length, 2);
      assert.equal(validated.targetSkills[0].key, 'nodejs');
      assert.equal(validated.targetSkills[0].name, 'Node.js');
      assert.equal(validated.targetSkills[1].key, 'postgresql');
      assert.equal(validated.targetSkills[1].name, 'PostgreSQL');
    });

    it('rejects missing or non-string sessionId / studentId', () => {
      assert.throws(
        () => validateSessionInit({ ...validInitParams, sessionId: '' }),
        /sessionId is required/,
      );
      assert.throws(
        () => validateSessionInit({ ...validInitParams, studentId: null }),
        /studentId is required/,
      );
    });

    it('rejects unknown or non-canonical skills', () => {
      assert.throws(
        () => validateSessionInit({ ...validInitParams, targetSkills: ['NonExistentSkillXYZ123'] }),
        /Unknown canonical skill/,
      );
      assert.throws(
        () => validateSessionInit({ ...validInitParams, targetSkills: [] }),
        /At least one target skill is required/,
      );
    });

    it('rejects target skills exceeding max limit (5)', () => {
      const tooManySkills = ['JavaScript', 'Python', 'Node.js', 'PostgreSQL', 'Docker', 'React'];
      assert.throws(
        () => validateSessionInit({ ...validInitParams, targetSkills: tooManySkills }),
        /Target skills cannot exceed 5/,
      );
    });

    it('rejects invalid question counts or difficulty levels', () => {
      assert.throws(
        () => validateSessionInit({ ...validInitParams, questionCount: 0 }),
        /questionCount must be an integer between 1 and 10/,
      );
      assert.throws(
        () => validateSessionInit({ ...validInitParams, questionCount: 15 }),
        /questionCount must be an integer between 1 and 10/,
      );
      assert.throws(
        () => validateSessionInit({ ...validInitParams, difficulty: 'impossible' }),
        /Invalid difficulty/,
      );
    });
  });

  describe('4. Question Definition Validation', () => {
    const validQuestion = {
      id: 'q_int_node_eventloop',
      type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
      targetSkill: 'Node.js',
      prompt: 'Explain how Node.js processes microtasks and macrotasks in the event loop.',
      rubricCriteria: [
        'Explains microtask queue (Promises, process.nextTick)',
        'Explains macrotasks (timers, I/O)',
        'Discusses starvation risks',
      ],
      timeLimitSeconds: 180,
    };

    it('validates a complete, structured interview question', () => {
      const validated = validateInterviewQuestion(validQuestion, 0);

      assert.equal(validated.id, 'q_int_node_eventloop');
      assert.equal(validated.type, 'conceptual');
      assert.equal(validated.targetSkillKey, 'nodejs');
      assert.equal(validated.targetSkillName, 'Node.js');
      assert.equal(validated.prompt, validQuestion.prompt);
      assert.equal(validated.rubricCriteria.length, 3);
      assert.equal(validated.timeLimitSeconds, 180);
    });

    it('rejects invalid question types and empty prompts', () => {
      assert.throws(
        () => validateInterviewQuestion({ ...validQuestion, type: 'unknown_type' }, 0),
        /Invalid question type/,
      );
      assert.throws(
        () => validateInterviewQuestion({ ...validQuestion, prompt: 'short' }, 0),
        /Question prompt must be at least 10 characters/,
      );
    });

    it('accepts questionId polymorphically and populates id, questionId, and canonical targetSkill', () => {
      const qWithQuestionId = {
        questionId: 'iq-node-async-001',
        type: INTERVIEW_QUESTION_TYPES.SCENARIO,
        targetSkill: 'Node.js',
        prompt: 'How would you debug an unhandled promise rejection in production?',
      };

      const validated = validateInterviewQuestion(qWithQuestionId, 0);

      assert.equal(validated.id, 'iq-node-async-001');
      assert.equal(validated.questionId, 'iq-node-async-001');
      assert.equal(validated.targetSkill, 'Node.js');
      assert.equal(validated.targetSkillName, 'Node.js');
      assert.equal(validated.targetSkillKey, 'nodejs');
    });

    it('rejects non-canonical target skill in question', () => {
      assert.throws(
        () => validateInterviewQuestion({ ...validQuestion, targetSkill: 'MadeUpSkill' }, 0),
        /Unknown canonical skill/,
      );
    });
  });

  describe('5. Student Answer Submission Validation', () => {
    const validAnswer = {
      questionId: 'q_int_node_eventloop',
      answerText:
        'Microtasks include Promise reactions and process.nextTick callbacks, which are processed after the current operation and before the event loop advances to the next phase.',
      durationSeconds: 65,
      submittedAt: new Date(),
    };

    it('validates a student answer within length and duration limits', () => {
      const validated = validateStudentAnswer(validAnswer);
      assert.equal(validated.questionId, 'q_int_node_eventloop');
      assert.equal(validated.answerText, validAnswer.answerText);
      assert.equal(validated.durationSeconds, 65);
      assert.ok(validated.submittedAt instanceof Date);
    });

    it('rejects answers that are too short or oversized', () => {
      assert.throws(
        () => validateStudentAnswer({ ...validAnswer, answerText: 'Too short' }),
        /Answer must be at least 10 characters/,
      );

      const massiveText = 'a'.repeat(5001);
      assert.throws(
        () => validateStudentAnswer({ ...validAnswer, answerText: massiveText }),
        /Answer exceeds maximum length of 5000 characters/,
      );
    });

    it('rejects invalid questionId or negative duration', () => {
      assert.throws(
        () => validateStudentAnswer({ ...validAnswer, questionId: '' }),
        /questionId is required/,
      );
      assert.throws(
        () => validateStudentAnswer({ ...validAnswer, durationSeconds: -5 }),
        /durationSeconds must be a non-negative number/,
      );
    });
  });

  describe('6. Untrusted AI Evaluation Validation & Defense', () => {
    const rawAiOutput = {
      score: 0.85,
      dimensions: {
        accuracy: 0.90,
        depth: 0.80,
        clarity: 0.85,
        relevance: 0.90,
      },
      feedback: 'Strong answer demonstrating clear understanding of microtask queues in Node.js.',
      strengths: ['Clear explanation of process.nextTick', 'Accurate event loop sequence'],
      growthAreas: ['Could mention setImmediate vs setTimeout behavior'],
      groundedSkills: ['Node.js', 'JavaScript'],
    };

    it('validates and bounds a well-formed AI question evaluation', () => {
      const validated = validateAiQuestionEvaluation(rawAiOutput);

      assert.equal(validated.score, 0.86); // computed via weighted rubric
      assert.equal(validated.dimensions.accuracy, 0.90);
      assert.equal(validated.dimensions.depth, 0.80);
      assert.equal(validated.dimensions.clarity, 0.85);
      assert.equal(validated.dimensions.relevance, 0.90);
      assert.equal(validated.feedback, rawAiOutput.feedback);
      assert.equal(validated.strengths.length, 2);
      assert.equal(validated.growthAreas.length, 1);

      // Verified against canonical taxonomy
      assert.deepEqual(validated.groundedSkills, ['Node.js', 'JavaScript']);
    });

    it('clamps or normalizes numeric dimension values cleanly to [0, 1]', () => {
      const looseOutput = {
        ...rawAiOutput,
        dimensions: {
          accuracy: '0.95', // string number
          depth: 1.25, // out of bounds > 1
          clarity: -0.2, // out of bounds < 0
          relevance: 0.70,
        },
      };

      const validated = validateAiQuestionEvaluation(looseOutput);
      assert.equal(validated.dimensions.accuracy, 0.95);
      assert.equal(validated.dimensions.depth, 1.0); // clamped to 1
      assert.equal(validated.dimensions.clarity, 0.0); // clamped to 0
      assert.equal(validated.dimensions.relevance, 0.70);
    });

    it('drops non-canonical skills from AI groundedSkills list without failing the evaluation', () => {
      const hallucinatedSkills = {
        ...rawAiOutput,
        groundedSkills: ['Node.js', 'FakeSkillThatDoesNotExist', 'JavaScript'],
      };

      const validated = validateAiQuestionEvaluation(hallucinatedSkills);
      assert.deepEqual(validated.groundedSkills, ['Node.js', 'JavaScript']);
    });

    it('rejects structurally invalid AI outputs (missing dimensions or empty feedback)', () => {
      assert.throws(
        () => validateAiQuestionEvaluation({ ...rawAiOutput, dimensions: { accuracy: 0.8 } }),
        /Missing required rubric dimension/,
      );
      assert.throws(
        () => validateAiQuestionEvaluation({ ...rawAiOutput, feedback: '' }),
        /Feedback summary is required/,
      );
      assert.throws(
        () => validateAiQuestionEvaluation(null),
        /AI evaluation output must be an object/,
      );
    });

    it('calculates deterministic composite score using weighted dimensions', () => {
      const dimensions = {
        accuracy: 1.0,  // weight 0.35 -> 0.35
        depth: 0.5,     // weight 0.30 -> 0.15
        clarity: 0.8,   // weight 0.20 -> 0.16
        relevance: 1.0, // weight 0.15 -> 0.15
      }; // total = 0.81

      const composite = calculateCompositeQuestionScore(dimensions);
      assert.equal(composite, 0.81);
    });
  });

  describe('7. Provider Metadata Validation', () => {
    it('validates provider metadata envelope', () => {
      const meta = {
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        durationMs: 850,
      };

      const validated = validateProviderMetadata(meta);
      assert.equal(validated.provider, 'gemini');
      assert.equal(validated.model, 'gemini-2.0-flash');
      assert.equal(validated.schemaVersion, 1);
      assert.equal(validated.durationMs, 850);
    });

    it('rejects empty or missing provider details', () => {
      assert.throws(
        () => validateProviderMetadata({ provider: '' }),
        /provider is required/,
      );
      assert.throws(
        () => validateProviderMetadata({ provider: 'gemini', model: '' }),
        /model is required/,
      );
    });
  });

  describe('8. Session Evaluation & Institutional Evidence Integration', () => {
    const sessionFixture = {
      sessionId: 'sess_complete_1',
      studentId: '507f1f77bcf86cd799439011',
      roleTitle: 'Backend Developer',
      roleSlug: 'backend-developer',
      difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
      targetSkills: [
        { key: 'nodejs', name: 'Node.js' },
        { key: 'postgresql', name: 'PostgreSQL' },
      ],
      questions: [
        {
          id: 'q1',
          targetSkillKey: 'nodejs',
          targetSkillName: 'Node.js',
          weight: 1,
        },
        {
          id: 'q2',
          targetSkillKey: 'postgresql',
          targetSkillName: 'PostgreSQL',
          weight: 1,
        },
      ],
      answers: {
        q1: {
          answerText: 'Sample answer for Node.js event loop.',
          durationSeconds: 120,
        },
        q2: {
          answerText: 'Sample answer for PostgreSQL indexing.',
          durationSeconds: 150,
        },
      },
      evaluations: {
        q1: {
          score: 0.80,
          dimensions: { accuracy: 0.80, depth: 0.80, clarity: 0.80, relevance: 0.80 },
          feedback: 'Solid answer on event loop.',
          strengths: ['Accurate'],
          growthAreas: ['Depth'],
          groundedSkills: ['Node.js'],
        },
        q2: {
          score: 0.90,
          dimensions: { accuracy: 0.90, depth: 0.90, clarity: 0.90, relevance: 0.90 },
          feedback: 'Excellent explanation of B-tree indexes.',
          strengths: ['Comprehensive'],
          growthAreas: ['None'],
          groundedSkills: ['PostgreSQL'],
        },
      },
    };

    it('evaluates session with AI evaluator and marks evidence as advisory / supported (not verified)', () => {
      const result = evaluateInterviewSession(sessionFixture, {
        evaluatedBy: EVALUATOR_TYPES.AI,
      });

      assert.equal(result.overallScore, 0.85); // average of 0.80 and 0.90
      assert.equal(result.evaluatedBy, 'ai');

      // AI evaluations are advisory and CANNOT award verified status
      assert.equal(result.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(result.eligibleForVerified, false);
      assert.equal(result.evidenceStrength, EVIDENCE_STRENGTH.SUPPORTED);

      // Verify skill evidence check payload
      assert.ok(result.skillEvidenceResults.length === 2);
      for (const ev of result.skillEvidenceResults) {
        assert.equal(ev.outcome, CHECK_OUTCOMES.UNCERTAIN);
        assert.equal(ev.eligibleForVerified, false);
        assert.equal(ev.evidence, null); // no verified evidence created
      }
    });

    it('evaluates session with human evaluator and creates verified evidence on pass (score >= 0.75)', () => {
      const result = evaluateInterviewSession(sessionFixture, {
        evaluatedBy: EVALUATOR_TYPES.HUMAN,
      });

      assert.equal(result.overallScore, 0.85);
      assert.equal(result.evaluatedBy, 'human');
      assert.equal(result.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(result.eligibleForVerified, true);
      assert.equal(result.evidenceStrength, EVIDENCE_STRENGTH.VERIFIED);

      // Verify human-evaluated passes generate verified evidence checks
      assert.equal(result.skillEvidenceResults.length, 2);
      for (const ev of result.skillEvidenceResults) {
        assert.equal(ev.outcome, CHECK_OUTCOMES.PASS);
        assert.equal(ev.eligibleForVerified, true);
        assert.ok(ev.evidence);
        assert.equal(ev.evidence.strength, EVIDENCE_STRENGTH.VERIFIED);
        assert.equal(ev.evidence.source, 'interview');
      }
    });

    it('marks human-evaluated session as fail when score is below 0.75', () => {
      const failingSession = {
        ...sessionFixture,
        evaluations: {
          q1: { score: 0.60, dimensions: { accuracy: 0.6, depth: 0.6, clarity: 0.6, relevance: 0.6 }, feedback: 'Poor', strengths: ['None'], growthAreas: ['All'], groundedSkills: ['Node.js'] },
          q2: { score: 0.50, dimensions: { accuracy: 0.5, depth: 0.5, clarity: 0.5, relevance: 0.5 }, feedback: 'Weak', strengths: ['None'], growthAreas: ['All'], groundedSkills: ['PostgreSQL'] },
        },
      };

      const result = evaluateInterviewSession(failingSession, {
        evaluatedBy: EVALUATOR_TYPES.HUMAN,
      });

      assert.equal(result.overallScore, 0.55);
      assert.equal(result.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(result.eligibleForVerified, false);
    });

    it('evaluates Mongoose-shaped session with questionId, q.evaluation, and string targetSkills', () => {
      const mongooseSession = {
        _id: '6ab6ba1aa278c6e17a603503',
        user: '6ab6ba1aa278c6e17a603500',
        targetRole: 'backend-developer',
        roleTitle: 'Backend Developer',
        roleSlug: 'backend-developer',
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        targetSkills: ['Node.js', 'PostgreSQL'],
        questions: [
          {
            questionId: 'iq-node-001',
            order: 1,
            targetSkill: 'Node.js',
            weight: 1,
            evaluation: {
              compositeScore: 0.85,
              dimensions: { accuracy: 0.85, depth: 0.85, clarity: 0.85, relevance: 0.85 },
            },
          },
          {
            questionId: 'iq-pg-002',
            order: 2,
            targetSkill: 'PostgreSQL',
            weight: 1,
            evaluation: {
              compositeScore: 0.75,
              dimensions: { accuracy: 0.75, depth: 0.75, clarity: 0.75, relevance: 0.75 },
            },
          },
        ],
      };

      const result = evaluateInterviewSession(mongooseSession, {
        evaluatedBy: EVALUATOR_TYPES.AI,
      });

      assert.equal(result.sessionId, '6ab6ba1aa278c6e17a603503');
      assert.equal(result.studentId, '6ab6ba1aa278c6e17a603500');
      assert.equal(result.overallScore, 0.8);
      assert.equal(result.questionResults.length, 2);
      assert.equal(result.questionResults[0].questionId, 'iq-node-001');
      assert.equal(result.questionResults[0].targetSkillName, 'Node.js');
      assert.equal(result.questionResults[0].targetSkillKey, 'nodejs');
      assert.equal(result.skillEvidenceResults.length, 2);
      assert.equal(result.skillEvidenceResults[0].skill, 'Node.js');
      assert.equal(result.skillEvidenceResults[0].score, 0.8);
    });
  });
});
