import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { SESSION_STATUS } from '../src/domain/interview/interviewContract.js';
import { InterviewSession } from '../src/models/InterviewSession.model.js';
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
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';
import { submitQuestionAnswer } from '../src/services/interviewSession.service.js';

const PASSWORD = 'Str0ngPassphrase';

describe('R08 — Timeout & Failure Isolation Suite', () => {
  let server;
  let counter = 0;
  let mockProviderOutput = null;
  let mockProviderError = null;
  let mockProviderDelayMs = 0;

  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: 'failure-isolation-mock-provider',
      async complete(request) {
        if (mockProviderDelayMs > 0) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, mockProviderDelayMs);
            if (request.signal) {
              request.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(request.signal.reason || new Error('Aborted'));
              });
            }
          });
        }

        if (mockProviderError) {
          throw mockProviderError;
        }

        return {
          text:
            typeof mockProviderOutput === 'string'
              ? mockProviderOutput
              : JSON.stringify(mockProviderOutput),
          model: 'failure-isolation-model-v1',
        };
      },
    });
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    await clearInterviewSessions();
    await clearUsers();
    resetRateLimiters();

    useAiProvider('failure-isolation-mock-provider');
    mockProviderError = null;
    mockProviderDelayMs = 0;

    mockProviderOutput = {
      dimensions: {
        accuracy: 0.85,
        depth: 0.80,
        clarity: 0.85,
        relevance: 0.90,
      },
      feedback: 'Good technical understanding of event loop phases and concurrency.',
      strengths: ['Clear explanation of timers and poll phases'],
      growthAreas: ['Include setImmediate edge cases'],
      groundedSkills: ['Node.js'],
    };
  });

  async function createAccount(label) {
    counter += 1;
    const email = `${label}_${counter}_${Date.now()}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: `User ${label}`,
      email,
      password: PASSWORD,
    });
    const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return {
      userId: loginRes.body.data.user.id,
      token: loginRes.body.data.token,
    };
  }

  async function createStartedSession(token, overrides = {}) {
    const createRes = await sendJsonWithToken(
      server.baseUrl,
      '/api/interviews/sessions',
      {
        method: 'POST',
        token,
        payload: {
          targetRole: 'Backend Developer',
          targetSkills: ['Node.js', 'MongoDB'],
          difficulty: 'intermediate',
          questionCount: 3,
          ...overrides,
        },
      },
    );
    assert.equal(createRes.status, 201);
    const session = createRes.body.data.session;

    const startRes = await sendWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${session.id}/start`,
      { method: 'POST', token },
    );
    assert.equal(startRes.status, 200);

    return startRes.body.data.session;
  }

  describe('1. 429 Rate Limit Isolation & Session Integrity', () => {
    it('preserves clean session state when client hits 429 rate limit and allows retry', async () => {
      const user = await createAccount('rate_limit_user');
      const session = await createStartedSession(user.token, { questionCount: 2 });
      const q0Id = session.questions[0].questionId;

      // Exhaust 10/10 rate limit
      for (let i = 0; i < 10; i += 1) {
        await sendJsonWithToken(
          server.baseUrl,
          `/api/interviews/sessions/${session.id}/questions/${q0Id}/answers`,
          {
            method: 'POST',
            token: user.token,
            payload: { answerText: `Valid attempt answer text ${i + 1}.` },
          },
        );
      }

      // 11th request triggers HTTP 429
      const rateLimitedRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${q0Id}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'This answer should be rate limited.' },
        },
      );
      assert.equal(rateLimitedRes.status, 429);
      assert.equal(rateLimitedRes.body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);

      // Verify database session document was not corrupted
      const dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.status, SESSION_STATUS.IN_PROGRESS);
      assert.equal(dbSession.attemptCount, 1); // Only the first successful answer was recorded
      assert.equal(dbSession.questions[1].answer, null);
      assert.equal(dbSession.questions[1].evaluation, null);

      // Reset limiter to simulate rate window expiry
      resetRateLimiters();

      // Submit next question now that rate limit cleared
      const q1Id = session.questions[1].questionId;
      const retryRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${q1Id}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Valid answer for question 1 after rate limit cleared.' },
        },
      );
      assert.equal(retryRes.status, 200);
      assert.equal(retryRes.body.data.evaluatedQuestion.questionId, q1Id);

      const finalDbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(finalDbSession.attemptCount, 2);
      assert.ok(finalDbSession.questions[1].evaluation);
    });
  });

  describe('2. 503 Provider Outage Isolation & Safe Retry', () => {
    it('leaves session in_progress without incrementing attempts when provider returns 503, and allows immediate retry', async () => {
      const user = await createAccount('provider_outage_user');
      const session = await createStartedSession(user.token, { questionCount: 2 });
      const questionId = session.questions[0].questionId;

      // Simulate upstream network error with simulated sensitive credentials
      mockProviderError = new Error('Upstream provider connection refused at 10.0.0.5:443 with secret key AIzaSy_TEST_KEY_123');

      const failedRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Solid conceptual answer about Node event loop.' },
        },
      );
      assert.equal(failedRes.status, 503);
      assert.equal(failedRes.body.errorCode, ERROR_CODES.AI_PROVIDER_FAILED);

      // Assert credentials did not leak into response
      const bodyStr = JSON.stringify(failedRes.body);
      assert.ok(!bodyStr.includes('AIzaSy_TEST_KEY_123'));
      assert.ok(!bodyStr.includes('10.0.0.5'));

      // Verify DB session is still completely uncorrupted
      const dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.status, SESSION_STATUS.IN_PROGRESS);
      assert.equal(dbSession.attemptCount, 0);
      assert.equal(dbSession.currentQuestionIndex, 0);
      assert.equal(dbSession.questions[0].answer, null);
      assert.equal(dbSession.questions[0].evaluation, null);

      // Restore provider health and retry the exact same question
      mockProviderError = null;

      const retryRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Solid conceptual answer about Node event loop.' },
        },
      );
      assert.equal(retryRes.status, 200);
      assert.equal(retryRes.body.data.evaluatedQuestion.questionId, questionId);
      assert.ok(retryRes.body.data.evaluatedQuestion.evaluation.compositeScore > 0);

      // Verify DB session updated correctly on successful retry
      const updatedSession = await InterviewSession.findById(session.id).lean();
      assert.equal(updatedSession.status, SESSION_STATUS.IN_PROGRESS);
      assert.equal(updatedSession.attemptCount, 1);
      assert.equal(updatedSession.currentQuestionIndex, 1);
      assert.ok(updatedSession.questions[0].answer);
      assert.ok(updatedSession.questions[0].evaluation);
    });
  });

  describe('3. 503 Provider Timeout Isolation & Safe Retry', () => {
    it('leaves session in_progress without incrementing attempts when provider times out, and allows immediate retry', async () => {
      const user = await createAccount('timeout_isolation_user');
      const session = await createStartedSession(user.token, { questionCount: 2 });
      const questionId = session.questions[0].questionId;

      // Simulate provider timeout
      mockProviderDelayMs = 200;

      await assert.rejects(
        () =>
          submitQuestionAnswer(
            user.userId,
            session.id,
            questionId,
            { answerText: 'Answer submitted that encounters a provider timeout.' },
            { timeoutMs: 50 },
          ),
        (error) => {
          assert.equal(error.statusCode, 503);
          assert.equal(error.errorCode, ERROR_CODES.AI_PROVIDER_FAILED);
          assert.match(error.message, /timed out/i);
          return true;
        },
      );

      // Verify DB session was not corrupted by the timeout
      const dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.status, SESSION_STATUS.IN_PROGRESS);
      assert.equal(dbSession.attemptCount, 0);
      assert.equal(dbSession.currentQuestionIndex, 0);
      assert.equal(dbSession.questions[0].answer, null);
      assert.equal(dbSession.questions[0].evaluation, null);

      // Clear delay and retry
      mockProviderDelayMs = 0;
      const retryResult = await submitQuestionAnswer(
        user.userId,
        session.id,
        questionId,
        { answerText: 'Answer submitted that encounters a provider timeout.' },
      );

      assert.ok(retryResult.evaluatedQuestion);
      assert.equal(retryResult.evaluatedQuestion.questionId, questionId);

      const updatedSession = await InterviewSession.findById(session.id).lean();
      assert.equal(updatedSession.attemptCount, 1);
      assert.equal(updatedSession.currentQuestionIndex, 1);
      assert.ok(updatedSession.questions[0].evaluation);
    });
  });

  describe('4. 502 Malformed Output & Schema Violation Isolation', () => {
    it('leaves session uncorrupted on unparseable JSON text, invalid schema, or forbidden fields', async () => {
      const user = await createAccount('malformed_output_user');
      const session = await createStartedSession(user.token, { questionCount: 2 });
      const questionId = session.questions[0].questionId;

      // 1. Unparseable plain text from model
      mockProviderOutput = 'Not JSON at all! Just raw conversational rambling.';
      const resRaw = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Candidate answer discussing Node streams.' },
        },
      );
      assert.equal(resRaw.status, 502);
      assert.equal(resRaw.body.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);

      let dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.attemptCount, 0);
      assert.equal(dbSession.questions[0].answer, null);

      // 2. Missing required dimensions
      mockProviderOutput = {
        dimensions: { accuracy: 0.9 }, // Missing depth, clarity, relevance
        feedback: 'Good answer but incomplete schema.',
      };
      const resMissing = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Candidate answer discussing Node streams.' },
        },
      );
      assert.equal(resMissing.status, 502);
      assert.equal(resMissing.body.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);

      dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.attemptCount, 0);
      assert.equal(dbSession.questions[0].answer, null);

      // 3. Forbidden security fields
      mockProviderOutput = {
        dimensions: { accuracy: 0.9, depth: 0.9, clarity: 0.9, relevance: 0.9 },
        feedback: 'Candidate answer is valid.',
        verified: true, // Forbidden security field
      };
      const resForbidden = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Candidate answer discussing Node streams.' },
        },
      );
      assert.equal(resForbidden.status, 502);
      assert.equal(resForbidden.body.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);

      dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.attemptCount, 0);
      assert.equal(dbSession.questions[0].answer, null);

      // 4. Now provide a clean valid model response: retry succeeds cleanly
      mockProviderOutput = {
        dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.95 },
        feedback: 'Candidate answer demonstrates clear mastery of streams and backpressure.',
        strengths: ['Clear explanation of pipe and highWaterMark'],
        growthAreas: ['Could elaborate on pipeline error handling'],
        groundedSkills: ['Node.js'],
      };

      const resSuccess = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Candidate answer discussing Node streams.' },
        },
      );
      assert.equal(resSuccess.status, 200);
      assert.equal(resSuccess.body.data.evaluatedQuestion.questionId, questionId);

      const finalSession = await InterviewSession.findById(session.id).lean();
      assert.equal(finalSession.attemptCount, 1);
      assert.ok(finalSession.questions[0].evaluation);
    });
  });

  describe('5. Client Disconnect / AbortSignal Isolation', () => {
    it('leaves session in_progress and question open when client cancels request mid-flight', async () => {
      const user = await createAccount('abort_user');
      const session = await createStartedSession(user.token, { questionCount: 2 });
      const questionId = session.questions[0].questionId;

      const controller = new AbortController();
      controller.abort();

      await assert.rejects(
        () =>
          submitQuestionAnswer(
            user.userId,
            session.id,
            questionId,
            { answerText: 'Valid candidate answer before client disconnect.' },
            { signal: controller.signal },
          ),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(error.message, /cancelled by client/i);
          return true;
        },
      );

      // Session document untouched in DB
      const dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.status, SESSION_STATUS.IN_PROGRESS);
      assert.equal(dbSession.attemptCount, 0);
      assert.equal(dbSession.questions[0].answer, null);

      // Subsequent submission without abort completes successfully
      const successResult = await submitQuestionAnswer(
        user.userId,
        session.id,
        questionId,
        { answerText: 'Valid candidate answer after reconnecting.' },
      );
      assert.ok(successResult.evaluatedQuestion);
      assert.equal(successResult.evaluatedQuestion.questionId, questionId);
    });
  });

  describe('6. Multi-Question Session Isolation & Partial Evaluation Preservation', () => {
    it('preserves prior question evaluations when a subsequent question evaluation fails, allows retry, and completes', async () => {
      const user = await createAccount('multi_question_user');
      const session = await createStartedSession(user.token, { questionCount: 3 });
      const [q0, q1, q2] = session.questions;

      // Question 0: Successfully answered
      mockProviderOutput = {
        dimensions: { accuracy: 0.85, depth: 0.85, clarity: 0.85, relevance: 0.85 },
        feedback: 'Solid answer for question 0.',
        strengths: ['Good foundational knowledge'],
        growthAreas: ['None'],
        groundedSkills: ['Node.js'],
      };

      const resQ0 = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${q0.questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Detailed answer for question 0.' },
        },
      );
      assert.equal(resQ0.status, 200);

      // Question 1: Fails due to 503 provider network outage
      mockProviderError = new Error('Transient 503 provider connection dropped.');
      const resQ1Failed = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${q1.questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Detailed answer for question 1.' },
        },
      );
      assert.equal(resQ1Failed.status, 503);

      // Inspect DB session: Q0 is completely preserved, Q1 is untouched, attemptCount is 1
      let dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.status, SESSION_STATUS.IN_PROGRESS);
      assert.equal(dbSession.attemptCount, 1);
      assert.equal(dbSession.currentQuestionIndex, 1);
      assert.ok(dbSession.questions[0].evaluation);
      assert.equal(dbSession.questions[0].evaluation.compositeScore, 0.85);
      assert.equal(dbSession.questions[1].answer, null);
      assert.equal(dbSession.questions[1].evaluation, null);

      // Question 1: Second attempt fails due to 502 malformed response
      mockProviderError = null;
      mockProviderOutput = 'MALFORMED NON-JSON RESPONSE';
      const resQ1Malformed = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${q1.questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Detailed answer for question 1.' },
        },
      );
      assert.equal(resQ1Malformed.status, 502);

      // Inspect DB session: Q0 is STILL preserved, attemptCount is STILL 1
      dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.attemptCount, 1);
      assert.equal(dbSession.questions[0].evaluation.compositeScore, 0.85);
      assert.equal(dbSession.questions[1].answer, null);

      // Question 1: Third attempt succeeds
      mockProviderOutput = {
        dimensions: { accuracy: 0.90, depth: 0.90, clarity: 0.90, relevance: 0.90 },
        feedback: 'Excellent answer for question 1.',
        strengths: ['Great deep dive'],
        growthAreas: ['None'],
        groundedSkills: ['Node.js'],
      };
      const resQ1Success = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${q1.questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Detailed answer for question 1.' },
        },
      );
      assert.equal(resQ1Success.status, 200);

      // Question 2: Successfully answered
      mockProviderOutput = {
        dimensions: { accuracy: 0.80, depth: 0.80, clarity: 0.80, relevance: 0.80 },
        feedback: 'Good answer for question 2.',
        strengths: ['Good practical knowledge'],
        growthAreas: ['None'],
        groundedSkills: ['MongoDB'],
      };
      const resQ2 = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${q2.questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Detailed answer for question 2.' },
        },
      );
      assert.equal(resQ2.status, 200);

      // Complete session
      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        {
          method: 'POST',
          token: user.token,
        },
      );
      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.data.session.status, SESSION_STATUS.COMPLETED);

      // Overall score = (0.85 + 0.90 + 0.80) / 3 = 0.85
      assert.equal(completeRes.body.data.session.overallScore, 0.85);

      const finalDbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(finalDbSession.status, SESSION_STATUS.COMPLETED);
      assert.equal(finalDbSession.attemptCount, 3);
      assert.equal(finalDbSession.overallScore, 0.85);
    });
  });
});
