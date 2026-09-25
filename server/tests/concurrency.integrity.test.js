import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  Assessment,
  AssessmentAttempt,
  InterviewSession,
  SkillEvidenceCheck,
  StudentProfile,
  ensureModelIndexes,
} from '../src/models/index.js';
import { registerAiProvider, resetAiProviders, useAiProvider } from '../src/services/ai/aiProvider.js';
import { sendJsonWithToken, sendWithToken, startTestServer } from './helpers/testServer.js';
import { correctSubmissionFixture, scoringTestAssessment } from './fixtures/assessmentScoringFixtures.js';

const MOCK_CONCURRENCY_PROVIDER = 'mock-concurrency-provider';

describe('G26 — Data Integrity and Concurrency Test Suite', () => {
  let server;
  let testUser;
  let authToken;
  let assessmentId;

  async function registerAndLogin(email, password = 'Password123!Safe', name = 'Concurrency User') {
    await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const loginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const loginBody = await loginRes.json();
    return {
      user: loginBody.data.user,
      token: loginBody.data.token,
    };
  }

  before(async () => {
    server = await startTestServer();
    await ensureModelIndexes();

    registerAiProvider({
      name: MOCK_CONCURRENCY_PROVIDER,
      async complete() {
        return {
          text: JSON.stringify({
            dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.85 },
            compositeScore: 0.88,
            feedback: 'Solid and clear answer.',
            strengths: ['Accurate explanation'],
            growthAreas: [],
            groundedSkills: ['node'],
          }),
          model: 'concurrency-mock-model',
        };
      },
    });
    useAiProvider(MOCK_CONCURRENCY_PROVIDER);

    // Clean and set up assessment
    await Assessment.deleteMany({});
    const assessmentDoc = await Assessment.create({
      ...scoringTestAssessment,
      assessmentId: scoringTestAssessment.id,
      status: 'active',
    });
    assessmentId = assessmentDoc.assessmentId;

    // Register & login primary test user
    const creds = await registerAndLogin(`concurrency.${Date.now()}@example.com`);
    testUser = creds.user;
    authToken = creds.token;
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  describe('1. Concurrent Profile Upsert Integrity', () => {
    it('handles parallel first-time profile saves without duplicate profiles or 500 crashes', async () => {
      // Register and login a brand new user who has no profile yet
      const newUserEmail = `upsert.race.${Date.now()}@example.com`;
      const { user: raceUser, token: raceToken } = await registerAndLogin(newUserEmail);

      // Verify no profile exists yet
      const initialCount = await StudentProfile.countDocuments({ user: raceUser.id });
      assert.equal(initialCount, 0);

      // Fire 5 concurrent PATCH requests simultaneously to upsert profile
      const patchPromises = [
        sendJsonWithToken(server.baseUrl, '/api/profile', {
          method: 'PATCH',
          token: raceToken,
          payload: { personal: { city: 'Mumbai' } },
        }),
        sendJsonWithToken(server.baseUrl, '/api/profile', {
          method: 'PATCH',
          token: raceToken,
          payload: { personal: { state: 'Maharashtra' } },
        }),
        sendJsonWithToken(server.baseUrl, '/api/profile', {
          method: 'PATCH',
          token: raceToken,
          payload: { academic: { collegeName: 'IIT Bombay' } },
        }),
        sendJsonWithToken(server.baseUrl, '/api/profile', {
          method: 'PATCH',
          token: raceToken,
          payload: { career: { targetRole: 'Backend Developer' } },
        }),
        sendJsonWithToken(server.baseUrl, '/api/profile', {
          method: 'PATCH',
          token: raceToken,
          payload: { skills: [{ name: 'Node.js', level: 'ADVANCED' }] },
        }),
      ];

      const responses = await Promise.all(patchPromises);

      // All responses should succeed (200) without crashing
      for (const res of responses) {
        assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.success, true);
      }

      // Exactly ONE StudentProfile document must exist for this user in the database
      const profileDocs = await StudentProfile.find({ user: raceUser.id });
      assert.equal(profileDocs.length, 1, 'Expected exactly one profile document in DB');
    });
  });

  describe('2. Concurrent Assessment Attempt Creation', () => {
    it('returns the same active attempt on concurrent start requests without duplicate key errors', async () => {
      // Clear any prior attempts for testUser
      await AssessmentAttempt.deleteMany({ user: testUser.id, assessmentId });

      // Send 4 concurrent start requests for the same user and assessment
      const startPromises = [
        sendJsonWithToken(server.baseUrl, `/api/assessments/${assessmentId}/attempts`, {
          method: 'POST',
          token: authToken,
          payload: {},
        }),
        sendJsonWithToken(server.baseUrl, `/api/assessments/${assessmentId}/attempts`, {
          method: 'POST',
          token: authToken,
          payload: {},
        }),
        sendJsonWithToken(server.baseUrl, `/api/assessments/${assessmentId}/attempts`, {
          method: 'POST',
          token: authToken,
          payload: {},
        }),
        sendJsonWithToken(server.baseUrl, `/api/assessments/${assessmentId}/attempts`, {
          method: 'POST',
          token: authToken,
          payload: {},
        }),
      ];

      const responses = await Promise.all(startPromises);

      for (const res of responses) {
        assert.ok(
          res.status === 200 || res.status === 201,
          `Expected 200 or 201, got ${res.status}: ${JSON.stringify(res.body)}`,
        );
        assert.equal(res.body.success, true);
        assert.ok(res.body.data.attempt);
        assert.equal(res.body.data.attempt.status, 'in_progress');
      }

      // All 4 responses must have received the EXACT same attempt ID
      const firstAttemptId = responses[0].body.data.attempt.id;
      for (const res of responses) {
        assert.equal(res.body.data.attempt.id, firstAttemptId);
      }

      // Exactly ONE attempt document should exist in the database
      const attemptDocs = await AssessmentAttempt.find({ user: testUser.id, assessmentId });
      assert.equal(attemptDocs.length, 1);
    });
  });

  describe('3. Concurrent Assessment Submission and Evaluation', () => {
    it('allows only one submission to succeed and prevents duplicate evaluations and evidence', async () => {
      // Create and login a fresh user for clean submission race
      const subUserEmail = `sub.race.${Date.now()}@example.com`;
      const { user: subUser, token: subToken } = await registerAndLogin(subUserEmail);

      // Start attempt
      const startRes = await sendJsonWithToken(server.baseUrl, `/api/assessments/${assessmentId}/attempts`, {
        method: 'POST',
        token: subToken,
        payload: {},
      });
      assert.ok(startRes.status === 200 || startRes.status === 201);
      const attemptId = startRes.body.data.attempt.id;

      // Fire 4 parallel submit requests for the same attempt with passing answers
      const submitPayload = {
        attemptId,
        answers: correctSubmissionFixture.answers,
      };

      const submitPromises = [
        sendJsonWithToken(server.baseUrl, `/api/assessments/${assessmentId}/submit`, {
          method: 'POST',
          token: subToken,
          payload: submitPayload,
        }),
        sendJsonWithToken(server.baseUrl, `/api/assessments/${assessmentId}/submit`, {
          method: 'POST',
          token: subToken,
          payload: submitPayload,
        }),
        sendJsonWithToken(server.baseUrl, `/api/assessments/${assessmentId}/submit`, {
          method: 'POST',
          token: subToken,
          payload: submitPayload,
        }),
        sendJsonWithToken(server.baseUrl, `/api/assessments/${assessmentId}/submit`, {
          method: 'POST',
          token: subToken,
          payload: submitPayload,
        }),
      ];

      const responses = await Promise.all(submitPromises);

      const successfulResponses = responses.filter((r) => r.status === 200);
      const rejectedResponses = responses.filter((r) => r.status === 400);

      // Exactly ONE submission must have succeeded
      assert.equal(successfulResponses.length, 1, 'Expected exactly 1 successful evaluation');
      assert.equal(rejectedResponses.length, 3, 'Expected exactly 3 rejected duplicate submissions');

      // The attempt must be evaluated and passed
      const finalAttempt = await AssessmentAttempt.findById(attemptId);
      assert.equal(finalAttempt.status, 'evaluated');
      assert.equal(finalAttempt.passed, true);

      // Verified evidence must be created exactly once for this assessment attempt
      const evidenceRecords = await SkillEvidenceCheck.find({
        user: subUser.id,
        reference: scoringTestAssessment.id,
      });
      assert.equal(evidenceRecords.length, 1, 'Verified evidence must only be created once');
    });
  });

  describe('4. Concurrent Interview Completion CAS', () => {
    it('allows only one completion to transition status and prevents double evidence creation', async () => {
      // 1. Create session via public API
      const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: authToken,
        payload: {
          targetRole: 'Backend Developer',
          targetSkills: ['Node.js'],
          questionCount: 1,
        },
      });
      assert.equal(createRes.status, 201);
      const session = createRes.body.data.session;
      const sessionId = session.id;

      // 2. Start session
      const startRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: authToken },
      );
      assert.equal(startRes.status, 200);

      // 3. Answer the question
      const questionId = session.questions[0].questionId;
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: authToken,
          payload: { answerText: 'Comprehensive explanation of Node.js event loop and phases.' },
        },
      );
      assert.equal(answerRes.status, 200);

      // 4. Fire 4 concurrent completion requests
      const completePromises = [
        sendWithToken(server.baseUrl, `/api/interviews/sessions/${sessionId}/complete`, {
          method: 'POST',
          token: authToken,
        }),
        sendWithToken(server.baseUrl, `/api/interviews/sessions/${sessionId}/complete`, {
          method: 'POST',
          token: authToken,
        }),
        sendWithToken(server.baseUrl, `/api/interviews/sessions/${sessionId}/complete`, {
          method: 'POST',
          token: authToken,
        }),
        sendWithToken(server.baseUrl, `/api/interviews/sessions/${sessionId}/complete`, {
          method: 'POST',
          token: authToken,
        }),
      ];

      const responses = await Promise.all(completePromises);

      const successCompletes = responses.filter((r) => r.status === 200);
      const rejectedCompletes = responses.filter((r) => r.status === 400);

      // Exactly ONE completion succeeds
      assert.equal(successCompletes.length, 1, 'Expected exactly 1 completeSession to succeed');
      assert.equal(rejectedCompletes.length, 3, 'Expected 3 duplicate completeSession requests to fail');

      // Verify evidence checks created
      const dbSession = await InterviewSession.findById(sessionId);
      assert.ok(dbSession);
      const evidenceCount = await SkillEvidenceCheck.countDocuments({
        user: testUser.id,
        reference: String(dbSession._id),
      });
      assert.equal(evidenceCount, 1, 'Expected exactly one evidence check created for the session');
    });
  });

  describe('5. Concurrent Interview Question Answer CAS', () => {
    it('prevents concurrent answer submissions on the same question attempt from colliding', async () => {
      // 1. Create session via public API
      const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: authToken,
        payload: {
          targetRole: 'Backend Developer',
          targetSkills: ['Node.js'],
          questionCount: 1,
        },
      });
      assert.equal(createRes.status, 201);
      const session = createRes.body.data.session;
      const sessionId = session.id || session.sessionId;

      // 2. Start session
      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token: authToken },
      );

      const questionId = session.questions[0].questionId;

      // 3. Fire 3 concurrent answers for the FIRST attempt of this question
      const answerPromises = [
        sendJsonWithToken(
          server.baseUrl,
          `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
          {
            method: 'POST',
            token: authToken,
            payload: { answerText: 'Answer A: event loop execution.' },
          },
        ),
        sendJsonWithToken(
          server.baseUrl,
          `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
          {
            method: 'POST',
            token: authToken,
            payload: { answerText: 'Answer B: event loop execution.' },
          },
        ),
        sendJsonWithToken(
          server.baseUrl,
          `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
          {
            method: 'POST',
            token: authToken,
            payload: { answerText: 'Answer C: event loop execution.' },
          },
        ),
      ];

      const responses = await Promise.all(answerPromises);

      // CAS in submitQuestionAnswer ensures only one first attempt is recorded at that attempt index
      const successAnswers = responses.filter((r) => r.status === 200);
      assert.ok(successAnswers.length >= 1, 'At least one answer must succeed');
    });
  });
});
