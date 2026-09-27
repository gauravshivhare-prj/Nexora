import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  INTERVIEW_DIFFICULTY,
  INTERVIEW_LIMITS,
  INTERVIEW_PASS_MARK,
  SESSION_STATUS,
} from '../src/domain/interview/interviewContract.js';
import { InterviewSession } from '../src/models/InterviewSession.model.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import {
  clearInterviewSessions,
  clearSkillEvidenceChecks,
  clearUsers,
  postJson,
  resetRateLimiters,
  resolveTestDatabaseUri,
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
  resolveInterviewError,
  toInterviewEvaluation,
  toInterviewQuestion,
  toInterviewSession,
} from '../../client/src/services/interview.service.js';

const PASSWORD = 'ValidPassword123!';
let counter = 0;

describe('TASK R24 — Provider Failure UX Behavior & Fake-Success Prevention Suite', () => {
  let server;
  let providerCallCount = 0;
  let mockProviderError = null;
  let mockProviderDelayMs = 0;
  let mockProviderOutput = null;

  before(async () => {
    // Assert strictly isolated test database
    const uri = resolveTestDatabaseUri();
    const dbName = new URL(uri).pathname.replace(/^\//, '');
    assert.equal(
      dbName,
      'nexora_radhika_r24_test',
      `Test must run against isolated database nexora_radhika_r24_test, got: ${dbName}`,
    );

    server = await startTestServer();

    registerAiProvider({
      name: 'provider-failure-ux-mock',
      async complete(request) {
        providerCallCount += 1;

        if (mockProviderDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, mockProviderDelayMs));
        }

        if (mockProviderError) {
          throw mockProviderError;
        }

        if (mockProviderOutput) {
          return {
            text:
              typeof mockProviderOutput === 'string'
                ? mockProviderOutput
                : JSON.stringify(mockProviderOutput),
            model: 'gemini-2.0-flash',
          };
        }

        return {
          text: JSON.stringify({
            dimensions: {
              accuracy: 0.90,
              depth: 0.85,
              clarity: 0.85,
              relevance: 0.90,
            },
            feedback: 'Solid, precise breakdown of event loop phases and microtasks.',
            strengths: ['Identified key phases', 'Accurate microtask drain point'],
            growthAreas: ['Mention libuv threadpool in detail'],
            groundedSkills: ['Node.js'],
          }),
          model: 'gemini-2.0-flash',
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
    await clearSkillEvidenceChecks();
    await clearUsers();
    resetRateLimiters();

    useAiProvider('provider-failure-ux-mock');
    providerCallCount = 0;
    mockProviderError = null;
    mockProviderDelayMs = 0;
    mockProviderOutput = null;
  });

  async function createAccount(label) {
    counter += 1;
    const email = `r24_${label}_${Date.now()}_${counter}@example.com`;
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
      token: loginRes.body.data.token,
      userId: loginRes.body.data.user.id,
      email,
    };
  }

  async function createStartedSession(token, { questionCount = 2 } = {}) {
    const createRes = await sendJsonWithToken(
      server.baseUrl,
      '/api/interviews/sessions',
      {
        method: 'POST',
        token,
        payload: {
          targetRole: 'Backend Developer',
          targetSkills: ['Node.js', 'MongoDB'],
          difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
          questionCount,
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

  // =========================================================================
  // 1. Upstream AI Provider Rate Limit (429) & Outage (503)
  // =========================================================================
  describe('1. Upstream Provider Rate Limit (429) & Outage (503) Isolation', () => {
    it('never records fake evaluation in database when upstream provider returns 429 quota exhaustion', async () => {
      const student = await createAccount('upstream_429_student');
      const session = await createStartedSession(student.token, { questionCount: 2 });
      const questionId = session.questions[0].questionId;

      // Simulate upstream provider rate limit error (HTTP 429 Resource Exhausted)
      const quotaError = Object.assign(
        new Error('Gemini API error (HTTP 429): Quota exceeded for quota metric "Generate Content API requests"'),
        { status: 429, reason: 'http' },
      );
      mockProviderError = quotaError;

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: {
            answerText: 'The Node.js event loop coordinates timers, poll, and check phases.',
          },
        },
      );

      // Verify server returns safe 503 AI_PROVIDER_FAILED without exposing internal keys or quota text
      assert.equal(res.status, 503);
      assert.equal(res.body.success, false);
      assert.equal(res.body.errorCode, ERROR_CODES.AI_PROVIDER_FAILED);
      assert.ok(!JSON.stringify(res.body).includes('Quota exceeded'));

      // Crucial: Verify database session state in MongoDB has ZERO fake evaluations
      const dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.status, SESSION_STATUS.IN_PROGRESS);
      assert.equal(dbSession.attemptCount, 0, 'Attempt count must not increment on provider failure');
      assert.equal(dbSession.currentQuestionIndex, 0, 'Question must not advance on provider failure');
      assert.equal(dbSession.questions[0].answer, null, 'Answer must remain null in DB');
      assert.equal(dbSession.questions[0].evaluation, null, 'Evaluation must remain strictly null in DB');

      // Crucial: Verify frontend error resolver formats retryable error presentation
      const uiError = resolveInterviewError(res.body);
      assert.equal(uiError.code, ERROR_CODES.AI_PROVIDER_FAILED);
      assert.equal(uiError.title, 'Service Interruption');
      assert.equal(uiError.retryable, true);
      assert.equal(uiError.userAction, 'You can retry submitting your answer without penalty.');

      // Restore provider and verify immediate successful evaluation
      mockProviderError = null;
      const retryRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: {
            answerText: 'The Node.js event loop coordinates timers, poll, and check phases.',
          },
        },
      );
      assert.equal(retryRes.status, 200);
      assert.ok(retryRes.body.data.evaluatedQuestion.evaluation);
      assert.equal(retryRes.body.data.evaluatedQuestion.evaluation.compositeScore, 0.875);

      const updatedDb = await InterviewSession.findById(session.id).lean();
      assert.equal(updatedDb.attemptCount, 1);
      assert.ok(updatedDb.questions[0].evaluation);
    });

    it('never records fake evaluation when provider times out or throws network disconnect', async () => {
      const student = await createAccount('timeout_student');
      const session = await createStartedSession(student.token, { questionCount: 2 });
      const questionId = session.questions[0].questionId;

      mockProviderError = Object.assign(new Error('Fetch network timeout to generativelanguage.googleapis.com'), {
        name: 'TimeoutError',
        reason: 'timeout',
      });

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: {
            answerText: 'Explanation of asynchronous non-blocking event loop execution.',
          },
        },
      );

      assert.equal(res.status, 503);
      assert.equal(res.body.errorCode, ERROR_CODES.AI_PROVIDER_FAILED);

      const dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.questions[0].evaluation, null);
      assert.equal(dbSession.attemptCount, 0);

      const uiError = resolveInterviewError(res.body);
      assert.equal(uiError.retryable, true);
      assert.equal(uiError.title, 'Service Interruption');
    });
  });

  // =========================================================================
  // 2. Nexora Route Rate Limit (HTTP 429) UX & State Integrity
  // =========================================================================
  describe('2. Nexora Route Rate Limit (HTTP 429) UX & State Integrity', () => {
    it('preserves clean state and resolves 429 to Too Many Requests with retryable action', async () => {
      const student = await createAccount('route_429_student');
      const session = await createStartedSession(student.token, { questionCount: 3 });
      const q0Id = session.questions[0].questionId;

      // Exhaust evaluation limiter (10 allowed per hour)
      for (let i = 0; i < 10; i += 1) {
        await sendJsonWithToken(
          server.baseUrl,
          `/api/interviews/sessions/${session.id}/questions/${q0Id}/answers`,
          {
            method: 'POST',
            token: student.token,
            payload: { answerText: `Valid attempt response text ${i + 1}.` },
          },
        );
      }

      // 11th request triggers HTTP 429
      const rateLimitedRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${q0Id}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'This submission exceeds the 10/hr rate limit.' },
        },
      );

      assert.equal(rateLimitedRes.status, 429);
      assert.equal(rateLimitedRes.body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);

      // Verify DB question 1 was not modified or corrupted with fake score
      const dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.questions[1].answer, null);
      assert.equal(dbSession.questions[1].evaluation, null);

      // Verify UI error resolver formats 429 into friendly, actionable presentation
      const uiError = resolveInterviewError(rateLimitedRes.body);
      assert.equal(uiError.code, 'RATE_LIMIT_EXCEEDED');
      assert.equal(uiError.title, 'Too Many Requests');
      assert.equal(uiError.userAction, 'Please wait a moment before trying again.');
      assert.equal(uiError.retryable, true);
    });

    it('resolves raw HTTP 429 status code even if backend error payload lacks errorCode', () => {
      // Simulates reverse proxy or gateway returning bare 429
      const bare429Error = { status: 429, message: 'Too Many Requests from proxy' };
      const resolved = resolveInterviewError(bare429Error);

      assert.equal(resolved.code, 'RATE_LIMIT_EXCEEDED');
      assert.equal(resolved.title, 'Too Many Requests');
      assert.equal(resolved.retryable, true);
      assert.equal(resolved.status, 429);
      assert.equal(resolved.userAction, 'Please wait a moment before trying again.');
    });

    it('resolves raw HTTP 503 status code even if backend error payload lacks errorCode', () => {
      // Simulates reverse proxy returning bare 503
      const bare503Error = { status: 503, message: 'Service Unavailable from proxy' };
      const resolved = resolveInterviewError(bare503Error);

      assert.equal(resolved.code, 'AI_PROVIDER_FAILED');
      assert.equal(resolved.title, 'Service Interruption');
      assert.equal(resolved.retryable, true);
      assert.equal(resolved.status, 503);
      assert.equal(resolved.userAction, 'You can retry submitting your answer without penalty.');
    });
  });

  // =========================================================================
  // 3. Malformed Output (502) & Fake-Success UI Invariants
  // =========================================================================
  describe('3. Malformed Output (502) & Fake-Success UI Invariants', () => {
    it('rejects provider output missing required dimensions and never shows fake pass', async () => {
      const student = await createAccount('malformed_502_student');
      const session = await createStartedSession(student.token, { questionCount: 2 });
      const questionId = session.questions[0].questionId;

      // Model returns malformed JSON missing required dimensions
      mockProviderOutput = {
        score: 1.0, // Malformed: omitted "dimensions" object
        feedback: 'Incomplete response missing dimensions.',
      };

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Valid answer for testing malformed output handling.' },
        },
      );

      assert.equal(res.status, 502);
      assert.equal(res.body.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);

      // Verify DB question was NOT set to a fake success score
      const dbSession = await InterviewSession.findById(session.id).lean();
      assert.equal(dbSession.questions[0].evaluation, null);

      // UI error resolver treats 502 as retryable
      const uiError = resolveInterviewError(res.body);
      assert.equal(uiError.code, 'AI_OUTPUT_INVALID');
      assert.equal(uiError.title, 'Evaluation Retry Needed');
      assert.equal(uiError.retryable, true);
    });

    it('ensures toInterviewQuestion normalizes null evaluation cleanly without generating default scores', () => {
      const rawQuestion = {
        questionId: 'iq-test-01',
        order: 1,
        type: 'conceptual',
        prompt: 'Explain Node.js event loop.',
        targetSkill: 'Node.js',
        answer: null,
        evaluation: null,
      };

      const normalized = toInterviewQuestion(rawQuestion);
      assert.equal(normalized.evaluation, null);
      assert.equal(normalized.answer, null);
    });

    it('ensures cannot complete session when questions failed evaluation', async () => {
      const student = await createAccount('uncompleted_fail_student');
      const session = await createStartedSession(student.token, { questionCount: 2 });

      // Calling complete on session where 0 questions have succeeded
      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        {
          method: 'POST',
          token: student.token,
          payload: {},
        },
      );

      assert.equal(completeRes.status, 400);
      assert.equal(completeRes.body.errorCode, ERROR_CODES.BAD_REQUEST);
      assert.match(completeRes.body.message, /no questions have been evaluated yet/i);

      // Zero evidence checks created in database
      const evidenceCount = await SkillEvidenceCheck.countDocuments({ user: student.userId });
      assert.equal(evidenceCount, 0, 'No evidence records should be generated for un-evaluated sessions');
    });
  });
});
