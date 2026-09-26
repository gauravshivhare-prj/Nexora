import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_PASS_MARK,
  RUBRIC_DIMENSIONS,
  RUBRIC_DIMENSION_KEYS,
  RUBRIC_DIMENSION_WEIGHTS,
  FORBIDDEN_SECURITY_FIELDS,
  isForbiddenOrPrototypeKey,
  calculateCompositeQuestionScore,
  validateAiQuestionEvaluation,
  validateProviderMetadata,
  evaluateInterviewSession,
  validateSessionInit,
  validateInterviewQuestion,
  validateStudentAnswer,
} from '../src/domain/interview/interviewContract.js';
import {
  ALLOWED_EVALUATION_FIELDS,
  validateAiEvaluationJson,
  parseAndValidateAiEvaluation,
} from '../src/domain/interview/interviewEvaluationSchema.js';
import { groundAnswerEvaluation } from '../src/domain/interview/interviewAnswerGrounding.js';
import { evaluateSessionResults } from '../src/services/interviewEvaluation.service.js';
import { toPublicInterviewSession } from '../src/models/InterviewSession.model.js';

describe('A11 — Interview Evaluator Contract & Provider-Output Validation Suite', () => {
  const baseValidPayload = {
    questionId: 'iq-node-001',
    dimensions: {
      accuracy: 0.9,
      depth: 0.8,
      clarity: 0.85,
      relevance: 0.95,
    },
    feedback: 'Solid conceptual answer with accurate explanations of the event loop.',
    strengths: ['Identified microtask queue priority', 'Clear differentiation of timers and poll phases'],
    growthAreas: ['Could elaborate further on libuv worker thread interaction'],
    groundedSkills: ['Node.js', 'JavaScript'],
  };

  // Expected score: 0.9*0.35 + 0.8*0.30 + 0.85*0.20 + 0.95*0.15 = 0.315 + 0.24 + 0.17 + 0.1425 = 0.8675
  const expectedCompositeScore = 0.8675;

  describe('1. Schema & Rubric Dimension Specification', () => {
    it('verifies rubric dimensions and exact weighting sum to 1.0', () => {
      assert.deepEqual([...RUBRIC_DIMENSION_KEYS].sort(), ['accuracy', 'clarity', 'depth', 'relevance']);
      assert.equal(RUBRIC_DIMENSIONS.TECHNICAL_ACCURACY, 'accuracy');
      assert.equal(RUBRIC_DIMENSIONS.DEPTH_OF_KNOWLEDGE, 'depth');
      assert.equal(RUBRIC_DIMENSIONS.COMMUNICATION_CLARITY, 'clarity');
      assert.equal(RUBRIC_DIMENSIONS.RELEVANCE_TO_QUESTION, 'relevance');

      const sumWeights = Object.values(RUBRIC_DIMENSION_WEIGHTS).reduce((acc, w) => acc + w, 0);
      assert.equal(Math.round(sumWeights * 10000) / 10000, 1.0);
    });

    it('rejects payload missing any required rubric dimension', () => {
      for (const missingKey of RUBRIC_DIMENSION_KEYS) {
        const incomplete = JSON.parse(JSON.stringify(baseValidPayload));
        delete incomplete.dimensions[missingKey];

        const schemaResult = validateAiEvaluationJson(incomplete);
        assert.equal(schemaResult.isValid, false);
        assert.ok(
          schemaResult.errors.some((err) => err.includes(`Missing required rubric dimension: "${missingKey}"`)),
        );

        assert.throws(
          () => validateAiQuestionEvaluation(incomplete),
          new RegExp(`Missing required rubric dimension: "${missingKey}"`),
        );
      }
    });

    it('rejects unexpected / extra rubric dimension keys', () => {
      const extraDimensions = ['exploitScore', 'hallucinatedMetric', 'biasFactor'];
      for (const extraKey of extraDimensions) {
        const payload = JSON.parse(JSON.stringify(baseValidPayload));
        payload.dimensions[extraKey] = 0.75;

        const schemaResult = validateAiEvaluationJson(payload);
        assert.equal(schemaResult.isValid, false);
        assert.ok(
          schemaResult.errors.some((err) => err.includes(`Unexpected dimension "${extraKey}"`)),
        );

        assert.throws(
          () => validateAiQuestionEvaluation(payload),
          new RegExp(`Unexpected dimension "${extraKey}"`),
        );
      }
    });

    it('rejects non-numeric dimension values (boolean, object, array, empty or blank strings)', () => {
      const badValues = [true, false, {}, [], [0.5], '', '   ', 'one', null, undefined];
      for (const badVal of badValues) {
        const payload = JSON.parse(JSON.stringify(baseValidPayload));
        payload.dimensions.accuracy = badVal;

        const schemaResult = validateAiEvaluationJson(payload);
        assert.equal(schemaResult.isValid, false);

        assert.throws(
          () => validateAiQuestionEvaluation(payload),
          /(must be a numeric value|Missing required rubric dimension)/,
        );
      }
    });

    it('rejects NaN, Infinity and -Infinity in dimensions', () => {
      for (const nonFinite of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        const payload = {
          ...baseValidPayload,
          dimensions: { ...baseValidPayload.dimensions, depth: nonFinite },
        };

        const schemaResult = validateAiEvaluationJson(payload);
        assert.equal(schemaResult.isValid, false);

        assert.throws(
          () => validateAiQuestionEvaluation(payload),
          /must be a numeric value/,
        );
      }
    });

    it('enforces bounds: schema rejects out-of-range dimensions, while contract cleanly clamps', () => {
      const outOfBoundsHigh = {
        ...baseValidPayload,
        dimensions: { ...baseValidPayload.dimensions, clarity: 1.5 },
      };

      const schemaHigh = validateAiEvaluationJson(outOfBoundsHigh);
      assert.equal(schemaHigh.isValid, false);
      assert.ok(schemaHigh.errors.some((e) => e.includes('out of range')));

      const contractHigh = validateAiQuestionEvaluation(outOfBoundsHigh);
      assert.equal(contractHigh.dimensions.clarity, 1.0);

      const outOfBoundsLow = {
        ...baseValidPayload,
        dimensions: { ...baseValidPayload.dimensions, clarity: -0.5 },
      };

      const schemaLow = validateAiEvaluationJson(outOfBoundsLow);
      assert.equal(schemaLow.isValid, false);
      assert.ok(schemaLow.errors.some((e) => e.includes('out of range')));

      const contractLow = validateAiQuestionEvaluation(outOfBoundsLow);
      assert.equal(contractLow.dimensions.clarity, 0.0);
    });
  });

  describe('2. Composite Score Calculation & Edge Cases', () => {
    it('calculates deterministic composite score matching mathematical weighting', () => {
      const dims = { accuracy: 0.9, depth: 0.8, clarity: 0.85, relevance: 0.95 };
      const score = calculateCompositeQuestionScore(dims);
      assert.equal(score, expectedCompositeScore);
    });

    it('handles edge case inputs in calculateCompositeQuestionScore safely', () => {
      assert.equal(calculateCompositeQuestionScore(null), 0);
      assert.equal(calculateCompositeQuestionScore(undefined), 0);
      assert.equal(calculateCompositeQuestionScore('invalid'), 0);
      assert.equal(calculateCompositeQuestionScore({}), 0);
      assert.equal(calculateCompositeQuestionScore({ accuracy: NaN, depth: undefined }), 0);

      // Boundary values
      assert.equal(calculateCompositeQuestionScore({ accuracy: 0, depth: 0, clarity: 0, relevance: 0 }), 0);
      assert.equal(calculateCompositeQuestionScore({ accuracy: 1, depth: 1, clarity: 1, relevance: 1 }), 1);
    });

    it('guarantees dual-score parity across all validation and grounding pathways', () => {
      // 1. validateAiQuestionEvaluation
      const contractOutput = validateAiQuestionEvaluation(baseValidPayload);
      assert.equal(contractOutput.score, expectedCompositeScore);
      assert.equal(contractOutput.compositeScore, expectedCompositeScore);
      assert.equal(contractOutput.score, contractOutput.compositeScore);

      // 2. validateAiEvaluationJson
      const schemaOutput = validateAiEvaluationJson(baseValidPayload);
      assert.equal(schemaOutput.isValid, true);
      assert.equal(schemaOutput.data.score, expectedCompositeScore);
      assert.equal(schemaOutput.data.compositeScore, expectedCompositeScore);
      assert.equal(schemaOutput.data.score, schemaOutput.data.compositeScore);

      // 3. groundAnswerEvaluation
      const question = { targetSkill: 'Node.js' };
      const groundOutput = groundAnswerEvaluation(schemaOutput.data, {
        question,
        candidateAnswer: 'The event loop processes timers, poll, and check phases in Node.js with libuv.',
      });
      assert.equal(groundOutput.evaluation.score, expectedCompositeScore);
      assert.equal(groundOutput.evaluation.compositeScore, expectedCompositeScore);
      assert.equal(groundOutput.evaluation.score, groundOutput.evaluation.compositeScore);
    });

    it('evaluates session correctly whether evaluations provide score, compositeScore, or weighted questions', () => {
      const session = {
        sessionId: 'sess-a11-001',
        studentId: 'stud-a11-001',
        roleTitle: 'Fullstack Engineer',
        roleSlug: 'fullstack-engineer',
        difficulty: 'intermediate',
        targetSkills: [{ key: 'nodejs', name: 'Node.js' }],
        questions: [
          { id: 'q1', targetSkillKey: 'nodejs', targetSkillName: 'Node.js', weight: 2 },
          { id: 'q2', targetSkillKey: 'nodejs', targetSkillName: 'Node.js', weight: 1 },
        ],
        evaluations: {
          q1: { compositeScore: 0.8 }, // Only compositeScore
          q2: { score: 0.5 },          // Only score
        },
      };

      const result = evaluateInterviewSession(session, { evaluatedBy: 'human' });
      // Total weight: 2 + 1 = 3. Total weighted score: (0.8*2) + (0.5*1) = 1.6 + 0.5 = 2.1. Overall: 2.1 / 3 = 0.70
      assert.equal(result.overallScore, 0.70);
      assert.equal(result.passed, false); // pass mark is 0.75

      // Check dual-property output on questionResults
      assert.equal(result.questionResults[0].score, 0.8);
      assert.equal(result.questionResults[0].compositeScore, 0.8);
      assert.equal(result.questionResults[1].score, 0.5);
      assert.equal(result.questionResults[1].compositeScore, 0.5);
    });

    it('evaluateSessionResults in service supports dual-score and weighted questions cleanly', () => {
      const sessionDoc = {
        _id: '507f1f77bcf86cd799439011',
        targetSkills: ['Node.js'],
        questions: [
          {
            targetSkill: 'Node.js',
            weight: 3,
            evaluation: { score: 0.9 }, // score only
          },
          {
            targetSkill: 'Node.js',
            weight: 1,
            evaluation: { compositeScore: 0.5 }, // compositeScore only
          },
        ],
      };

      // Weighted score: (0.9*3 + 0.5*1) / (3 + 1) = (2.7 + 0.5) / 4 = 3.2 / 4 = 0.8
      const res = evaluateSessionResults({ session: sessionDoc, evaluatorType: 'human' });
      assert.equal(res.overallScore, 0.8);
      assert.equal(res.eligibleForVerified, true);
      assert.equal(res.evidenceResults[0].score, 0.8);
      assert.equal(res.evidenceResults[0].outcome, 'pass');
    });
  });

  describe('3. Unsupported Fields & Provider-Output Validation', () => {
    it('rejects unsupported root fields in strict mode', () => {
      const unsupported = {
        ...baseValidPayload,
        unexpectedProviderId: 'openai-gpt-4o',
        costEstimate: 0.002,
      };

      const result = validateAiEvaluationJson(unsupported, { strict: true });
      assert.equal(result.isValid, false);
      assert.ok(result.errors.some((e) => e.includes('Unexpected field "unexpectedProviderId"')));
      assert.ok(result.errors.some((e) => e.includes('Unexpected field "costEstimate"')));
    });

    it('safely drops unsupported fields into warnings in non-strict mode without polluting cleanData', () => {
      const unsupported = {
        ...baseValidPayload,
        candidateMood: 'confident',
        irrelevantNote: 'audio was clear',
      };

      const result = validateAiEvaluationJson(unsupported, { strict: false });
      assert.equal(result.isValid, true);
      assert.ok(result.warnings.some((w) => w.includes('Dropped unrecognized field "candidateMood"')));
      assert.ok(result.warnings.some((w) => w.includes('Dropped unrecognized field "irrelevantNote"')));

      // cleanData must never contain unsupported fields
      assert.equal(result.data.candidateMood, undefined);
      assert.equal(result.data.irrelevantNote, undefined);
      assert.deepEqual(Object.keys(result.data).sort(), [
        'compositeScore',
        'dimensions',
        'feedback',
        'groundedSkills',
        'growthAreas',
        'questionId',
        'score',
        'strengths',
      ]);
    });

    it('validates provider metadata and safely defaults durationMs and contract version', () => {
      const meta = validateProviderMetadata({
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        durationMs: 450.7,
      });

      assert.equal(meta.provider, 'gemini');
      assert.equal(meta.model, 'gemini-2.0-flash');
      assert.equal(meta.durationMs, 451);
      assert.equal(meta.schemaVersion, INTERVIEW_CONTRACT_VERSION);
      assert.ok(meta.timestamp);

      // Rejects missing provider or model
      assert.throws(() => validateProviderMetadata({ model: 'gpt-4' }), /provider is required/);
      assert.throws(() => validateProviderMetadata({ provider: 'anthropic' }), /model is required/);
      assert.throws(() => validateProviderMetadata(null), /must be an object/);
    });

    it('toPublicInterviewSession projects both score and compositeScore without leaking internal fields', () => {
      const rawSession = {
        _id: '507f1f77bcf86cd799439011',
        status: 'completed',
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
        difficulty: 'intermediate',
        questionCount: 1,
        questions: [
          {
            questionId: 'q1',
            order: 1,
            type: 'conceptual',
            prompt: 'Explain event loop phases.',
            targetSkill: 'Node.js',
            difficulty: 'intermediate',
            evaluation: {
              compositeScore: 0.88,
              dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.85 },
              feedback: 'Very thorough.',
              strengths: ['Great detail'],
              growthAreas: [],
              groundedSkills: ['Node.js'],
            },
          },
        ],
        overallScore: 0.88,
        evaluatorType: 'ai',
      };

      const pub = toPublicInterviewSession(rawSession);
      assert.equal(pub.questions[0].evaluation.compositeScore, 0.88);
      assert.equal(pub.questions[0].evaluation.score, 0.88);
      assert.equal(pub._id, undefined);
      assert.equal(pub.__v, undefined);
    });
  });

  describe('4. Security Violations, Prototype Pollution & Forbidden Fields', () => {
    it('rejects prototype pollution attempts at root and inside nested dimensions', () => {
      const maliciousKeys = ['__proto__', 'constructor', 'prototype', '$where', '$gt'];

      for (const protoKey of maliciousKeys) {
        // Root level
        const rootPollution = { ...baseValidPayload, [protoKey]: { isAdmin: true } };
        const rootResult = validateAiEvaluationJson(rootPollution);
        assert.equal(rootResult.isValid, false);
        assert.ok(rootResult.errors.some((e) => e.includes('Security violation') || e.includes('Unexpected field')));

        assert.throws(
          () => validateAiQuestionEvaluation(rootPollution),
          /(forbidden|Unexpected)/,
        );

        // Dimensions level
        const dimPollution = {
          ...baseValidPayload,
          dimensions: { ...baseValidPayload.dimensions, [protoKey]: 0.99 },
        };
        const dimResult = validateAiEvaluationJson(dimPollution);
        assert.equal(dimResult.isValid, false);
        assert.ok(dimResult.errors.some((e) => e.includes('Security violation') || e.includes('Unexpected dimension')));

        assert.throws(
          () => validateAiQuestionEvaluation(dimPollution),
          /(forbidden|Unexpected)/,
        );
      }
    });

    it('strictly forbids all FORBIDDEN_SECURITY_FIELDS even when strict mode is false', () => {
      for (const forbiddenKey of FORBIDDEN_SECURITY_FIELDS) {
        const payload = { ...baseValidPayload, [forbiddenKey]: true };
        const result = validateAiEvaluationJson(payload, { strict: false });
        assert.equal(result.isValid, false);
        assert.ok(
          result.errors.some((e) => e.includes('Security violation')),
          `Expected security violation for "${forbiddenKey}" even in non-strict mode`,
        );

        assert.throws(
          () => validateAiQuestionEvaluation(payload),
          /forbidden security field/,
          `Expected validateAiQuestionEvaluation to reject "${forbiddenKey}"`,
        );
      }
    });

    it('rejects forbidden security fields in validateStudentAnswer, validateInterviewQuestion, and validateSessionInit', () => {
      assert.throws(
        () => validateStudentAnswer({ questionId: 'q1', answerText: 'Valid candidate answer text.', verified: true }),
        /forbidden security/,
      );

      assert.throws(
        () => validateInterviewQuestion({
          id: 'q1',
          type: 'conceptual',
          targetSkill: 'Node.js',
          prompt: 'Valid question prompt of sufficient length.',
          admin: true,
        }),
        /forbidden security/,
      );

      assert.throws(
        () => validateSessionInit({
          sessionId: 'sess-12345678',
          studentId: 'stud-12345678',
          roleTitle: 'Developer',
          roleSlug: 'developer',
          targetSkills: ['Node.js'],
          role: 'admin',
        }),
        /forbidden security/,
      );
    });

    it('isForbiddenOrPrototypeKey utility accurately identifies security-sensitive keys', () => {
      assert.equal(isForbiddenOrPrototypeKey('verified'), true);
      assert.equal(isForbiddenOrPrototypeKey('eligibleForVerified'), true);
      assert.equal(isForbiddenOrPrototypeKey('isAdmin'), true);
      assert.equal(isForbiddenOrPrototypeKey('jwt'), true);
      assert.equal(isForbiddenOrPrototypeKey('token'), true);
      assert.equal(isForbiddenOrPrototypeKey('__proto__'), true);
      assert.equal(isForbiddenOrPrototypeKey('constructor'), true);
      assert.equal(isForbiddenOrPrototypeKey('$lookup'), true);

      // Safe keys
      assert.equal(isForbiddenOrPrototypeKey('dimensions'), false);
      assert.equal(isForbiddenOrPrototypeKey('accuracy'), false);
      assert.equal(isForbiddenOrPrototypeKey('feedback'), false);
      assert.equal(isForbiddenOrPrototypeKey('strengths'), false);
      assert.equal(isForbiddenOrPrototypeKey('growthAreas'), false);
      assert.equal(isForbiddenOrPrototypeKey('groundedSkills'), false);
    });
  });
});
