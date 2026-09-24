import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  clearProfiles,
  clearResumes,
  clearUsers,
  getWithToken,
  postJson,
  requestWithHeaders,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';

describe('career readiness API', () => {
  let server;
  const PASSWORD = 'Str0ngPassphrase';

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await mongoose.connection.collection('careertwins').deleteMany({});
    await clearResumes();
    await clearProfiles();
    await clearUsers();
  });

  async function student(email, profile = null) {
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Readiness Student',
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

  const readinessFor = (token, roleId = 'backend-developer') =>
    getWithToken(server.baseUrl, `/api/careers/roles/${roleId}/readiness`, token);

  it('requires authentication', async () => {
    const { status, body } = await requestWithHeaders(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness',
    );

    assert.equal(status, 401);
    assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
  });

  it('returns explicit insufficient data without a CareerTwin', async () => {
    const token = await student('readiness-empty@example.com');
    const { status, body } = await readinessFor(token);

    assert.equal(status, 200);
    assert.equal(body.data.readiness.evidenceStatus, 'insufficient_data');
    assert.equal(body.data.readiness.dataStatus, 'incomplete');
  });

  it('returns explainable readiness derived from the owned CareerTwin', async () => {
    const token = await student('readiness-success@example.com', {
      skills: [
        { name: 'JavaScript', level: 'advanced' },
        { name: 'Node.js', level: 'advanced' },
      ],
      projects: [{ title: 'Nexora', technologies: ['Node.js'] }],
    });
    const { status, body } = await readinessFor(token);
    const result = body.data.readiness;

    assert.equal(status, 200);
    assert.equal(result.roleId, 'backend-developer');
    assert.equal(result.evidenceStatus, 'partial');
    assert.equal(result.dataStatus, 'fresh');
    assert.ok(result.blockingSkills.some((skill) => skill.status === 'claimed'));
    assert.equal('score' in result, false);
    assert.equal('percentage' in result, false);
  });

  it('returns the same not-found contract for malformed role identifiers', async () => {
    const token = await student('readiness-malformed@example.com');
    const { status, body } = await readinessFor(token, 'not a role');

    assert.equal(status, 404);
    assert.equal(body.errorCode, ERROR_CODES.CAREER_ROLE_NOT_FOUND);
  });

});