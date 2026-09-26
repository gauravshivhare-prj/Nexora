import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { RATE_LIMIT_POLICY } from '../src/constants/authPolicy.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  INTERVIEW_DIFFICULTY,
  SESSION_STATUS,
} from '../src/domain/interview/interviewContract.js';
import { InterviewSession } from '../src/models/InterviewSession.model.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import {
  clearInterviewSessions,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';

const PASSWORD = 'Str0ngPassphrase';

describe('R8 — Interview API & Ownership Suite', () => {
  let server;
  let counter = 0;
  let mockEvaluationResponse;
  let mockProviderFailure = null;

  before(async () => {
    server = await startTestServer();

    // Register a controllable mock AI provider for answer evaluations
    registerAiProvider({
      name: 'test-interview-evaluator',
      async complete(request) {
        if (mockProviderFailure) {
          throw mockProviderFailure;
        }
        return {
          text: JSON.stringify(mockEvaluationResponse),
          model: 'mock-evaluator-v1',
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

    useAiProvider('test-interview-evaluator');
    mockProviderFailure = null;
    mockEvaluationResponse = {
      dimensions: {
        accuracy: 0.88,
        depth: 0.82,
        clarity: 0.85,
        relevance: 0.90,
      },
      feedback: 'Good explanation of concepts with sound architectural grounding.',
      strengths: ['Clear terminology', 'Addresses question constraints'],
      growthAreas: ['Provide specific code edge cases'],
      groundedSkills: ['Node.js'],
    };
  });

  async function createAccount(label) {
    counter += 1;
    const email = `interview.${label}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: `User ${label}`,
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return {
      token: body.data.token,
      userId: body.data.user.id,
      email,
    };
  }

  async function createTestSession(token, overrides = {}) {
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

  // =========================================================================
  // 1. Authentication Enforcement on Every Resource
  // =========================================================================
  describe('1. Authentication Enforcement', () => {
    const dummyId = '507f1f77bcf86cd799439011';
    const dummyQuestionId = 'iq-node-001';

    it('rejects unauthenticated requests to all interview endpoints with 401', async () => {
      const endpoints = [
        { method: 'GET', path: '/api/interviews/sessions' },
        { method: 'POST', path: '/api/interviews/sessions', payload: {} },
        { method: 'GET', path: `/api/interviews/sessions/${dummyId}` },
        { method: 'POST', path: `/api/interviews/sessions/${dummyId}/start` },
        {
          method: 'POST',
          path: `/api/interviews/sessions/${dummyId}/questions/${dummyQuestionId}/answers`,
          payload: { answerText: 'Test answer text' },
        },
        { method: 'POST', path: `/api/interviews/sessions/${dummyId}/complete` },
        { method: 'POST', path: `/api/interviews/sessions/${dummyId}/abandon` },
      ];

      for (const endpoint of endpoints) {
        let res;
        if (endpoint.payload) {
          res = await sendJsonWithToken(server.baseUrl, endpoint.path, {
            method: endpoint.method,
            payload: endpoint.payload,
          });
        } else {
          res = await sendWithToken(server.baseUrl, endpoint.path, {
            method: endpoint.method,
          });
        }

        assert.equal(
          res.status,
          401,
          `Expected 401 for ${endpoint.method} ${endpoint.path} without token, got ${res.status}`,
        );
        assert.equal(res.body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
      }
    });

    it('rejects invalid or forged tokens with 401 AUTH_TOKEN_INVALID', async () => {
      const res = await getWithToken(server.baseUrl, '/api/interviews/sessions', 'forged.invalid.token');
      assert.equal(res.status, 401);
      assert.equal(res.body.errorCode, ERROR_CODES.AUTH_TOKEN_INVALID);
    });
  });

  // =========================================================================
  // 2. Session Creation & Scoped Listing
  // =========================================================================
  describe('2. Session Creation & Scoped Listing', () => {
    it('creates an initialized interview session with public DTO', async () => {
      const user = await createAccount('creator');
      const res = await createTestSession(user.token);

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      const session = res.body.data.session;

      assert.ok(session.id);
      assert.equal(session.status, SESSION_STATUS.INITIALIZED);
      assert.equal(session.targetRole, 'Backend Developer');
      assert.deepEqual(session.targetSkills, ['Node.js', 'MongoDB']);
      assert.equal(session.difficulty, INTERVIEW_DIFFICULTY.INTERMEDIATE);
      assert.ok(Array.isArray(session.questions));
      assert.equal(session.questions.length, 3);
      assert.equal(session.currentQuestionIndex, 0);

      // Verify privacy & security: no user ID or Mongo internals exposed
      const serialised = JSON.stringify(res.body);
      assert.ok(!serialised.includes('"user"'), 'response leaked user ID');
      assert.ok(!serialised.includes('"_id"'), 'response leaked _id');
      assert.ok(!serialised.includes('"__v"'), 'response leaked version key');
    });

    it('lists only sessions belonging to the authenticated student', async () => {
      const userA = await createAccount('alice');
      const userB = await createAccount('bob');

      // User A creates two sessions
      const resA1 = await createTestSession(userA.token);
      const resA2 = await createTestSession(userA.token);
      assert.equal(resA1.status, 201);
      assert.equal(resA2.status, 201);

      // User B creates one session
      const resB1 = await createTestSession(userB.token);
      assert.equal(resB1.status, 201);

      // Alice lists her sessions: should see exactly 2
      const listA = await getWithToken(server.baseUrl, '/api/interviews/sessions', userA.token);
      assert.equal(listA.status, 200);
      assert.equal(listA.body.data.count, 2);
      const idsA = listA.body.data.sessions.map((s) => s.id);
      assert.ok(idsA.includes(resA1.body.data.session.id));
      assert.ok(idsA.includes(resA2.body.data.session.id));
      assert.ok(!idsA.includes(resB1.body.data.session.id));

      // Bob lists his sessions: should see exactly 1
      const listB = await getWithToken(server.baseUrl, '/api/interviews/sessions', userB.token);
      assert.equal(listB.status, 200);
      assert.equal(listB.body.data.count, 1);
      assert.equal(listB.body.data.sessions[0].id, resB1.body.data.session.id);
    });

    it('returns empty list for a student with no sessions', async () => {
      const user = await createAccount('newbie');
      const list = await getWithToken(server.baseUrl, '/api/interviews/sessions', user.token);
      assert.equal(list.status, 200);
      assert.equal(list.body.data.count, 0);
      assert.deepEqual(list.body.data.sessions, []);
    });
  });

  // =========================================================================
  // 3. IDOR Defense & Cross-User Protection
  // =========================================================================
  describe('3. IDOR Defense & Cross-User Protection', () => {
    it('prevents User B from accessing or manipulating User A session at every endpoint', async () => {
      const alice = await createAccount('alice_idor');
      const bob = await createAccount('bob_idor');

      const createRes = await createTestSession(alice.token);
      assert.equal(createRes.status, 201);
      const aliceSessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      // 1. Bob tries to read Alice's session
      const getRes = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${aliceSessionId}`,
        bob.token,
      );
      assert.equal(getRes.status, 404);
      assert.equal(getRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);

      // 2. Bob tries to start Alice's session
      const startRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${aliceSessionId}/start`,
        { method: 'POST', token: bob.token },
      );
      assert.equal(startRes.status, 404);
      assert.equal(startRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);

      // 3. Alice starts her session
      const aliceStart = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${aliceSessionId}/start`,
        { method: 'POST', token: alice.token },
      );
      assert.equal(aliceStart.status, 200);

      // 4. Bob tries to submit an answer to Alice's session
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${aliceSessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: bob.token,
          payload: { answerText: 'Bob trying to answer Alice question.' },
        },
      );
      assert.equal(answerRes.status, 404);
      assert.equal(answerRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);

      // 5. Bob tries to complete Alice's session
      const completeRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${aliceSessionId}/complete`,
        { method: 'POST', token: bob.token },
      );
      assert.equal(completeRes.status, 404);
      assert.equal(completeRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);

      // 6. Bob tries to abandon Alice's session
      const abandonRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${aliceSessionId}/abandon`,
        { method: 'POST', token: bob.token },
      );
      assert.equal(abandonRes.status, 404);
      assert.equal(abandonRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);
    });

    it('returns indistinguishable 404 responses for another student’s session vs a non-existent session', async () => {
      const alice = await createAccount('alice_enum');
      const bob = await createAccount('bob_enum');

      const createRes = await createTestSession(alice.token);
      const aliceSessionId = createRes.body.data.session.id;
      const nonExistentSessionId = '507f1f77bcf86cd799439099';

      const otherStudentSessionRes = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${aliceSessionId}`,
        bob.token,
      );
      const nonExistentSessionRes = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${nonExistentSessionId}`,
        bob.token,
      );

      // Both must return identical status, error code, and message
      assert.equal(otherStudentSessionRes.status, 404);
      assert.equal(nonExistentSessionRes.status, 404);
      assert.equal(otherStudentSessionRes.body.errorCode, nonExistentSessionRes.body.errorCode);
      assert.equal(otherStudentSessionRes.body.message, nonExistentSessionRes.body.message);
      assert.equal(otherStudentSessionRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);
    });
  });

  // =========================================================================
  // 4. Missing Sessions & Resource Handling
  // =========================================================================
  describe('4. Missing Sessions & Resource Handling', () => {
    it('returns 404 INTERVIEW_SESSION_NOT_FOUND when session ID is not a valid ObjectId', async () => {
      const user = await createAccount('bad_id_user');
      const res = await getWithToken(
        server.baseUrl,
        '/api/interviews/sessions/not-a-valid-object-id',
        user.token,
      );

      assert.equal(res.status, 404);
      assert.equal(res.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);
    });

    it('returns 404 NOT_FOUND when submitting answer for a question not present in session', async () => {
      const user = await createAccount('missing_q_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;

      // Start the session
      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: user.token },
      );

      // Submit answer for non-existent question
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/non-existent-question-id/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Valid answer for non-existent question.' },
        },
      );

      assert.equal(answerRes.status, 404);
      assert.equal(answerRes.body.errorCode, ERROR_CODES.NOT_FOUND);
    });
  });

  // =========================================================================
  // 5. Lifecycle Transitions & State Progression
  // =========================================================================
  describe('5. Lifecycle Transitions & State Progression', () => {
    it('follows valid lifecycle progression initialized -> in_progress -> completed', async () => {
      const user = await createAccount('lifecycle_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;
      const question = createRes.body.data.session.questions[0];

      assert.equal(createRes.body.data.session.status, SESSION_STATUS.INITIALIZED);

      // 1. Start session
      const startRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: user.token },
      );
      assert.equal(startRes.status, 200);
      assert.equal(startRes.body.data.session.status, SESSION_STATUS.IN_PROGRESS);
      assert.ok(startRes.body.data.session.startedAt);

      // 2. Submit answer to question
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${question.questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: {
            answerText: 'Node.js uses an event-driven, non-blocking I/O model powered by libuv.',
            durationSeconds: 45,
          },
        },
      );
      assert.equal(answerRes.status, 200);
      assert.equal(answerRes.body.data.evaluatedQuestion.questionId, question.questionId);
      assert.equal(answerRes.body.data.evaluatedQuestion.answer.attemptNumber, 1);
      assert.ok(answerRes.body.data.evaluatedQuestion.evaluation.compositeScore > 0);

      // 3. Complete session
      const completeRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/complete`,
        { method: 'POST', token: user.token },
      );
      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.data.session.status, SESSION_STATUS.COMPLETED);
      assert.ok(completeRes.body.data.overallScore > 0);
      assert.ok(completeRes.body.data.session.completedAt);
    });

    it('rejects answer submission when session is in initialized status (not started)', async () => {
      const user = await createAccount('unstarted_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Attempting to answer before starting.' },
        },
      );

      assert.equal(answerRes.status, 400);
      assert.equal(answerRes.body.errorCode, ERROR_CODES.INTERVIEW_INVALID_STATE);
    });

    it('rejects completion when session is in initialized status', async () => {
      const user = await createAccount('unstarted_complete_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;

      const completeRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/complete`,
        { method: 'POST', token: user.token },
      );

      assert.equal(completeRes.status, 400);
      assert.equal(completeRes.body.errorCode, ERROR_CODES.INTERVIEW_INVALID_STATE);
    });

    it('rejects starting an already started session', async () => {
      const user = await createAccount('double_start_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;

      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: user.token },
      );

      const secondStart = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: user.token },
      );

      assert.equal(secondStart.status, 400);
      assert.equal(secondStart.body.errorCode, ERROR_CODES.INTERVIEW_INVALID_STATE);
    });

    it('allows abandoning an in_progress session, but rejects subsequent transitions', async () => {
      const user = await createAccount('abandon_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: user.token },
      );

      // Abandon session
      const abandonRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/abandon`,
        { method: 'POST', token: user.token },
      );
      assert.equal(abandonRes.status, 200);
      assert.equal(abandonRes.body.data.session.status, SESSION_STATUS.ABANDONED);

      // Re-abandoning rejected
      const reAbandon = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/abandon`,
        { method: 'POST', token: user.token },
      );
      assert.equal(reAbandon.status, 400);
      assert.equal(reAbandon.body.errorCode, ERROR_CODES.INTERVIEW_INVALID_STATE);

      // Answering an abandoned session rejected
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Answer to abandoned session' },
        },
      );
      assert.equal(answerRes.status, 400);
      assert.equal(answerRes.body.errorCode, ERROR_CODES.INTERVIEW_INVALID_STATE);
    });

    it('rejects starting or answering an expired session with INTERVIEW_SESSION_EXPIRED', async () => {
      const user = await createAccount('expired_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      // Force session expiration directly in MongoDB
      await InterviewSession.updateOne(
        { _id: sessionId },
        { $set: { expiresAt: new Date(Date.now() - 60000) } },
      );

      const startRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: user.token },
      );
      assert.equal(startRes.status, 400);
      assert.equal(startRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_EXPIRED);

      // Verify answering an expired/timed-out session rejects with INTERVIEW_SESSION_EXPIRED
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Answer to expired session' },
        },
      );
      assert.equal(answerRes.status, 400);
      assert.equal(answerRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_EXPIRED);

      // Verify GET on expired session returns timed_out status with completedAt
      const getRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}`,
        { method: 'GET', token: user.token },
      );
      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.data.session.status, SESSION_STATUS.TIMED_OUT);
      assert.ok(getRes.body.data.session.completedAt);
    });

    it('concurrent start requests allow exactly one transition to in_progress', async () => {
      const user = await createAccount('racing_start_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;

      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          sendWithToken(
            server.baseUrl,
            `/api/interviews/sessions/${sessionId}/start`,
            { method: 'POST', token: user.token },
          ),
        ),
      );

      const successful = responses.filter((r) => r.status === 200);
      const rejected = responses.filter((r) => r.status === 400);

      assert.equal(successful.length, 1);
      assert.equal(rejected.length, 3);
      for (const r of rejected) {
        assert.equal(r.body.errorCode, ERROR_CODES.INTERVIEW_INVALID_STATE);
      }
    });
  });

  // =========================================================================
  // 6. Duplicate Submission Protection
  // =========================================================================
  describe('6. Duplicate Submissions Protection', () => {
    it('rejects duplicate answer submissions when attempt limit is reached with 409 CONFLICT', async () => {
      const user = await createAccount('dup_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: user.token },
      );

      // First submission succeeds
      const firstRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: {
            answerText: 'First valid attempt explaining event loop phases.',
          },
        },
      );
      assert.equal(firstRes.status, 200);
      assert.equal(firstRes.body.data.evaluatedQuestion.answer.attemptNumber, 1);

      // Duplicate submission rejected with 409 CONFLICT
      const duplicateRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: {
            answerText: 'Second attempt trying to overwrite previous answer.',
          },
        },
      );
      assert.equal(duplicateRes.status, 409);
      assert.equal(duplicateRes.body.errorCode, ERROR_CODES.CONFLICT);
      assert.match(duplicateRes.body.message, /already been submitted/i);
    });
  });

  // =========================================================================
  // 7. Safe Error Handling & Input Validation
  // =========================================================================
  describe('7. Safe Error Handling & Input Validation', () => {
    it('rejects session creation with unrecognized career role', async () => {
      const user = await createAccount('bad_role_user');
      const res = await createTestSession(user.token, { targetRole: 'Astronaut Wizard' });

      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.CAREER_ROLE_NOT_FOUND);
    });

    it('rejects session creation with invalid target skill', async () => {
      const user = await createAccount('bad_skill_user');
      const res = await createTestSession(user.token, {
        targetSkills: ['Node.js', 'Quantum Teleportation 101'],
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.BAD_REQUEST);
    });

    it('rejects answer text that is too short (< 5 chars)', async () => {
      const user = await createAccount('short_answer_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: user.token },
      );

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'abc' },
        },
      );

      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.BAD_REQUEST);
      assert.match(res.body.message, /at least 5 characters/i);
    });

    it('fails safely with 503 AI_PROVIDER_FAILED on provider network error without leaking secrets', async () => {
      const user = await createAccount('provider_outage_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: user.token },
      );

      // Simulate provider outage with simulated credentials
      mockProviderFailure = new Error('Upstream provider connection timeout at endpoint 192.168.1.1:8080 with key AIzaSy_SECRET_KEY');

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Valid answer attempting evaluation during provider outage.' },
        },
      );

      assert.equal(res.status, 503);
      assert.equal(res.body.errorCode, ERROR_CODES.AI_PROVIDER_FAILED);

      // Verify no sensitive keys leaked
      const serialised = JSON.stringify(res.body);
      assert.ok(!serialised.includes('AIzaSy_SECRET_KEY'), 'response leaked simulated secret');
      assert.ok(!serialised.includes('192.168.1.1'), 'response leaked upstream IP');
    });

    it('fails safely with 502 AI_OUTPUT_INVALID when model returns invalid JSON', async () => {
      const user = await createAccount('bad_json_user');
      const createRes = await createTestSession(user.token);
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: user.token },
      );

      // Force invalid model output
      mockEvaluationResponse = 'Not JSON at all! Just raw plain text.';

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Valid candidate answer.' },
        },
      );

      assert.equal(res.status, 502);
      assert.equal(res.body.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);
    });

    it('enforces rate limiting on answer evaluation endpoint', async () => {
      const user = await createAccount('ratelimit_user');
      const createRes = await createTestSession(user.token, { questionCount: 10 });
      const sessionId = createRes.body.data.session.id;

      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: user.token },
      );

      const maxAttempts = RATE_LIMIT_POLICY.aiAnalysis.maxAttempts;
      const questions = createRes.body.data.session.questions;

      // Exhaust allowed quota
      for (let i = 0; i < maxAttempts; i++) {
        // Use questions array; if i >= questions.length, use first question with different attempt or session
        const qid = questions[i % questions.length].questionId;
        const res = await sendJsonWithToken(
          server.baseUrl,
          `/api/interviews/sessions/${sessionId}/questions/${qid}/answers`,
          {
            method: 'POST',
            token: user.token,
            payload: { answerText: `Answer submission attempt ${i + 1} for rate limit test.` },
          },
        );
        // Either 200 or 409 (if duplicate question) is fine; the limiter counts both
        assert.ok([200, 409].includes(res.status), `Expected 200 or 409, got ${res.status}`);
      }

      // Next request must be rate-limited
      const rateLimitedRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questions[0].questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Answer that should trigger 429 rate limit.' },
        },
      );

      assert.equal(rateLimitedRes.status, 429);
      assert.equal(rateLimitedRes.body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);
    });
  });
});
