import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { RATE_LIMIT_POLICY } from '../src/constants/authPolicy.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  INTERVIEW_DIFFICULTY,
  INTERVIEW_LIMITS,
} from '../src/domain/interview/interviewContract.js';
import {
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
  clearInterviewSessions,
  clearUsers,
} from './helpers/testServer.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';

const PASSWORD = 'ValidPassword123!';
let counter = 0;

describe('TASK R12 — Rate-Limit and Abuse Protections Audit', () => {
  let server;
  let providerCallCount = 0;
  let mockProviderDelayMs = 0;
  let mockProviderError = null;

  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: 'rate-limit-test-provider',
      async complete(request) {
        providerCallCount += 1;

        if (mockProviderDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, mockProviderDelayMs));
        }

        if (mockProviderError) {
          throw mockProviderError;
        }

        return {
          text: JSON.stringify({
            dimensions: {
              accuracy: 0.88,
              depth: 0.82,
              clarity: 0.85,
              relevance: 0.90,
            },
            feedback: 'Sound architectural understanding of asynchronous event loops.',
            strengths: ['Identified microtask queue priority', 'Clear execution flow'],
            growthAreas: ['Mention libuv thread pool edge cases'],
            groundedSkills: ['Node.js'],
          }),
          model: 'mock-evaluator-r12',
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

    useAiProvider('rate-limit-test-provider');
    providerCallCount = 0;
    mockProviderDelayMs = 0;
    mockProviderError = null;
  });

  async function createAccount(label) {
    counter += 1;
    const email = `ratelimit_${label}_${Date.now()}_${counter}@example.com`;
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
      email,
    };
  }

  async function createSession(token, overrides = {}) {
    return sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
      method: 'POST',
      token,
      payload: {
        targetRole: 'Backend Developer',
        targetSkills: ['Node.js', 'MongoDB'],
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        questionCount: 3,
        ...overrides,
      },
    });
  }

  async function startSession(token, sessionId) {
    return sendWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${sessionId}/start`,
      { method: 'POST', token },
    );
  }

  async function submitAnswer(token, sessionId, questionId, payload = {}) {
    return sendJsonWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
      {
        method: 'POST',
        token,
        payload: {
          answerText: 'In Node.js, the event loop handles non-blocking I/O operations through phases.',
          durationSeconds: 45,
          ...payload,
        },
      },
    );
  }

  // =========================================================================
  // 1. Session Creation Rate Limiting (sessionWriteLimiter)
  // =========================================================================
  describe('Session Write Rate Limiting', () => {
    it('enforces RATE_LIMIT_POLICY.interviewSession.maxAttempts and returns 429 with Retry-After on 61st', async () => {
      const user = await createAccount('session_rate');
      const maxAttempts = RATE_LIMIT_POLICY.interviewSession.maxAttempts; // 60

      // Fire maxAttempts creations
      for (let i = 0; i < maxAttempts; i++) {
        const res = await createSession(user.token);
        assert.equal(res.status, 201, `Expected 201 on session creation #${i + 1}`);
      }

      // 61st attempt should be rate limited
      const blockedRes = await createSession(user.token);
      assert.equal(blockedRes.status, 429, 'Expected 429 on exceeding session write limit');
      assert.equal(blockedRes.body.success, false);
      assert.equal(blockedRes.body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);
      assert.ok(
        blockedRes.headers.get('retry-after') != null,
        'Expected Retry-After header to be present on 429',
      );
      const retryAfter = Number(blockedRes.headers.get('retry-after'));
      assert.ok(Number.isInteger(retryAfter) && retryAfter > 0, 'Retry-After must be positive integer');
    });

    it('isolates session rate limits per user so one user hitting 429 does not affect another', async () => {
      const userA = await createAccount('user_a_rate');
      const userB = await createAccount('user_b_rate');
      const maxAttempts = RATE_LIMIT_POLICY.interviewSession.maxAttempts;

      for (let i = 0; i < maxAttempts; i++) {
        await createSession(userA.token);
      }

      const blockedA = await createSession(userA.token);
      assert.equal(blockedA.status, 429, 'User A should be rate-limited');

      // User B should still be able to create a session
      const resB = await createSession(userB.token);
      assert.equal(resB.status, 201, 'User B should not be affected by User A rate limit');
    });
  });

  // =========================================================================
  // 2. Answer Evaluation Rate Limiting (evaluationLimiter)
  // =========================================================================
  describe('Answer Evaluation Rate Limiting', () => {
    it('enforces RATE_LIMIT_POLICY.aiAnalysis.maxAttempts and returns 429 with Retry-After on 11th', async () => {
      const user = await createAccount('eval_rate');
      const maxAttempts = RATE_LIMIT_POLICY.aiAnalysis.maxAttempts; // 10

      // We need sessions with questions to evaluate
      // Create 4 sessions with 3 questions each = 12 questions available
      const sessions = [];
      for (let s = 0; s < 4; s++) {
        const createRes = await createSession(user.token);
        assert.equal(createRes.status, 201);
        const sess = createRes.body.data.session;
        await startSession(user.token, sess.id);
        sessions.push(sess);
      }

      let submitted = 0;
      for (const sess of sessions) {
        for (const q of sess.questions) {
          if (submitted >= maxAttempts) break;
          const res = await submitAnswer(user.token, sess.id, q.questionId, {
            answerText: `Thorough answer for question ${q.questionId} attempt.`,
          });
          assert.equal(res.status, 200, `Answer #${submitted + 1} should succeed`);
          submitted++;
        }
        if (submitted >= maxAttempts) break;
      }

      assert.equal(submitted, maxAttempts, 'Should have submitted maxAttempts answers');

      // 11th evaluation attempt
      const targetSession = sessions[3];
      const targetQuestion = targetSession.questions[2];
      const blockedRes = await submitAnswer(user.token, targetSession.id, targetQuestion.questionId, {
        answerText: 'Eleventh evaluation attempt should exceed rate limit.',
      });

      assert.equal(blockedRes.status, 429, 'Expected 429 on exceeding AI evaluation rate limit');
      assert.equal(blockedRes.body.success, false);
      assert.equal(blockedRes.body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);
      assert.ok(blockedRes.headers.get('retry-after') != null, 'Expected Retry-After header');
      const retryAfter = Number(blockedRes.headers.get('retry-after'));
      assert.ok(Number.isInteger(retryAfter) && retryAfter > 0);
    });

    it('isolates evaluation rate limits between users', async () => {
      const userA = await createAccount('eval_iso_a');
      const userB = await createAccount('eval_iso_b');
      const maxAttempts = RATE_LIMIT_POLICY.aiAnalysis.maxAttempts; // 10

      // Create sessions for User A
      const sessionsA = [];
      for (let s = 0; s < 4; s++) {
        const res = await createSession(userA.token);
        const sess = res.body.data.session;
        await startSession(userA.token, sess.id);
        sessionsA.push(sess);
      }

      let countA = 0;
      for (const sess of sessionsA) {
        for (const q of sess.questions) {
          if (countA >= maxAttempts) break;
          await submitAnswer(userA.token, sess.id, q.questionId);
          countA++;
        }
      }

      // User A is now rate-limited on evaluation
      const blockedA = await submitAnswer(
        userA.token,
        sessionsA[3].id,
        sessionsA[3].questions[2].questionId,
      );
      assert.equal(blockedA.status, 429, 'User A should be blocked on evaluations');

      // User B should be able to create a session and submit an answer
      const createB = await createSession(userB.token);
      assert.equal(createB.status, 201);
      const sessB = createB.body.data.session;
      await startSession(userB.token, sessB.id);

      const resB = await submitAnswer(userB.token, sessB.id, sessB.questions[0].questionId);
      assert.equal(resB.status, 200, 'User B should evaluate successfully despite User A 429');
    });

    it('maintains limiter independence: reaching evaluation limit does not block reading sessions', async () => {
      const user = await createAccount('eval_indep');
      const maxAttempts = RATE_LIMIT_POLICY.aiAnalysis.maxAttempts;

      const sessions = [];
      for (let s = 0; s < 4; s++) {
        const res = await createSession(user.token);
        const sess = res.body.data.session;
        await startSession(user.token, sess.id);
        sessions.push(sess);
      }

      let count = 0;
      for (const sess of sessions) {
        for (const q of sess.questions) {
          if (count >= maxAttempts) break;
          await submitAnswer(user.token, sess.id, q.questionId);
          count++;
        }
      }

      // User is rate-limited on evaluation
      const blockedEval = await submitAnswer(
        user.token,
        sessions[3].id,
        sessions[3].questions[2].questionId,
      );
      assert.equal(blockedEval.status, 429);

      // But GET /api/interviews/sessions is unthrottled and succeeds
      const listRes = await sendWithToken(
        server.baseUrl,
        '/api/interviews/sessions',
        { method: 'GET', token: user.token },
      );
      assert.equal(listRes.status, 200, 'Session read must remain unthrottled');
      assert.equal(listRes.body.data.count, 4);

      // And GET /api/interviews/sessions/:id succeeds
      const getRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessions[0].id}`,
        { method: 'GET', token: user.token },
      );
      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.data.session.id, sessions[0].id);
    });
  });

  // =========================================================================
  // 3. Concurrency Lock & Double-Spend / Token Abuse Protection
  // =========================================================================
  describe('In-Flight Evaluation Concurrency Lock', () => {
    it('rejects concurrent duplicate evaluation with 409 CONFLICT and prevents redundant AI provider calls', async () => {
      const user = await createAccount('concurrency_user');
      const createRes = await createSession(user.token);
      const session = createRes.body.data.session;
      await startSession(user.token, session.id);
      const questionId = session.questions[0].questionId;

      // Introduce artificial delay in provider so first request stays in-flight
      mockProviderDelayMs = 150;

      // Fire two concurrent requests for the exact same question
      const promise1 = submitAnswer(user.token, session.id, questionId, {
        answerText: 'First concurrent answer explaining JavaScript microtasks.',
      });
      const promise2 = submitAnswer(user.token, session.id, questionId, {
        answerText: 'Second concurrent answer attempting to race the evaluation.',
      });

      const [res1, res2] = await Promise.all([promise1, promise2]);

      // One request should succeed (200) and the other should be rejected with 409 CONFLICT
      const statuses = [res1.status, res2.status].sort();
      assert.deepEqual(
        statuses,
        [200, 409],
        `Expected exactly one 200 and one 409, got ${res1.status} and ${res2.status}`,
      );

      const conflictRes = res1.status === 409 ? res1 : res2;
      assert.equal(conflictRes.body.success, false);
      assert.equal(conflictRes.body.errorCode, ERROR_CODES.CONFLICT);
      assert.match(
        conflictRes.body.message,
        /already in progress|already been submitted/i,
      );

      // Crucial: Provider must have been called only once, preventing token double-spend
      assert.equal(
        providerCallCount,
        1,
        `Expected provider to be called exactly 1 time, but was called ${providerCallCount} times`,
      );
    });

    it('releases in-flight lock after evaluation so future actions do not remain stuck', async () => {
      const user = await createAccount('lock_release_user');
      const createRes = await createSession(user.token);
      const session = createRes.body.data.session;
      await startSession(user.token, session.id);
      const questionId = session.questions[0].questionId;

      // First submission completes
      const res1 = await submitAnswer(user.token, session.id, questionId, {
        answerText: 'Answer that completes and releases lock cleanly.',
      });
      assert.equal(res1.status, 200);

      // Next question can be answered cleanly
      const q2Id = session.questions[1].questionId;
      const res2 = await submitAnswer(user.token, session.id, q2Id, {
        answerText: 'Answer for question 2 proceeds without lock collision.',
      });
      assert.equal(res2.status, 200);
    });
  });

  // =========================================================================
  // 4. Input Bounding and Abuse Prevention
  // =========================================================================
  describe('Input Bounding and Abuse Protections', () => {
    it('rejects oversized answer text (> 5000 chars) with 400 Bad Request before calling AI provider', async () => {
      const user = await createAccount('oversized_answer');
      const createRes = await createSession(user.token);
      const session = createRes.body.data.session;
      await startSession(user.token, session.id);
      const questionId = session.questions[0].questionId;

      const oversizedText = 'A'.repeat(INTERVIEW_LIMITS.studentAnswer.max + 1);
      const res = await submitAnswer(user.token, session.id, questionId, {
        answerText: oversizedText,
      });

      assert.equal(res.status, 400, 'Expected 400 on oversized answer');
      assert.equal(res.body.errorCode, ERROR_CODES.BAD_REQUEST);
      assert.match(res.body.message, /exceeds maximum length/i);
      assert.equal(providerCallCount, 0, 'AI provider must not be invoked for oversized answers');
    });

    it('rejects too short answer text (< 5 chars) with 400 Bad Request before calling AI provider', async () => {
      const user = await createAccount('short_answer');
      const createRes = await createSession(user.token);
      const session = createRes.body.data.session;
      await startSession(user.token, session.id);
      const questionId = session.questions[0].questionId;

      const res = await submitAnswer(user.token, session.id, questionId, {
        answerText: 'tiny',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.BAD_REQUEST);
      assert.match(res.body.message, /at least 5 characters/i);
      assert.equal(providerCallCount, 0, 'AI provider must not be invoked for short answers');
    });

    it('safely clamps excessive durationSeconds to maxTimePerQuestionSeconds', async () => {
      const user = await createAccount('clamped_duration');
      const createRes = await createSession(user.token);
      const session = createRes.body.data.session;
      await startSession(user.token, session.id);
      const questionId = session.questions[0].questionId;

      const res = await submitAnswer(user.token, session.id, questionId, {
        answerText: 'Answer with huge durationSeconds value.',
        durationSeconds: 999999,
      });

      assert.equal(res.status, 200);
      assert.equal(
        res.body.data.evaluatedQuestion.answer.durationSeconds,
        INTERVIEW_LIMITS.maxTimePerQuestionSeconds,
        `Expected durationSeconds to be clamped to ${INTERVIEW_LIMITS.maxTimePerQuestionSeconds}`,
      );
    });

    it('rejects session creation with targetSkills exceeding maxTargetSkills (5)', async () => {
      const user = await createAccount('max_skills');
      const res = await createSession(user.token, {
        targetSkills: ['Node.js', 'MongoDB', 'PostgreSQL', 'Docker', 'Redis', 'GraphQL'],
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.BAD_REQUEST);
      assert.match(res.body.message, /cannot exceed 5 skills/i);
    });
  });
});
