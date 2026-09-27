import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  Assessment,
  ensureModelIndexes,
} from '../src/models/index.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import { getWithToken, sendJsonWithToken, sendWithToken, startTestServer } from './helpers/testServer.js';
import { scoringTestAssessment } from './fixtures/assessmentScoringFixtures.js';

const TIMEOUT_PROVIDER_NAME = 'mock-hardening-timeout-provider';

describe('G28 — Backend Final Hardening & Resilience Regression Suite', () => {
  let server;
  let authToken;
  let testUser;
  let assessmentId;

  before(async () => {
    server = await startTestServer();
    await ensureModelIndexes();

    // Register assessment
    await Assessment.deleteMany({});
    const assessmentDoc = await Assessment.create({
      ...scoringTestAssessment,
      assessmentId: scoringTestAssessment.id,
      status: 'active',
    });
    assessmentId = assessmentDoc.assessmentId;

    // Register primary user
    const email = `hardening.${Date.now()}@example.com`;
    const regRes = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Hardening Test User',
        email,
        password: 'Password123!Safe',
      }),
    });
    const regBody = await regRes.json();
    testUser = regBody.data.user;

    const loginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'Password123!Safe',
      }),
    });
    const loginBody = await loginRes.json();
    authToken = loginBody.data.token;
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  describe('1. Global Error Envelope Consistency', () => {
    it('returns consistent { success: false, message, errorCode } on 401 Unauthorized', async () => {
      const res = await fetch(`${server.baseUrl}/api/career-twin`);
      const body = await res.json();

      assert.equal(res.status, 401);
      assert.equal(body.success, false);
      assert.equal(typeof body.message, 'string');
      assert.equal(body.errorCode, 'AUTH_TOKEN_MISSING');
    });

    it('returns consistent { success: false, message, errorCode } on 404 Route Not Found', async () => {
      const res = await fetch(`${server.baseUrl}/api/non-existent-endpoint-${Date.now()}`);
      const body = await res.json();

      assert.equal(res.status, 404);
      assert.equal(body.success, false);
      assert.equal(typeof body.message, 'string');
      assert.equal(body.errorCode, 'NOT_FOUND');
    });

    it('returns consistent { success: false, message, errorCode } on 400 Malformed JSON', async () => {
      const res = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"email": invalid_json',
      });
      const body = await res.json();

      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.equal(body.errorCode, 'MALFORMED_REQUEST');
      assert.match(body.message, /Malformed JSON/i);
    });

    it('returns consistent { success: false, message, errorCode } on 400 Validation Error', async () => {
      const res = await fetch(`${server.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
          email: 'invalid-email-format',
          password: 'short',
        }),
      });
      const body = await res.json();

      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.equal(body.errorCode, 'VALIDATION_ERROR');
      assert.ok(Array.isArray(body.details));
      assert.ok(body.details.length >= 2);
    });
  });

  describe('2. Malformed Identifier Resilience (Anti-Crash)', () => {
    it('handles malformed ObjectId in resume routes gracefully (404/400, no 500)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/resumes/not-a-valid-mongo-id',
        authToken,
      );

      assert.ok(status === 400 || status === 404);
      assert.equal(body.success, false);
      assert.ok(body.errorCode);
    });

    it('handles malformed ObjectId in interview session routes gracefully (404/400, no 500)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/interviews/sessions/not-a-valid-mongo-id',
        authToken,
      );

      assert.ok(status === 400 || status === 404);
      assert.equal(body.success, false);
      assert.ok(body.errorCode);
    });

    it('handles malformed ObjectId in assessment attempt routes gracefully (404/400, no 500)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/assessments/attempts/not-a-valid-mongo-id',
        authToken,
      );

      assert.ok(status === 400 || status === 404);
      assert.equal(body.success, false);
      assert.ok(body.errorCode);
    });
  });

  describe('3. AI Outage & Timeout Graceful Degradation', () => {
    before(() => {
      registerAiProvider({
        name: TIMEOUT_PROVIDER_NAME,
        async complete() {
          const err = new Error('AI Provider upstream gateway timeout');
          err.code = 'ETIMEDOUT';
          throw err;
        },
      });
      useAiProvider(TIMEOUT_PROVIDER_NAME);
    });

    it('degrades gracefully during CareerTwin narrative generation when AI provider times out', async () => {
      // Set up profile so twin has enough input
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token: authToken,
        payload: {
          skills: [{ name: 'Node.js', level: 'intermediate' }],
          career: { targetRole: 'Backend Developer' },
        },
      });

      // Request CareerTwin with narrative requested
      const res = await sendJsonWithToken(server.baseUrl, '/api/career-twin?narrative=true', {
        method: 'POST',
        token: authToken,
        payload: {},
      });

      // Twin generation must NOT crash or return 500
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.careerTwin);

      // Narrative degrades gracefully to null when AI fails, without impacting the rest of the twin
      const twin = res.body.data.careerTwin;
      assert.equal(twin.narrative, null);
      assert.ok(twin.skills.length > 0);
      assert.equal(twin.indicators.totalSkills, 1);
    });
  });

  describe('4. Sanitized Profile and Twin Query Isolation', () => {
    it('never exposes internal database or password fields in profile DTO', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/profile', authToken);

      assert.equal(status, 200);
      assert.equal(body.success, true);
      const profile = body.data.profile;

      assert.equal(profile.password, undefined);
      assert.equal(profile.passwordHash, undefined);
      assert.equal(profile.user, undefined);
      assert.equal(profile.__v, undefined);
    });

    it('never exposes password or internal credentials in auth me DTO', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/auth/me', authToken);

      assert.equal(status, 200);
      assert.equal(body.success, true);
      const user = body.data.user;

      assert.equal(user.password, undefined);
      assert.equal(user.passwordHash, undefined);
      assert.equal(user.__v, undefined);
      assert.equal(typeof user.id, 'string');
      assert.equal(typeof user.email, 'string');
    });
  });
});
