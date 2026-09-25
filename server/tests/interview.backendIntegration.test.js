import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  INTERVIEW_DIFFICULTY,
  SESSION_STATUS,
} from '../src/domain/interview/interviewContract.js';
import { InterviewSession } from '../src/models/InterviewSession.model.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
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

const PASSWORD = 'Str0ngPassphrase1!';
let counter = 0;
let server;
let mockEvaluationResponse;

describe('G12 — Interview Backend Integration & Security Suite', () => {
  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: 'g12-test-evaluator',
      async complete() {
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
    await clearSkillEvidenceChecks();
    await clearUsers();
    resetRateLimiters();

    useAiProvider('g12-test-evaluator');
    mockEvaluationResponse = {
      dimensions: {
        accuracy: 0.85,
        depth: 0.80,
        clarity: 0.85,
        relevance: 0.90,
      },
      feedback: 'Solid technical explanation with appropriate context.',
      strengths: ['Clear explanation', 'Good domain terminology'],
      growthAreas: ['Consider memory implications in production'],
      groundedSkills: ['Node.js'],
    };
  });

  async function registerAndLogin(label, role = 'student') {
    counter += 1;
    const email = `g12.${label}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: `User ${label}`,
      email,
      password: PASSWORD,
    });

    if (role === 'admin') {
      await mongoose.connection.collection('users').updateOne(
        { email },
        { $set: { role: 'admin' } },
      );
    }

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

  async function createTestSession(token) {
    return sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
      method: 'POST',
      token,
      payload: {
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        questionCount: 2,
      },
    });
  }

  // =========================================================================
  // 1. Session Lifecycle & Transitions
  // =========================================================================
  describe('1. Session Lifecycle & State Machine Transitions', () => {
    it('manages full lifecycle: create -> start -> answer -> complete', async () => {
      const student = await registerAndLogin('lifecycle_student');

      // Create session
      const createRes = await createTestSession(student.token);
      assert.equal(createRes.status, 201);
      const session = createRes.body.data.session;
      assert.equal(session.status, SESSION_STATUS.INITIALIZED);
      assert.equal(session.questions.length, 2);

      // Start session
      const startRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/start`,
        { method: 'POST', token: student.token },
      );
      assert.equal(startRes.status, 200);
      assert.equal(startRes.body.data.session.status, SESSION_STATUS.IN_PROGRESS);

      // Answer first question
      const q1Id = session.questions[0].questionId;
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${q1Id}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: {
            answerText: 'Node.js event loop coordinates non-blocking I/O using libuv and thread pools.',
            durationSeconds: 45,
          },
        },
      );
      assert.equal(answerRes.status, 200);
      assert.ok(answerRes.body.data.evaluatedQuestion.evaluation.compositeScore > 0);

      // Complete session
      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        { method: 'POST', token: student.token, payload: {} },
      );
      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.data.session.status, SESSION_STATUS.COMPLETED);
      assert.ok(completeRes.body.data.overallScore > 0);

      // Re-completing or re-starting completed session must fail
      const restartRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/start`,
        { method: 'POST', token: student.token },
      );
      assert.equal(restartRes.status, 400);

      const reCompleteRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        { method: 'POST', token: student.token, payload: {} },
      );
      assert.equal(reCompleteRes.status, 400);
    });

    it('allows abandoning an active session and prevents subsequent mutations', async () => {
      const student = await registerAndLogin('abandon_student');
      const createRes = await createTestSession(student.token);
      const sessionId = createRes.body.data.session.id;

      // Abandon initialized session
      const abandonRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/abandon`,
        { method: 'POST', token: student.token },
      );
      assert.equal(abandonRes.status, 200);
      assert.equal(abandonRes.body.data.session.status, SESSION_STATUS.ABANDONED);

      // Attempting to start an abandoned session must fail
      const startRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: student.token },
      );
      assert.equal(startRes.status, 400);
    });
  });

  // =========================================================================
  // 2. Evaluator Boundary & Prompt Isolation
  // =========================================================================
  describe('2. Evaluator Boundary & Information Leakage Defense', () => {
    it('never exposes system prompts, rubric prompts, or AI credentials in session DTOs', async () => {
      const student = await registerAndLogin('boundary_student');
      const createRes = await createTestSession(student.token);
      const session = createRes.body.data.session;

      // Check DTO on create
      assert.equal(session.systemPrompt, undefined);
      assert.equal(session.user, undefined);
      for (const q of session.questions) {
        assert.equal(q.systemPrompt, undefined);
        assert.equal(q.evaluationPrompt, undefined);
      }

      // Start and answer
      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/start`,
        { method: 'POST', token: student.token },
      );
      const qId = session.questions[0].questionId;
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${qId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: {
            answerText: 'Node.js is built on Google V8 and uses non-blocking event-driven architecture.',
          },
        },
      );
      assert.equal(answerRes.status, 200);
      const providerMeta = answerRes.body.data.session.providerMetadata;
      assert.ok(providerMeta);
      assert.equal(providerMeta.apiKey, undefined);
      assert.equal(providerMeta.secret, undefined);
      assert.equal(providerMeta.rawPrompt, undefined);
    });
  });

  // =========================================================================
  // 3. Session Timeout & Expiration
  // =========================================================================
  describe('3. Session Timeout & Expiration Handling', () => {
    it('transitions expired session to TIMED_OUT on read and blocks completion', async () => {
      const student = await registerAndLogin('timeout_student');
      const createRes = await createTestSession(student.token);
      const sessionId = createRes.body.data.session.id;

      // Start session
      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: student.token },
      );

      // Force session expiration directly in MongoDB
      await InterviewSession.updateOne(
        { _id: sessionId },
        { $set: { expiresAt: new Date(Date.now() - 30000) } },
      );

      // Reading the session via GET transitions it to TIMED_OUT
      const getRes = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}`,
        student.token,
      );
      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.data.session.status, SESSION_STATUS.TIMED_OUT);

      // Completing the expired session returns 400 INTERVIEW_INVALID_STATE or INTERVIEW_SESSION_EXPIRED
      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/complete`,
        { method: 'POST', token: student.token, payload: {} },
      );
      assert.equal(completeRes.status, 400);
    });
  });

  // =========================================================================
  // 4. Strict Ownership & IDOR Protection
  // =========================================================================
  describe('4. Strict Ownership & IDOR Protection', () => {
    it('prevents User B from accessing, starting, answering, or completing User A session with 404', async () => {
      const userA = await registerAndLogin('owner_userA');
      const userB = await registerAndLogin('attacker_userB');

      const createRes = await createTestSession(userA.token);
      const sessionId = createRes.body.data.session.id;
      const qId = createRes.body.data.session.questions[0].questionId;

      // User B attempts to read User A session -> 404
      const readRes = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}`,
        userB.token,
      );
      assert.equal(readRes.status, 404);
      assert.equal(readRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);

      // User B attempts to start User A session -> 404
      const startRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: userB.token },
      );
      assert.equal(startRes.status, 404);

      // User A starts session
      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: userA.token },
      );

      // User B attempts to submit answer -> 404
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${qId}/answers`,
        {
          method: 'POST',
          token: userB.token,
          payload: { answerText: 'Malicious cross-tenant injection answer.' },
        },
      );
      assert.equal(answerRes.status, 404);

      // User B attempts to complete session -> 404
      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/complete`,
        { method: 'POST', token: userB.token, payload: {} },
      );
      assert.equal(completeRes.status, 404);

      // User B attempt list has 0 sessions
      const listRes = await getWithToken(
        server.baseUrl,
        '/api/interviews/sessions',
        userB.token,
      );
      assert.equal(listRes.status, 200);
      assert.equal(listRes.body.data.count, 0);
    });
  });

  // =========================================================================
  // 5. AI Evidence Policy Compliance
  // =========================================================================
  describe('5. AI Evidence Policy Compliance', () => {
    it('ensures AI evaluations remain supported and never produce verified without human admin', async () => {
      const student = await registerAndLogin('evidence_student');
      const createRes = await createTestSession(student.token);
      const sessionId = createRes.body.data.session.id;

      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: student.token },
      );

      const q1Id = createRes.body.data.session.questions[0].questionId;
      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${q1Id}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: {
            answerText: 'Node.js is an open-source, cross-platform JavaScript runtime environment.',
          },
        },
      );

      // Student tries to specify evaluatorType: 'human' to game verified status
      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/complete`,
        {
          method: 'POST',
          token: student.token,
          payload: { evaluatorType: 'human' },
        },
      );

      assert.equal(completeRes.status, 200);
      // Student is not admin, so evaluatorType must remain 'ai'
      assert.equal(completeRes.body.data.session.evaluatorType, 'ai');
      assert.equal(completeRes.body.data.eligibleForVerified, false);

      // Check persisted SkillEvidenceCheck
      const checks = await SkillEvidenceCheck.find({ user: student.userId });
      assert.ok(checks.length >= 1);
      for (const check of checks) {
        assert.equal(check.eligibleForVerified, false);
        assert.equal(check.outcome, 'uncertain');
        assert.equal(check.evaluatedBy, 'ai');
      }
    });

    it('grants eligibleForVerified when evaluated by a verified human admin', async () => {
      const admin = await registerAndLogin('admin_evaluator', 'admin');
      const createRes = await createTestSession(admin.token);
      const sessionId = createRes.body.data.session.id;

      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: admin.token },
      );

      const q1Id = createRes.body.data.session.questions[0].questionId;
      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${q1Id}/answers`,
        {
          method: 'POST',
          token: admin.token,
          payload: {
            answerText: 'Node.js handles concurrency using non-blocking asynchronous event loops.',
          },
        },
      );

      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/complete`,
        {
          method: 'POST',
          token: admin.token,
          payload: { evaluatorType: 'human' },
        },
      );

      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.data.session.evaluatorType, 'human');
      assert.equal(completeRes.body.data.eligibleForVerified, true);

      // Check persisted SkillEvidenceCheck
      const check = await SkillEvidenceCheck.findOne({ user: admin.userId });
      assert.ok(check);
      assert.equal(check.eligibleForVerified, true);
      assert.equal(check.outcome, 'pass');
      assert.equal(check.evaluatedBy, 'human');
    });
  });
});
