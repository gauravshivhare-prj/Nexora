import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_PASS_MARK,
  RUBRIC_DIMENSIONS,
  RUBRIC_DIMENSION_KEYS,
  RUBRIC_DIMENSION_WEIGHTS,
  calculateCompositeQuestionScore,
  validateAiQuestionEvaluation,
  validateStudentAnswer,
} from '../src/domain/interview/interviewContract.js';
import {
  hasInjectionContent,
  validateAiEvaluationJson,
  parseAndValidateAiEvaluation,
} from '../src/domain/interview/interviewEvaluationSchema.js';
import {
  buildInterviewEvaluationRequest,
  escapeCandidateAnswerForPrompt,
  groundAnswerEvaluation,
} from '../src/domain/interview/interviewAnswerGrounding.js';
import {
  evaluateQuestionAnswer,
  evaluateSessionResults,
} from '../src/services/interviewEvaluation.service.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import {
  clearInterviewSessions,
  clearUsers,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  startTestServer,
} from './helpers/testServer.js';
import {
  EVALUATION_QUALITY_FIXTURES,
  EVALUATION_TIERS,
  STRONG_ANSWER_FIXTURES,
  PARTIAL_ANSWER_FIXTURES,
  WEAK_ANSWER_FIXTURES,
  ADVERSARIAL_ANSWER_FIXTURES,
  RUBRIC_BOUNDARY_FIXTURES,
  getFixturesByTier,
} from './fixtures/evaluationQualityFixtures.js';
import { InterviewSession } from '../src/models/InterviewSession.model.js';

