import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  clearCareerTwins,
  clearProfiles,
  clearReadinessSnapshots,
  clearResumes,
  clearSkillEvidenceChecks,
  clearUsers,
  getWithToken,
  postJson,
  requestWithHeaders,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';

describe('Task 23 — Career Readiness History & Snapshot Architecture', () => {
  let server;
  const PASSWORD = 'Str0ngPassword123!';

  before(async () => {
    server = await startTestServer({ suiteId: 'readiness_history' });
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await clearReadinessSnapshots();
    await clearCareerTwins();
    await clearSkillEvidenceChecks();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
  });

  async function registerAndLogin(email, profile = null) {
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'History Student',
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    const token = body.data.token;

    if (profile) {
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: profile,
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
    }

    return token;
  }

  it('requires authentication for both readiness history routes', async () => {
    const res1 = await requestWithHeaders(
      server.baseUrl,
      '/api/readiness/history/backend-developer',
    );
    assert.equal(res1.status, 401);
    assert.equal(res1.body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);

    const res2 = await requestWithHeaders(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness/history',
    );
    assert.equal(res2.status, 401);
    assert.equal(res2.body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
  });

  it('returns 404 for invalid career role identifier', async () => {
    const token = await registerAndLogin('history-notfound@example.com');
    const { status, body } = await getWithToken(
      server.baseUrl,
      '/api/readiness/history/not-a-real-role',
      token,
    );

    assert.equal(status, 404);
    assert.equal(body.errorCode, ERROR_CODES.CAREER_ROLE_NOT_FOUND);
  });

  it('returns empty array when student has no readiness history yet', async () => {
    const token = await registerAndLogin('history-empty@example.com');
    const { status, body } = await getWithToken(
      server.baseUrl,
      '/api/readiness/history/backend-developer',
      token,
    );

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.roleId, 'backend-developer');
    assert.deepEqual(body.data.history, []);
  });

  it('records snapshot when readiness is queried with ?includeScore=true', async () => {
    const token = await registerAndLogin('history-record@example.com', {
      skills: [
        { name: 'JavaScript', level: 'advanced' },
        { name: 'Node.js', level: 'advanced' },
      ],
      projects: [{ title: 'Nexora Core', technologies: ['Node.js'] }],
    });

    // 1. Fetch readiness with score
    const readinessRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness?includeScore=true',
      token,
    );
    assert.equal(readinessRes.status, 200);
    assert.ok(readinessRes.body.data.readiness.score, 'score block must be present');
    const scoreVal = readinessRes.body.data.readiness.score.score;
    assert.equal(typeof scoreVal, 'number');

    // 2. Query history via /api/readiness/history/:roleId
    const historyRes = await getWithToken(
      server.baseUrl,
      '/api/readiness/history/backend-developer',
      token,
    );
    assert.equal(historyRes.status, 200);
    assert.equal(historyRes.body.data.history.length, 1);

    const snapshot = historyRes.body.data.history[0];
    assert.equal(snapshot.roleId, 'backend-developer');
    assert.equal(snapshot.score, scoreVal);
    assert.equal(snapshot.evidenceStatus, 'partial');
    assert.equal(typeof snapshot.band, 'string');
    assert.equal(typeof snapshot.confidence, 'string');
    assert.ok(Array.isArray(snapshot.skillStates));
    assert.ok(snapshot.createdAt);

    // 3. Query history via alias /api/careers/roles/:roleId/readiness/history
    const aliasRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness/history',
      token,
    );
    assert.equal(aliasRes.status, 200);
    assert.equal(aliasRes.body.data.history.length, 1);
    assert.equal(aliasRes.body.data.history[0].id, snapshot.id);
  });

  it('deduplicates rapid subsequent calls within the 5-minute snapshot window', async () => {
    const token = await registerAndLogin('history-dedup@example.com', {
      skills: [{ name: 'JavaScript', level: 'intermediate' }],
    });

    // Call readiness twice in immediate succession
    await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness?includeScore=true',
      token,
    );
    await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness?includeScore=true',
      token,
    );

    const historyRes = await getWithToken(
      server.baseUrl,
      '/api/readiness/history/backend-developer',
      token,
    );
    assert.equal(historyRes.status, 200);
    assert.equal(historyRes.body.data.history.length, 1, 'duplicate request within window must not create second snapshot');
  });

  it('strictly enforces user isolation / IDOR protection across students', async () => {
    const tokenA = await registerAndLogin('studentA@example.com', {
      skills: [{ name: 'JavaScript', level: 'intermediate' }],
    });
    const tokenB = await registerAndLogin('studentB@example.com', {
      skills: [{ name: 'Python', level: 'advanced' }],
    });

    // Student A generates snapshot
    await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness?includeScore=true',
      tokenA,
    );

    // Student B queries history -> must be empty
    const historyB = await getWithToken(
      server.baseUrl,
      '/api/readiness/history/backend-developer',
      tokenB,
    );
    assert.equal(historyB.status, 200);
    assert.deepEqual(historyB.body.data.history, [], 'Student B must not see Student A snapshots');

    // Student A queries history -> must see 1
    const historyA = await getWithToken(
      server.baseUrl,
      '/api/readiness/history/backend-developer',
      tokenA,
    );
    assert.equal(historyA.status, 200);
    assert.equal(historyA.body.data.history.length, 1);
  });

  it('respects the ?limit parameter', async () => {
    const token = await registerAndLogin('history-limit@example.com', {
      skills: [{ name: 'JavaScript', level: 'intermediate' }],
    });

    // Manually insert 3 snapshots for testing limit
    const { ReadinessSnapshot } = await import('../src/models/ReadinessSnapshot.model.js');
    const { User } = await import('../src/models/User.model.js');
    const user = await User.findOne({ email: 'history-limit@example.com' });

    for (let i = 1; i <= 3; i++) {
      await ReadinessSnapshot.create({
        user: user._id,
        roleId: 'backend-developer',
        score: 30 + i * 5,
        evidenceStatus: 'partial',
        band: 'developing',
        confidence: 'medium',
        requiredScore: 20 + i,
        preferredScore: 10,
        blockingSkillsCount: 3,
        createdAt: new Date(Date.now() - (4 - i) * 600000), // 30m, 20m, 10m ago
      });
    }

    const res = await getWithToken(
      server.baseUrl,
      '/api/readiness/history/backend-developer?limit=2',
      token,
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data.history.length, 2);
    // Ordered descending by createdAt: newest first
    assert.equal(res.body.data.history[0].score, 45);
    assert.equal(res.body.data.history[1].score, 40);
  });
});
