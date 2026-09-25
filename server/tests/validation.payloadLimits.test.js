import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  clearAssessmentAttempts,
  clearAssessments,
  clearInterviewSessions,
  clearUsers,
  postJson,
  postRaw,
  resetRateLimiters,
  sendJsonWithToken,
  startTestServer,
} from './helpers/testServer.js';
import { ASSESSMENT_LIMITS } from '../src/constants/assessmentPolicy.js';
import { INTERVIEW_LIMITS } from '../src/domain/interview/interviewContract.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let counter = 0;

describe('G04 — Validation and Payload Limits Suite', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearAssessmentAttempts();
    await clearAssessments();
    await clearInterviewSessions();
    await clearUsers();
    resetRateLimiters();
  });

  async function registerAndLogin() {
    counter += 1;
    const email = `payload.limit.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Payload Test User',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { email, user: res.body.data.user, token: res.body.data.token };
  }

  describe('1. Global HTTP Payload Limits and Body Parsing', () => {
    it('rejects oversized JSON request body (>1MB) with HTTP 413', async () => {
      const { token } = await registerAndLogin();
      // Generate a string that exceeds 1MB (1024 * 1024 + 1024 bytes)
      const oversizedData = 'x'.repeat(1024 * 1024 + 2048);
      const rawPayload = JSON.stringify({ largeField: oversizedData });

      const res = await postRaw(server.baseUrl, '/api/profile', rawPayload, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(res.status, 413);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, 'Request body is too large');
    });

    it('rejects malformed JSON body with HTTP 400 and MALFORMED_REQUEST code', async () => {
      const { token } = await registerAndLogin();
      const rawInvalidJson = '{"name": "test", unquotedKey: "value"}';

      const res = await postRaw(server.baseUrl, '/api/profile', rawInvalidJson, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.errorCode, ERROR_CODES.MALFORMED_REQUEST);
      assert.equal(res.body.message, 'Malformed JSON in request body');
    });
  });

  describe('2. Assessment Validation and Slug Bounds', () => {
    it('rejects assessmentId parameter longer than 64 characters with 400', async () => {
      const { token } = await registerAndLogin();
      const oversizedSlug = 'a'.repeat(65);

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${oversizedSlug}/attempts`,
        { method: 'POST', token, payload: {} },
      );

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /valid alphanumeric slug/i);
    });

    it('rejects assessmentId filter query longer than 64 characters with 400', async () => {
      const { token } = await registerAndLogin();
      const oversizedFilter = 'b'.repeat(ASSESSMENT_LIMITS.id.max + 1);

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts?assessmentId=${oversizedFilter}`,
        { method: 'GET', token },
      );

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /valid alphanumeric slug/i);
    });
  });

  describe('3. Interview Duration and Answer Bounds', () => {
    it('rejects negative or out-of-bounds durationSeconds on answer submission', async () => {
      const { token } = await registerAndLogin();

      // Start interview session
      const createRes = await sendJsonWithToken(
        server.baseUrl,
        '/api/interviews/sessions',
        {
          method: 'POST',
          token,
          payload: {
            targetRole: 'backend-developer',
            targetSkills: ['JavaScript', 'Node.js'],
          },
        },
      );
      assert.equal(createRes.status, 201);
      const session = createRes.body.data.session;
      const sessionId = session._id || session.id;

      // Start session
      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/start`,
        { method: 'POST', token },
      );
      assert.equal(startRes.status, 200);
      const activeSession = startRes.body.data.session;
      const questionId = activeSession.questions[0].questionId;

      // Test negative durationSeconds
      const negRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token,
          payload: {
            answerText: 'Valid answer longer than 5 chars for test',
            durationSeconds: -5,
          },
        },
      );
      assert.equal(negRes.status, 400);
      assert.match(negRes.body.message, /durationSeconds must be a finite number between 0 and/i);

      // Test durationSeconds exceeding policy limit
      const overRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token,
          payload: {
            answerText: 'Valid answer longer than 5 chars for test',
            durationSeconds: INTERVIEW_LIMITS.maxTimePerQuestionSeconds + 1,
          },
        },
      );
      assert.equal(overRes.status, 400);
      assert.match(overRes.body.message, /durationSeconds must be a finite number between 0 and/i);

      // Test non-finite durationSeconds
      const nonFiniteRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token,
          payload: {
            answerText: 'Valid answer longer than 5 chars for test',
            durationSeconds: 'not-a-number',
          },
        },
      );
      assert.equal(nonFiniteRes.status, 400);
      assert.match(nonFiniteRes.body.message, /durationSeconds must be a finite number between 0 and/i);
    });
  });
});
