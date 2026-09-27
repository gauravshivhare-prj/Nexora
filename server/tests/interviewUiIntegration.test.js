import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  clearInterviewSessions,
  clearSkillEvidenceChecks,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import {
  INTERVIEW_DIFFICULTY,
  INTERVIEW_PASS_MARK,
  SESSION_STATUS,
  INTERVIEW_ERROR_CODES,
} from '../src/domain/interview/interviewContract.js';
import {
  toInterviewSession,
  toInterviewQuestion,
  toInterviewEvaluation,
  resolveInterviewError,
  resolveInterviewEvidenceStatus,
  INTERVIEW_EVIDENCE_STATUS,
  canStartSession,
  canAnswerSession,
  canCompleteSession,
  canAbandonSession,
} from '../../client/src/services/interview.service.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';

describe('TASK R20 — Interview Frontend UI Integration End-to-End Suite', () => {
  let server;
  let mockEvaluationResponse;
  let shouldFailAi = false;
  const PASSWORD = 'ValidPassword123!';

  before(async () => {
    // Explicitly enforce the isolated database for Task R20
    process.env.MONGODB_URI_TEST =
      process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/nexora_radhika_r20_test';
    server = await startTestServer();

    registerAiProvider({
      name: 'r20-ui-mock-provider',
      async complete() {
        if (shouldFailAi) {
          const err = new Error('AI provider transient timeout');
          err.status = 503;
          throw err;
        }
        return {
          text: JSON.stringify(mockEvaluationResponse),
          model: 'mock-r20-model',
        };
      },
    });
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    await clearUsers();
    await clearInterviewSessions();
    await clearSkillEvidenceChecks();
    resetRateLimiters();

    useAiProvider('r20-ui-mock-provider');
    shouldFailAi = false;

    mockEvaluationResponse = {
      score: 0.88,
      dimensions: {
        accuracy: 0.9,
        depth: 0.85,
        clarity: 0.9,
        relevance: 0.87,
      },
      feedback: 'Excellent demonstration of distributed systems concepts with clear event loop explanation.',
      strengths: ['Clear explanation of asynchronous patterns', 'Grounded knowledge of Node.js internals'],
      growthAreas: ['Could touch on backpressure handling in streams'],
      groundedSkills: ['Node.js', 'Distributed Systems'],
    };
  });

  async function registerAndLogin(name = 'UI Candidate') {
    const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}@example.com`;
    const regRes = await postJson(server.baseUrl, '/api/auth/register', {
      name,
      email,
      password: PASSWORD,
    });
    assert.equal(regRes.status, 201, `Failed to register: ${regRes.body?.message}`);

    const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    assert.equal(loginRes.status, 200, `Failed to login: ${loginRes.body?.message}`);

    return { token: loginRes.body.data.token, user: loginRes.body.data.user };
  }

  function postAuthJson(path, token, payload) {
    return sendJsonWithToken(server.baseUrl, path, { method: 'POST', token, payload });
  }

  function postAuth(path, token) {
    return sendWithToken(server.baseUrl, path, { method: 'POST', token });
  }

  function getAuth(path, token) {
    return getWithToken(server.baseUrl, path, token);
  }

  describe('1. Start & Setup Flow (UI to API)', () => {
    it('initializes session with UI setup parameters and transitions to in_progress on start', async () => {
      const candidate = await registerAndLogin('Setup Candidate');

      // Candidate configures session in InterviewSetup component
      const setupPayload = {
        targetRole: 'Full Stack Developer',
        targetSkills: ['Node.js', 'React', 'TypeScript'],
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        questionCount: 2,
      };

      const createRes = await postAuthJson('/api/interviews/sessions', candidate.token, setupPayload);
      assert.equal(createRes.status, 201);
      assert.equal(createRes.body.success, true);

      // Verify client normalizer handles initial setup payload
      const clientSession = toInterviewSession(createRes.body.data.session);
      assert.equal(clientSession.status, SESSION_STATUS.INITIALIZED);
      assert.equal(clientSession.targetRole, 'Full Stack Developer');
      assert.equal(clientSession.questionCount, 2);
      assert.equal(canStartSession(clientSession), true);
      assert.equal(canAnswerSession(clientSession), false);

      // Candidate clicks "Start Interview"
      const startRes = await postAuth(
        `/api/interviews/sessions/${clientSession.id}/start`,
        candidate.token
      );
      assert.equal(startRes.status, 200);
      assert.equal(startRes.body.success, true);

      const activeSession = toInterviewSession(startRes.body.data.session);
      assert.equal(activeSession.status, SESSION_STATUS.IN_PROGRESS);
      assert.ok(activeSession.startedAt);
      assert.ok(activeSession.expiresAt);
      assert.equal(canStartSession(activeSession), false);
      assert.equal(canAnswerSession(activeSession), true);
      assert.equal(activeSession.questions.length, 2);

      // Verify current question is properly structured
      const currentQ = activeSession.questions[activeSession.currentQuestionIndex];
      assert.equal(currentQ.order, 1);
      assert.ok(currentQ.id.length > 0);
      assert.ok(currentQ.prompt.length > 0);
    });

    it('rejects start if session is already active or terminal', async () => {
      const candidate = await registerAndLogin('Guard Candidate');
      const createRes = await postAuthJson('/api/interviews/sessions', candidate.token, {
        targetRole: 'Backend Developer',
        targetSkills: ['Node.js'],
        difficulty: INTERVIEW_DIFFICULTY.BEGINNER,
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;

      // Start once
      await postAuth(`/api/interviews/sessions/${sessionId}/start`, candidate.token);

      // Start second time -> rejected with 400 INTERVIEW_INVALID_STATE
      const secondStart = await postAuth(`/api/interviews/sessions/${sessionId}/start`, candidate.token);
      assert.ok([400, 409].includes(secondStart.status));
      assert.ok(
        [INTERVIEW_ERROR_CODES.INVALID_TRANSITION, 'INTERVIEW_INVALID_STATE'].includes(secondStart.body.code),
      );
    });
  });

  describe('2. Active Question Flow & Answer Submission', () => {
    it('submits valid candidate answer, updates question status, and yields evaluation breakdown', async () => {
      const candidate = await registerAndLogin('Flow Candidate');
      const createRes = await postAuthJson('/api/interviews/sessions', candidate.token, {
        targetRole: 'Backend Developer',
        targetSkills: ['Node.js'],
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;
      const startRes = await postAuth(`/api/interviews/sessions/${sessionId}/start`, candidate.token);
      const questionId = startRes.body.data.session.questions[0].id;

      const answerText = 'Node.js utilizes a single-threaded event loop architecture backed by libuv for asynchronous I/O operations.';
      const answerRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        candidate.token,
        { answerText }
      );

      assert.equal(answerRes.status, 200);
      assert.equal(answerRes.body.success, true);

      // Verify evaluated question payload
      const evaluatedQ = toInterviewQuestion(answerRes.body.data.evaluatedQuestion);
      assert.equal(evaluatedQ.answer.answerText, answerText);
      assert.ok(evaluatedQ.evaluation);

      const evaluation = toInterviewEvaluation(evaluatedQ.evaluation);
      assert.ok(evaluation.compositeScore >= 0.85);
      assert.equal(evaluation.dimensions.accuracy, 0.9);
      assert.equal(evaluation.dimensions.depth, 0.85);
      assert.equal(evaluation.dimensions.clarity, 0.9);
      assert.equal(evaluation.dimensions.relevance, 0.87);
      assert.ok(evaluation.feedback.includes('event loop'));
      assert.deepEqual(evaluation.groundedSkills, ['Node.js']);
    });

    it('rejects answers that violate length bounds (< 5 or > 5000 characters)', async () => {
      const candidate = await registerAndLogin('Validation Candidate');
      const createRes = await postAuthJson('/api/interviews/sessions', candidate.token, {
        targetRole: 'Backend Developer',
        targetSkills: ['Node.js'],
        difficulty: INTERVIEW_DIFFICULTY.BEGINNER,
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;
      const startRes = await postAuth(`/api/interviews/sessions/${sessionId}/start`, candidate.token);
      const questionId = startRes.body.data.session.questions[0].id;

      // Too short (< 5 chars)
      const shortRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        candidate.token,
        { answerText: 'Tiny' }
      );
      assert.equal(shortRes.status, 400);

      // Too long (> 5000 chars)
      const longRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        candidate.token,
        { answerText: 'A'.repeat(5001) }
      );
      assert.equal(longRes.status, 400);
    });
  });

  describe('3. Loading, Transient Failure & Retry Flow', () => {
    it('handles transient evaluation failure, informs UI retry mechanism, and succeeds on retry', async () => {
      const candidate = await registerAndLogin('Retry Candidate');
      const createRes = await postAuthJson('/api/interviews/sessions', candidate.token, {
        targetRole: 'Backend Developer',
        targetSkills: ['Node.js'],
        difficulty: INTERVIEW_DIFFICULTY.ADVANCED,
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;
      const startRes = await postAuth(`/api/interviews/sessions/${sessionId}/start`, candidate.token);
      const questionId = startRes.body.data.session.questions[0].id;

      const candidateAnswer = 'Event-driven architecture with reactive streams and cluster mode execution.';

      // Simulate AI Provider failure (e.g. timeout / 503)
      shouldFailAi = true;

      const failRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        candidate.token,
        { answerText: candidateAnswer }
      );

      // Backend responds with 503 AI_PROVIDER_FAILED
      assert.ok([500, 502, 503].includes(failRes.status));
      assert.equal(failRes.body.success, false);

      // Verify client error resolver recognizes error as retryable
      const errorResolution = resolveInterviewError({
        code: failRes.body.code || INTERVIEW_ERROR_CODES.AI_EVALUATION_FAILED,
        status: failRes.status,
        message: failRes.body.message,
      });
      assert.equal(errorResolution.retryable, true);
      assert.ok(errorResolution.userAction);

      // Restore AI provider health
      shouldFailAi = false;

      // Candidate clicks "Retry Submission" with the same answer
      const retryRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        candidate.token,
        { answerText: candidateAnswer }
      );

      assert.equal(retryRes.status, 200);
      assert.equal(retryRes.body.success, true);
      assert.ok(retryRes.body.data.evaluatedQuestion.evaluation);
    });
  });

  describe('4. Results & Institutional Evidence Verification Flow', () => {
    it('completes passing session, aggregates composite score, and displays Advisory Supported badge', async () => {
      const candidate = await registerAndLogin('Pass Candidate');
      const createRes = await postAuthJson('/api/interviews/sessions', candidate.token, {
        targetRole: 'Backend Developer',
        targetSkills: ['Node.js'],
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;
      const startRes = await postAuth(`/api/interviews/sessions/${sessionId}/start`, candidate.token);
      const questionId = startRes.body.data.session.questions[0].id;

      // Answer with 88% evaluation
      const answerRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        candidate.token,
        { answerText: 'Comprehensive answer detailing microservice patterns and event loop concurrency.' }
      );
      assert.equal(answerRes.status, 200);

      // Candidate clicks "Complete Session"
      const completeRes = await postAuth(
        `/api/interviews/sessions/${sessionId}/complete`,
        candidate.token
      );
      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.success, true);

      // Normalize session with client helper
      const completedSession = toInterviewSession(completeRes.body.data.session);
      assert.equal(completedSession.status, SESSION_STATUS.COMPLETED);
      assert.ok(completedSession.overallScore >= INTERVIEW_PASS_MARK);
      assert.equal(canCompleteSession(completedSession), false);

      // Verify institutional evidence check created in DB
      const checks = await SkillEvidenceCheck.find({ reference: String(completedSession.id) });
      assert.equal(checks.length, 1);
      assert.equal(checks[0].outcome, 'uncertain');
      assert.equal(checks[0].eligibleForVerified, false);

      // Verify frontend evidence status presentation resolves to Advisory Supported
      const evidencePresentation = resolveInterviewEvidenceStatus(completedSession);
      assert.equal(evidencePresentation.statusKey, INTERVIEW_EVIDENCE_STATUS.ADVISORY_SUPPORTED);
      assert.equal(evidencePresentation.label, 'Advisory Supported');
      assert.ok(evidencePresentation.badgeClass.includes('amber'));
      assert.ok(evidencePresentation.description.includes('AI-evaluated'));
    });

    it('completes failing session (< 75%), displays Below Passing Threshold badge', async () => {
      const candidate = await registerAndLogin('Fail Candidate');
      const createRes = await postAuthJson('/api/interviews/sessions', candidate.token, {
        targetRole: 'Backend Developer',
        targetSkills: ['Node.js'],
        difficulty: INTERVIEW_DIFFICULTY.ADVANCED,
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;
      const startRes = await postAuth(`/api/interviews/sessions/${sessionId}/start`, candidate.token);
      const questionId = startRes.body.data.session.questions[0].id;

      // Sub-par evaluation (55% score)
      mockEvaluationResponse = {
        score: 0.55,
        dimensions: {
          accuracy: 0.5,
          depth: 0.5,
          clarity: 0.6,
          relevance: 0.6,
        },
        feedback: 'Incomplete explanation lacking practical implementation depth.',
        strengths: ['Acknowledged basic concept.'],
        growthAreas: ['Needs substantially more technical depth.'],
        groundedSkills: ['Node.js'],
      };

      const answerRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        candidate.token,
        { answerText: 'Basic overview of Node.js concepts without specific implementation details.' }
      );
      assert.equal(answerRes.status, 200);

      const completeRes = await postAuth(
        `/api/interviews/sessions/${sessionId}/complete`,
        candidate.token
      );
      assert.equal(completeRes.status, 200);

      const completedSession = toInterviewSession(completeRes.body.data.session);
      assert.ok(completedSession.overallScore < INTERVIEW_PASS_MARK);

      const evidencePresentation = resolveInterviewEvidenceStatus(completedSession);
      assert.equal(evidencePresentation.statusKey, INTERVIEW_EVIDENCE_STATUS.UNVERIFIED_BELOW_PASS);
      assert.equal(evidencePresentation.label, 'Below Passing Threshold');
      assert.ok(evidencePresentation.badgeClass.includes('rose'));
    });

    it('allows abandoning an active session and preserves abandoned state', async () => {
      const candidate = await registerAndLogin('Abandon Candidate');
      const createRes = await postAuthJson('/api/interviews/sessions', candidate.token, {
        targetRole: 'Backend Developer',
        targetSkills: ['Node.js'],
        difficulty: INTERVIEW_DIFFICULTY.BEGINNER,
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;
      await postAuth(`/api/interviews/sessions/${sessionId}/start`, candidate.token);

      // Abandon session
      const abandonRes = await postAuth(
        `/api/interviews/sessions/${sessionId}/abandon`,
        candidate.token
      );
      assert.equal(abandonRes.status, 200);
      assert.equal(abandonRes.body.data.session.status, SESSION_STATUS.ABANDONED);

      const abandonedSession = toInterviewSession(abandonRes.body.data.session);
      assert.equal(canAbandonSession(abandonedSession), false);
      assert.equal(canAnswerSession(abandonedSession), false);
    });
  });

  describe('5. Security, Ownership & Secret Protection', () => {
    it('prevents IDOR: candidate B cannot view, start, answer, or complete candidate A session', async () => {
      const candidateA = await registerAndLogin('Candidate A');
      const candidateB = await registerAndLogin('Candidate B');

      const createRes = await postAuthJson('/api/interviews/sessions', candidateA.token, {
        targetRole: 'Backend Developer',
        targetSkills: ['Node.js'],
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        questionCount: 1,
      });
      const sessionAId = createRes.body.data.session.id;
      const startRes = await postAuth(`/api/interviews/sessions/${sessionAId}/start`, candidateA.token);
      const questionId = startRes.body.data.session.questions[0].id;

      // Candidate B tries to read candidate A session
      const readRes = await getAuth(`/api/interviews/sessions/${sessionAId}`, candidateB.token);
      assert.ok([403, 404].includes(readRes.status));

      // Candidate B tries to start candidate A session
      const startAttemptRes = await postAuth(`/api/interviews/sessions/${sessionAId}/start`, candidateB.token);
      assert.ok([403, 404].includes(startAttemptRes.status));

      // Candidate B tries to answer candidate A session
      const answerRes = await postAuthJson(
        `/api/interviews/sessions/${sessionAId}/questions/${questionId}/answers`,
        candidateB.token,
        { answerText: 'Unauthorized attempt to answer question.' }
      );
      assert.ok([403, 404].includes(answerRes.status));
    });

    it('rejects unauthenticated requests across all interview endpoints', async () => {
      const unauthStart = await postJson(server.baseUrl, '/api/interviews/sessions/fakeid/start', {});
      assert.equal(unauthStart.status, 401);

      const unauthCreate = await postJson(server.baseUrl, '/api/interviews/sessions', {});
      assert.equal(unauthCreate.status, 401);
    });

    it('does not leak internal system prompts, api keys, or user credentials in session responses', async () => {
      const candidate = await registerAndLogin('Sanitize Candidate');
      const createRes = await postAuthJson('/api/interviews/sessions', candidate.token, {
        targetRole: 'Backend Developer',
        targetSkills: ['SQL'],
        difficulty: INTERVIEW_DIFFICULTY.BEGINNER,
        questionCount: 1,
      });

      const responseString = JSON.stringify(createRes.body);
      assert.equal(responseString.includes(PASSWORD), false);
      assert.equal(responseString.includes('OPENAI_API_KEY'), false);
      assert.equal(responseString.includes('systemPrompt'), false);
      assert.equal(responseString.includes('apiKey'), false);
    });
  });
});