describe('TASK R17 — Evaluation Quality Fixtures & Rubric Boundaries Suite', () => {
  let server;
  let mockProviderOutput;
  let mockShouldThrow = false;
  let lastCapturedRequest = null;
  const PASSWORD = 'StrongTestPassword123!';

  before(async () => {
    // Start real test server connected to isolated MongoDB (nexora_radhika_r17_test)
    server = await startTestServer();

    // Verify isolated MongoDB name
    const dbName = mongoose.connection.name;
    assert.equal(
      dbName,
      'nexora_radhika_r17_test',
      `Test must run against isolated database nexora_radhika_r17_test, got: ${dbName}`,
    );

    registerAiProvider({
      name: 'r17-quality-evaluator',
      async complete(request) {
        lastCapturedRequest = request;
        if (mockShouldThrow) {
          throw new Error('Upstream provider temporary failure');
        }
        return {
          text: typeof mockProviderOutput === 'string'
            ? mockProviderOutput
            : JSON.stringify(mockProviderOutput),
          model: 'r17-quality-test-model',
        };
      },
    });

    useAiProvider('r17-quality-evaluator');
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await clearInterviewSessions();
    await clearUsers();
    mockShouldThrow = false;
    lastCapturedRequest = null;
  });

  // =========================================================================
  // 1. Rubric Weights & Mathematical Invariants
  // =========================================================================
  describe('1. Rubric Dimension Weights & Arithmetic Invariants', () => {
    it('verifies rubric dimension weights sum exactly to 1.0000', () => {
      const weights = Object.values(RUBRIC_DIMENSION_WEIGHTS);
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      assert.equal(
        Math.round(totalWeight * 10000) / 10000,
        1.0,
        'Rubric dimension weights must sum to exactly 1.0',
      );
    });

    it('verifies exact weight distribution per canonical dimension', () => {
      assert.equal(RUBRIC_DIMENSION_WEIGHTS.accuracy, 0.35, 'accuracy weight must be 0.35');
      assert.equal(RUBRIC_DIMENSION_WEIGHTS.depth, 0.30, 'depth weight must be 0.30');
      assert.equal(RUBRIC_DIMENSION_WEIGHTS.clarity, 0.20, 'clarity weight must be 0.20');
      assert.equal(RUBRIC_DIMENSION_WEIGHTS.relevance, 0.15, 'relevance weight must be 0.15');
    });

    it('verifies RUBRIC_DIMENSION_KEYS contains exactly 4 canonical keys', () => {
      assert.deepEqual([...RUBRIC_DIMENSION_KEYS].sort(), ['accuracy', 'clarity', 'depth', 'relevance']);
    });

    it('clamps negative dimension scores to 0.0 in composite score calculation', () => {
      const negativeDimensions = {
        accuracy: -0.5,
        depth: -0.2,
        clarity: -1.0,
        relevance: -0.05,
      };
      const score = calculateCompositeQuestionScore(negativeDimensions);
      assert.equal(score, 0.0);
    });

    it('clamps overflow dimension scores (> 1.0) to 1.0 in composite score calculation', () => {
      const overflowDimensions = {
        accuracy: 1.5,
        depth: 2.0,
        clarity: 10.0,
        relevance: 1.05,
      };
      const score = calculateCompositeQuestionScore(overflowDimensions);
      assert.equal(score, 1.0);
    });

    it('handles non-numeric or missing dimensions safely as 0', () => {
      const partialDimensions = { accuracy: 0.8 };
      // 0.8 * 0.35 = 0.28
      const score = calculateCompositeQuestionScore(partialDimensions);
      assert.equal(score, 0.28);
    });

    it('rejects out-of-range dimensions in strict schema validation', () => {
      const invalidJson = {
        dimensions: {
          accuracy: 1.25, // > 1.0
          depth: 0.8,
          clarity: 0.8,
          relevance: 0.8,
        },
        feedback: 'Valid feedback text here.',
      };
      const result = validateAiEvaluationJson(invalidJson);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.some((e) => e.includes('out of range')));
    });

    it('warns when AI model attempts to inject divergent score', () => {
      const raw = {
        dimensions: { accuracy: 0.8, depth: 0.8, clarity: 0.8, relevance: 0.8 },
        compositeScore: 1.0, // Model tries to force 1.0 instead of 0.8
        feedback: 'Candidate performed well on core concepts.',
      };
      const result = validateAiEvaluationJson(raw);
      assert.equal(result.isValid, true);
      assert.equal(result.data.compositeScore, 0.8);
      assert.ok(result.warnings.some((w) => w.includes('overridden by verified composite score')));
    });
  });

  // =========================================================================
  // 2. Rubric Threshold Boundaries & Asymmetric Profiles
  // =========================================================================
  describe('2. Rubric Threshold Boundaries & Policy Invariants', () => {
    it('enforces institutional pass mark of 0.7500', () => {
      assert.equal(INTERVIEW_PASS_MARK, 0.75);
    });

    it('verifies exact borderline fail boundary: score 0.7465 < 0.7500 fails human evaluation', () => {
      const boundaryFixture = RUBRIC_BOUNDARY_FIXTURES.BORDERLINE_FAIL_7499;
      const calculated = calculateCompositeQuestionScore(boundaryFixture.dimensions);
      assert.equal(calculated, boundaryFixture.compositeScore);
      assert.ok(calculated < INTERVIEW_PASS_MARK, 'Score must be strictly less than pass mark');

      const session = {
        _id: new mongoose.Types.ObjectId().toString(),
        targetSkills: ['Node.js'],
        questions: [{ questionId: 'iq-node-001', targetSkill: 'Node.js', evaluation: { compositeScore: calculated } }],
      };

      const result = evaluateSessionResults({ session, evaluatorType: 'human' });
      assert.equal(result.overallScore, calculated);
      assert.equal(result.eligibleForVerified, false);
      assert.equal(result.evidenceResults[0].outcome, 'fail');
    });

    it('verifies exact borderline pass boundary: score 0.7500 >= 0.7500 passes human evaluation', () => {
      const boundaryFixture = RUBRIC_BOUNDARY_FIXTURES.BORDERLINE_PASS_7500;
      const calculated = calculateCompositeQuestionScore(boundaryFixture.dimensions);
      assert.equal(calculated, 0.7500);
      assert.ok(calculated >= INTERVIEW_PASS_MARK, 'Score must meet or exceed pass mark');

      const session = {
        _id: new mongoose.Types.ObjectId().toString(),
        targetSkills: ['Node.js'],
        questions: [{ questionId: 'iq-node-001', targetSkill: 'Node.js', evaluation: { compositeScore: calculated } }],
      };

      const result = evaluateSessionResults({ session, evaluatorType: 'human' });
      assert.equal(result.overallScore, 0.75);
      assert.equal(result.eligibleForVerified, true);
      assert.equal(result.evidenceResults[0].outcome, 'pass');
      assert.equal(result.evidenceResults[0].evidence.strength, 'verified');
    });

    it('verifies Eloquent Charlatan test: high clarity (1.0) with zero accuracy (0.0) cannot pass', () => {
      const fixture = RUBRIC_BOUNDARY_FIXTURES.ELOQUENT_CHARLATAN;
      const score = calculateCompositeQuestionScore(fixture.dimensions);
      // 0*0.35 + 0.40*0.30 + 1.0*0.20 + 0.80*0.15 = 0.4400
      assert.equal(score, 0.4400);
      assert.ok(score < INTERVIEW_PASS_MARK, 'Eloquent answer with no technical accuracy must fail');

      const session = {
        _id: new mongoose.Types.ObjectId().toString(),
        targetSkills: ['Node.js'],
        questions: [{ questionId: 'iq-node-001', targetSkill: 'Node.js', evaluation: { compositeScore: score } }],
      };
      const result = evaluateSessionResults({ session, evaluatorType: 'human' });
      assert.equal(result.eligibleForVerified, false);
      assert.equal(result.evidenceResults[0].outcome, 'fail');
    });

    it('verifies Incoherent Genius test: exceptional accuracy & depth passes despite poor clarity (0.20)', () => {
      const fixture = RUBRIC_BOUNDARY_FIXTURES.INCOHERENT_GENIUS;
      const score = calculateCompositeQuestionScore(fixture.dimensions);
      // 0.95*0.35 + 0.90*0.30 + 0.20*0.20 + 0.90*0.15 = 0.3325 + 0.2700 + 0.0400 + 0.1350 = 0.7775
      assert.equal(score, 0.7775);
      assert.ok(score >= INTERVIEW_PASS_MARK, 'Technical substance must outweigh poor prose style');

      const session = {
        _id: new mongoose.Types.ObjectId().toString(),
        targetSkills: ['Node.js'],
        questions: [{ questionId: 'iq-node-001', targetSkill: 'Node.js', evaluation: { compositeScore: score } }],
      };
      const result = evaluateSessionResults({ session, evaluatorType: 'human' });
      assert.equal(result.eligibleForVerified, true);
      assert.equal(result.evidenceResults[0].outcome, 'pass');
    });

    it('enforces Skill Grounding threshold: accuracy 0.64 drops skill, accuracy 0.65 retains skill', () => {
      const question = { targetSkill: 'Node.js' };

      // Case A: accuracy 0.64 (< 0.65 threshold)
      const failEval = {
        dimensions: { accuracy: 0.64, depth: 0.70, clarity: 0.70, relevance: 0.80 },
        feedback: 'Good overview but missed crucial details.',
        groundedSkills: ['Node.js'],
      };
      const groundedA = groundAnswerEvaluation(failEval, {
        question,
        candidateAnswer: 'Valid explanation about Node.js event loops and timers.',
      });
      assert.deepEqual(groundedA.evaluation.groundedSkills, [], 'Accuracy 0.64 must not award grounded skill');

      // Case B: accuracy 0.65 and relevance 0.65 meets threshold
      const passEval = {
        dimensions: { accuracy: 0.65, depth: 0.70, clarity: 0.70, relevance: 0.65 },
        feedback: 'Solid explanation meeting minimum thresholds.',
        groundedSkills: ['Node.js'],
      };
      const groundedB = groundAnswerEvaluation(passEval, {
        question,
        candidateAnswer: 'Valid explanation about Node.js event loops and timers.',
      });
      assert.deepEqual(groundedB.evaluation.groundedSkills, ['Node.js'], 'Accuracy 0.65 must award grounded skill');
    });

    it('enforces AI evaluation advisory rule: even score of 1.00 cannot grant verified credentials', () => {
      const perfectSession = {
        _id: new mongoose.Types.ObjectId().toString(),
        targetSkills: ['Node.js'],
        questions: [{ questionId: 'iq-node-001', targetSkill: 'Node.js', evaluation: { compositeScore: 1.0 } }],
      };
      const result = evaluateSessionResults({ session: perfectSession, evaluatorType: 'ai' });
      assert.equal(result.overallScore, 1.0);
      assert.equal(result.evaluatorType, 'ai');
      assert.equal(result.eligibleForVerified, false);
      assert.equal(result.evidenceResults[0].outcome, 'uncertain');
      assert.equal(result.evidenceResults[0].eligibleForVerified, false);
      assert.equal(result.evidenceResults[0].evidence, null);
    });
  });

  // =========================================================================
  // 3. Strong Candidate Answer Fixtures Suite
  // =========================================================================
  describe('3. Strong Answer Fixtures (Accurate, Deep, Well-Structured)', () => {
    for (const [key, fixture] of Object.entries(STRONG_ANSWER_FIXTURES)) {
      it(`evaluates strong fixture "${fixture.targetSkill}" (${fixture.id}) exceeding pass mark`, async () => {
        // Mock provider output aligned with strong fixture dimensions
        mockProviderOutput = {
          dimensions: fixture.expectedDimensions,
          feedback: `Candidate demonstrated exceptional mastery of ${fixture.targetSkill}.`,
          strengths: ['Deep technical nuance', 'Comprehensive edge case coverage'],
          growthAreas: [],
          groundedSkills: [fixture.targetSkill],
        };

        const result = await evaluateQuestionAnswer({
          question: {
            id: fixture.questionId,
            targetSkill: fixture.targetSkill,
            prompt: fixture.questionPrompt,
          },
          answerText: fixture.answerText,
        });

        // Verify composite score meets/exceeds pass mark
        assert.ok(
          result.evaluation.compositeScore >= INTERVIEW_PASS_MARK,
          `Composite score (${result.evaluation.compositeScore}) should be >= ${INTERVIEW_PASS_MARK}`,
        );
        assert.equal(result.evaluation.compositeScore, fixture.compositeScore);

        // Verify canonical skill grounding
        assert.deepEqual(result.evaluation.groundedSkills, fixture.expectedGroundedSkills);

        // Verify student answer length validation succeeds
        const studentAns = validateStudentAnswer({
          questionId: fixture.questionId,
          answerText: fixture.answerText,
          durationSeconds: 120,
        });
        assert.equal(studentAns.questionId, fixture.questionId);
      });
    }
  });

  // =========================================================================
  // 4. Partial Candidate Answer Fixtures Suite
  // =========================================================================
  describe('4. Partial Answer Fixtures (Foundational, Incomplete, Sub-Pass)', () => {
    for (const [key, fixture] of Object.entries(PARTIAL_ANSWER_FIXTURES)) {
      it(`evaluates partial fixture "${fixture.targetSkill}" (${fixture.id}) strictly below pass mark`, async () => {
        mockProviderOutput = {
          dimensions: fixture.expectedDimensions,
          feedback: `Candidate shows understanding but misses key architectural details in ${fixture.targetSkill}.`,
          strengths: ['Basic conceptual understanding'],
          growthAreas: ['Deepen technical knowledge on edge cases and mechanisms'],
          groundedSkills: [fixture.targetSkill],
        };

        const result = await evaluateQuestionAnswer({
          question: {
            id: fixture.questionId,
            targetSkill: fixture.targetSkill,
            prompt: fixture.questionPrompt,
          },
          answerText: fixture.answerText,
        });

        // Must strictly fall below institutional pass mark of 0.75
        assert.ok(
          result.evaluation.compositeScore < INTERVIEW_PASS_MARK,
          `Partial score (${result.evaluation.compositeScore}) must be < ${INTERVIEW_PASS_MARK}`,
        );
        assert.ok(
          result.evaluation.compositeScore >= 0.50,
          `Partial score (${result.evaluation.compositeScore}) should be >= 0.50`,
        );
        assert.equal(result.evaluation.compositeScore, fixture.compositeScore);

        // Verify human session evaluation fails on this score
        const session = {
          _id: new mongoose.Types.ObjectId().toString(),
          targetSkills: [fixture.targetSkill],
          questions: [{ questionId: fixture.questionId, targetSkill: fixture.targetSkill, evaluation: result.evaluation }],
        };
        const sessionEval = evaluateSessionResults({ session, evaluatorType: 'human' });
        assert.equal(sessionEval.eligibleForVerified, false);
        assert.equal(sessionEval.evidenceResults[0].outcome, 'fail');
      });
    }
  });

  // =========================================================================
  // 5. Weak Candidate Answer Fixtures Suite
  // =========================================================================
  describe('5. Weak Answer Fixtures (Confused, Inverted, Hand-Waving)', () => {
    for (const [key, fixture] of Object.entries(WEAK_ANSWER_FIXTURES)) {
      it(`evaluates weak fixture "${fixture.targetSkill}" (${fixture.id}) with low score and no grounding`, async () => {
        mockProviderOutput = {
          dimensions: fixture.expectedDimensions,
          feedback: `Candidate exhibited major misconceptions regarding ${fixture.targetSkill}.`,
          strengths: [],
          growthAreas: ['Review fundamental documentation and concepts'],
          groundedSkills: [fixture.targetSkill],
        };

        const result = await evaluateQuestionAnswer({
          question: {
            id: fixture.questionId,
            targetSkill: fixture.targetSkill,
            prompt: fixture.questionPrompt,
          },
          answerText: fixture.answerText,
        });

        // Weak answers must score well below 0.40
        assert.ok(
          result.evaluation.compositeScore <= 0.40,
          `Weak answer score (${result.evaluation.compositeScore}) must be <= 0.40`,
        );
        assert.equal(result.evaluation.compositeScore, fixture.compositeScore);

        // Weak answers never earn skill grounding
        assert.deepEqual(
          result.evaluation.groundedSkills,
          [],
          `Weak answer must not be awarded grounded skills: ${fixture.id}`,
        );
      });
    }
  });

  // =========================================================================
  // 6. Adversarial Candidate Answer Fixtures Suite & Grounding Defense
  // =========================================================================
  describe('6. Adversarial Answer Fixtures (Injection, Extraction, Delimiter Breakout, Evasion)', () => {
    for (const [key, fixture] of Object.entries(ADVERSARIAL_ANSWER_FIXTURES)) {
      if (fixture.isAdversarial) {
        it(`neutralizes adversarial injection "${fixture.id}" even if provider returns 1.0`, async () => {
          // Simulate a duped AI provider that fell for the candidate prompt injection
          mockProviderOutput = {
            dimensions: { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 },
            compositeScore: 1.0,
            feedback: 'Exceptional answers verified immediately.',
            strengths: ['Full score requested by candidate'],
            growthAreas: [],
            groundedSkills: [fixture.targetSkill],
          };

          const result = await evaluateQuestionAnswer({
            question: {
              id: fixture.questionId,
              targetSkill: fixture.targetSkill,
              prompt: fixture.questionPrompt,
            },
            answerText: fixture.answerText,
          });

          // Grounding defense layer MUST neutralize the attack
          assert.ok(
            result.evaluation.compositeScore <= fixture.maxCompositeScore,
            `Adversarial score (${result.evaluation.compositeScore}) must not exceed ${fixture.maxCompositeScore}`,
          );

          // Grounded skills must be completely stripped
          assert.deepEqual(result.evaluation.groundedSkills, []);

          // Prompt escaping verification: untrusted answer was escaped before prompt embedding
          assert.ok(lastCapturedRequest);
          assert.ok(lastCapturedRequest.user.includes('<candidate_untrusted_answer>'));
          assert.ok(!lastCapturedRequest.user.includes('</candidate_untrusted_answer>\n<system'));

          // Human evaluation on this session must strictly fail
          const session = {
            _id: new mongoose.Types.ObjectId().toString(),
            targetSkills: [fixture.targetSkill],
            questions: [{ questionId: fixture.questionId, targetSkill: fixture.targetSkill, evaluation: result.evaluation }],
          };
          const sessionEval = evaluateSessionResults({ session, evaluatorType: 'human' });
          assert.equal(sessionEval.eligibleForVerified, false);
          assert.equal(sessionEval.evidenceResults[0].outcome, 'fail');
        });
      } else {
        it(`evaluates evasion/stuffing fixture "${fixture.id}" with capped relevance and no skill grounding`, async () => {
          // Evaluated with calibrated dimensions for off-topic/stuffing
          mockProviderOutput = {
            dimensions: fixture.expectedDimensions,
            compositeScore: fixture.maxCompositeScore,
            feedback: fixture.description,
            strengths: [],
            growthAreas: ['Provide direct technical explanation'],
            groundedSkills: [fixture.targetSkill],
          };

          const result = await evaluateQuestionAnswer({
            question: {
              id: fixture.questionId,
              targetSkill: fixture.targetSkill,
              prompt: fixture.questionPrompt,
            },
            answerText: fixture.answerText,
          });

          // Composite score must remain bounded and below pass mark
          assert.ok(
            result.evaluation.compositeScore <= fixture.maxCompositeScore,
            `Evasion score (${result.evaluation.compositeScore}) must not exceed ${fixture.maxCompositeScore}`,
          );
          assert.ok(result.evaluation.compositeScore < INTERVIEW_PASS_MARK);

          // Grounded skills must be strictly empty
          assert.deepEqual(result.evaluation.groundedSkills, []);

          // Human evaluation on this session must fail
          const session = {
            _id: new mongoose.Types.ObjectId().toString(),
            targetSkills: [fixture.targetSkill],
            questions: [{ questionId: fixture.questionId, targetSkill: fixture.targetSkill, evaluation: result.evaluation }],
          };
          const sessionEval = evaluateSessionResults({ session, evaluatorType: 'human' });
          assert.equal(sessionEval.eligibleForVerified, false);
          assert.equal(sessionEval.evidenceResults[0].outcome, 'fail');
        });
      }
    }
  });

  // =========================================================================
  // 7. End-to-End Database Integration with Isolated Database
  // =========================================================================
  describe('7. End-to-End Interview Session Database Lifecycle with Isolated Test DB', () => {
    it('creates session, saves answers for all 4 quality tiers, and evaluates in MongoDB', async () => {
      // 1. Register student & login to get token
      const registerRes = await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Quality Fixture Student',
        email: 'quality.student@nexora.test',
        password: PASSWORD,
      });
      assert.equal(registerRes.status, 201);

      const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
        email: 'quality.student@nexora.test',
        password: PASSWORD,
      });
      assert.equal(loginRes.status, 200);
      const studentToken = loginRes.body.data.token;
      assert.ok(studentToken, 'Login must yield JWT token');

      // 2. Create interview session
      const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: studentToken,
        payload: {
          targetRole: 'backend-developer',
          targetSkills: ['Node.js', 'SQL'],
          difficulty: 'intermediate',
          questionCount: 4,
        },
      });
      assert.equal(createRes.status, 201);
      const sessionData = createRes.body.data.session;
      const sessionId = sessionData.id;
      const sessionQuestions = sessionData.questions;
      assert.equal(sessionQuestions.length, 4);

      // Start session (initialized -> in_progress)
      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        {
          method: 'POST',
          token: studentToken,
          payload: {},
        },
      );
      assert.equal(startRes.status, 200);

      // 3. Submit 4 calibrated answers covering Strong, Partial, Weak, Adversarial
      const strongFixture = STRONG_ANSWER_FIXTURES.STRONG_NODE_EVENT_LOOP;
      const partialFixture = PARTIAL_ANSWER_FIXTURES.PARTIAL_SQL_INDEXING;
      const weakFixture = WEAK_ANSWER_FIXTURES.WEAK_NODE_EVENT_LOOP;
      const advFixture = ADVERSARIAL_ANSWER_FIXTURES.ADV_DIRECT_SYSTEM_OVERRIDE;

      const submissions = [
        { qIndex: 0, fixture: strongFixture },
        { qIndex: 1, fixture: partialFixture },
        { qIndex: 2, fixture: weakFixture },
        { qIndex: 3, fixture: advFixture },
      ];

      for (const { qIndex, fixture } of submissions) {
        const targetQ = sessionQuestions[qIndex];
        const questionId = targetQ.id || targetQ.questionId;

        // Configure mock output for this specific step
        mockProviderOutput = {
          dimensions: fixture.expectedDimensions,
          feedback: fixture.tier === EVALUATION_TIERS.ADVERSARIAL
            ? 'Candidate answer did not address the asked technical question.'
            : fixture.description,
          strengths: fixture.tier === EVALUATION_TIERS.STRONG ? ['Solid explanation'] : [],
          growthAreas: fixture.tier !== EVALUATION_TIERS.STRONG ? ['Needs improvement'] : [],
          groundedSkills: [fixture.targetSkill],
        };

        const answerRes = await sendJsonWithToken(
          server.baseUrl,
          `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
          {
            method: 'POST',
            token: studentToken,
            payload: {
              answerText: fixture.answerText,
              durationSeconds: 90,
            },
          },
        );

        assert.equal(answerRes.status, 200, `Answer submission failed for question ${questionId}: ${JSON.stringify(answerRes.body)}`);
        assert.ok(answerRes.body.data.evaluatedQuestion?.evaluation, 'Response must include evaluation payload');
      }

      // 4. Verify session stored in MongoDB
      const sessionDoc = await InterviewSession.findById(sessionId);
      assert.ok(sessionDoc);
      assert.equal(sessionDoc.questions.length, 4);

      // Verify each question evaluation in DB
      // Q0: Strong (Node.js) -> score >= 0.75
      assert.ok(sessionDoc.questions[0].evaluation.compositeScore >= INTERVIEW_PASS_MARK);
      assert.deepEqual(sessionDoc.questions[0].evaluation.groundedSkills, ['Node.js']);

      // Q1: Partial (SQL) -> score in [0.50, 0.7499]
      assert.ok(sessionDoc.questions[1].evaluation.compositeScore < INTERVIEW_PASS_MARK);
      assert.ok(sessionDoc.questions[1].evaluation.compositeScore >= 0.50);

      // Q2: Weak (Node.js) -> score <= 0.40
      assert.ok(sessionDoc.questions[2].evaluation.compositeScore <= 0.40);
      assert.deepEqual(sessionDoc.questions[2].evaluation.groundedSkills, []);

      // Q3: Adversarial (Node.js) -> neutralized, score <= 0.10
      assert.ok(sessionDoc.questions[3].evaluation.compositeScore <= 0.10);
      assert.deepEqual(sessionDoc.questions[3].evaluation.groundedSkills, []);

      // 5. Complete session
      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/complete`,
        {
          method: 'POST',
          token: studentToken,
          payload: {},
        },
      );
      assert.equal(completeRes.status, 200);

      // Session overall score is the average across all 4 questions
      const resultData = completeRes.body.data;
      assert.ok(resultData.overallScore < INTERVIEW_PASS_MARK);
      assert.equal(resultData.eligibleForVerified, false);
      assert.equal(resultData.session.status, 'completed');
    });
  });
});

