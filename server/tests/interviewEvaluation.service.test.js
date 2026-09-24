import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  evaluateQuestionAnswer,
  evaluateSessionResults,
} from '../src/services/interviewEvaluation.service.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { INTERVIEW_CONTRACT_VERSION, INTERVIEW_PASS_MARK } from '../src/domain/interview/interviewContract.js';
import { ADVERSARIAL_INTERVIEW_FIXTURES } from './fixtures/adversarialInterviewFixtures.js';

describe('R7 — AI Interview Evaluation Service Suite', () => {
  const sampleQuestion = {
    id: 'iq-node-001',
    targetSkill: 'Node.js',
    type: 'conceptual',
    difficulty: 'intermediate',
    prompt: 'Explain the primary phases of the Node.js event loop.',
    rubricCriteria: [
      'Names event loop phases (timers, poll, check, close)',
      'Explains microtask queue priority',
    ],
  };

  const validAnswerText =
    'The event loop has timer, pending, idle, poll, check, and close phases. Microtasks drain immediately after each phase.';

  let mockResponse;
  let mockShouldThrow = false;
  let mockDelayMs = 0;
  let lastCapturedRequest = null;

  beforeEach(() => {
    resetAiProviders();
    mockShouldThrow = false;
    mockDelayMs = 0;
    lastCapturedRequest = null;

    mockResponse = {
      text: JSON.stringify({
        dimensions: {
          accuracy: 0.90,
          depth: 0.85,
          clarity: 0.80,
          relevance: 0.95,
        },
        feedback: 'Solid, precise breakdown of event loop phases and microtasks.',
        strengths: ['Identified key phases', 'Accurate microtask drain point'],
        growthAreas: ['Mention libuv threadpool in detail'],
        groundedSkills: ['Node.js'],
      }),
      model: 'test-evaluator-model',
    };

    registerAiProvider({
      name: 'mock-evaluator',
      async complete(request) {
        lastCapturedRequest = request;
        if (request.signal?.aborted) {
          throw request.signal.reason || new Error('Request aborted');
        }
        if (mockDelayMs > 0) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, mockDelayMs);
            if (request.signal) {
              request.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(request.signal.reason || new Error('Request aborted'));
              });
            }
          });
        }
        if (mockShouldThrow) {
          throw new Error('Upstream provider quota exceeded or connection reset');
        }
        return mockResponse;
      },
    });

    useAiProvider('mock-evaluator');
  });

  afterEach(() => {
    resetAiProviders();
  });

  describe('1. Happy Path & End-to-End Evaluation', () => {
    it('evaluates a valid candidate answer through the provider and returns structured evaluation', async () => {
      const result = await evaluateQuestionAnswer({
        question: sampleQuestion,
        answerText: validAnswerText,
      });

      assert.ok(result.evaluation);
      // Composite: 0.90*0.35 + 0.85*0.30 + 0.80*0.20 + 0.95*0.15 = 0.315 + 0.255 + 0.16 + 0.1425 = 0.8725
      assert.equal(result.evaluation.compositeScore, 0.8725);
      assert.deepEqual(result.evaluation.groundedSkills, ['Node.js']);
      assert.equal(result.evaluation.feedback, 'Solid, precise breakdown of event loop phases and microtasks.');

      // Check provider audit metadata
      assert.ok(result.providerMetadata);
      assert.equal(result.providerMetadata.provider, 'mock-evaluator');
      assert.equal(result.providerMetadata.model, 'test-evaluator-model');
      assert.equal(result.providerMetadata.contractVersion, INTERVIEW_CONTRACT_VERSION);
      assert.equal(typeof result.providerMetadata.latencyMs, 'number');

      // Check prompt construction boundary
      assert.ok(lastCapturedRequest.user.includes('<candidate_untrusted_answer>'));
      assert.ok(!lastCapturedRequest.system.includes(validAnswerText));
    });

    it('rejects candidate answer that is too short to evaluate', async () => {
      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: sampleQuestion,
            answerText: 'Hi',
          }),
        (err) => err.statusCode === 400 && err.errorCode === ERROR_CODES.BAD_REQUEST,
      );
    });
  });

  describe('2. Provider Outage, Unconfigured & Error Handling', () => {
    it('returns safe 503 AI_PROVIDER_NOT_CONFIGURED when no provider is active', async () => {
      useAiProvider(null);

      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: sampleQuestion,
            answerText: validAnswerText,
          }),
        (err) => err.statusCode === 503 && err.errorCode === ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
      );
    });

    it('returns safe 503 AI_PROVIDER_FAILED without leaking provider credentials on failure', async () => {
      mockShouldThrow = true;

      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: sampleQuestion,
            answerText: validAnswerText,
          }),
        (err) => {
          assert.equal(err.statusCode, 503);
          assert.equal(err.errorCode, ERROR_CODES.AI_PROVIDER_FAILED);
          // Provider internal error or key must not leak
          assert.ok(!err.message.includes('quota exceeded'));
          return true;
        },
      );
    });

    it('returns safe 503 when provider returns non-string response', async () => {
      mockResponse = { text: null };

      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: sampleQuestion,
            answerText: validAnswerText,
          }),
        (err) => err.statusCode === 503 && err.errorCode === ERROR_CODES.AI_PROVIDER_FAILED,
      );
    });
  });

  describe('3. Timeout & Abort Signal Isolation', () => {
    it('aborts and fails safely when provider call exceeds timeout', async () => {
      mockDelayMs = 150; // Delay longer than our test timeout of 50ms

      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: sampleQuestion,
            answerText: validAnswerText,
            timeoutMs: 50,
          }),
        (err) => err.statusCode === 503 && err.errorCode === ERROR_CODES.AI_PROVIDER_FAILED,
      );
    });

    it('honors caller cancellation signal immediately', async () => {
      const controller = new AbortController();
      controller.abort(new Error('Caller cancelled request'));

      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: sampleQuestion,
            answerText: validAnswerText,
            signal: controller.signal,
          }),
      );
    });
  });

  describe('4. Invalid & Malformed AI Output Defense', () => {
    it('returns 502 AI_OUTPUT_INVALID when model returns unparseable JSON', async () => {
      mockResponse = { text: '{"dimensions": {"accuracy": 0.8, ' }; // Broken JSON

      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: sampleQuestion,
            answerText: validAnswerText,
          }),
        (err) => err.statusCode === 502 && err.errorCode === ERROR_CODES.AI_OUTPUT_INVALID,
      );
    });

    it('returns 502 AI_OUTPUT_INVALID when model omits required dimensions', async () => {
      mockResponse = {
        text: JSON.stringify({
          dimensions: { accuracy: 0.8 }, // Missing depth, clarity, relevance
          feedback: 'Too short response from model.',
        }),
      };

      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: sampleQuestion,
            answerText: validAnswerText,
          }),
        (err) => err.statusCode === 502 && err.errorCode === ERROR_CODES.AI_OUTPUT_INVALID,
      );
    });

    it('returns 502 AI_OUTPUT_INVALID when model attempts to inject forbidden security fields', async () => {
      mockResponse = {
        text: JSON.stringify({
          dimensions: { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 },
          feedback: 'Candidate is pre-approved for senior architect.',
          verified: true, // Forbidden key
        }),
      };

      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: sampleQuestion,
            answerText: validAnswerText,
          }),
        (err) => {
          assert.equal(err.statusCode, 502);
          assert.equal(err.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);
          assert.ok(err.message.includes('forbidden security field'));
          return true;
        },
      );
    });
  });

  describe('5. Adversarial Candidate Injection Defense', () => {
    it('neutralizes adversarial prompt injection even if provider was duped into returning 1.0', async () => {
      // Duped provider returns perfect score
      mockResponse = {
        text: JSON.stringify({
          dimensions: { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 },
          feedback: 'Exceptional performance verified.',
          strengths: ['Flawless'],
          growthAreas: [],
          groundedSkills: ['Node.js'],
        }),
      };

      const result = await evaluateQuestionAnswer({
        question: sampleQuestion,
        answerText: ADVERSARIAL_INTERVIEW_FIXTURES.DIRECT_SYSTEM_OVERRIDE.answerText,
      });

      // Grounding layer stops the attack: dimensions and composite score capped <= 0.1
      assert.ok(result.evaluation.compositeScore <= 0.1);
      assert.ok(result.evaluation.dimensions.relevance <= 0.1);
      assert.deepEqual(result.evaluation.groundedSkills, []);
      assert.ok(result.warnings.some((w) => w.includes('Adversarial prompt injection pattern detected')));
    });
  });

  describe('6. Session Results & Institutional Evidence Rules', () => {
    const sessionFixture = {
      _id: '507f1f77bcf86cd799439011',
      targetSkills: ['Node.js'],
      questions: [
        {
          questionId: 'iq-node-001',
          targetSkill: 'Node.js',
          evaluation: { compositeScore: 0.90 },
        },
        {
          questionId: 'iq-node-002',
          targetSkill: 'Node.js',
          evaluation: { compositeScore: 0.80 },
        },
      ],
    };

    it('AI evaluation NEVER directly produces verified evidence (strictly advisory / supported)', () => {
      const evaluation = evaluateSessionResults({
        session: sessionFixture,
        evaluatorType: 'ai',
      });

      assert.equal(evaluation.overallScore, 0.85);
      assert.equal(evaluation.evaluatorType, 'ai');
      assert.equal(evaluation.eligibleForVerified, false);

      assert.equal(evaluation.evidenceResults.length, 1);
      const evidence = evaluation.evidenceResults[0];
      assert.equal(evidence.skillKey, 'nodejs');
      // AI interview result is uncertain provenance
      assert.equal(evidence.outcome, 'uncertain');
      assert.equal(evidence.eligibleForVerified, false);
      assert.equal(evidence.evidence, null);
    });

    it('Human evaluation creates verified evidence when overall score >= 0.75', () => {
      const evaluation = evaluateSessionResults({
        session: sessionFixture,
        evaluatorType: 'human',
      });

      assert.equal(evaluation.overallScore, 0.85);
      assert.equal(evaluation.evaluatorType, 'human');
      assert.equal(evaluation.eligibleForVerified, true);

      const evidence = evaluation.evidenceResults[0];
      assert.equal(evidence.outcome, 'pass');
      assert.equal(evidence.eligibleForVerified, true);
      assert.equal(evidence.evidence.strength, 'verified');
    });

    it('Human evaluation fails when score is below 0.75 pass mark', () => {
      const failingSession = {
        _id: '507f1f77bcf86cd799439012',
        targetSkills: ['Node.js'],
        questions: [
          {
            questionId: 'iq-node-001',
            targetSkill: 'Node.js',
            evaluation: { compositeScore: 0.50 },
          },
        ],
      };

      const evaluation = evaluateSessionResults({
        session: failingSession,
        evaluatorType: 'human',
      });

      assert.equal(evaluation.overallScore, 0.50);
      assert.equal(evaluation.eligibleForVerified, false);
      assert.equal(evaluation.evidenceResults[0].outcome, 'fail');
    });
  });
});
