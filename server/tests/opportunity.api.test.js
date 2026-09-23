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

describe('opportunities API', () => {
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

  async function student(email, profile) {
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Opportunity Student',
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

  it('requires authentication', async () => {
    const { status, body } = await requestWithHeaders(server.baseUrl, '/api/opportunities');
    assert.equal(status, 401);
    assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
  });

  it('returns an empty result for missing data', async () => {
    const token = await student('opportunity-empty@example.com');
    const { status, body } = await getWithToken(server.baseUrl, '/api/opportunities', token);

    assert.equal(status, 200);
    assert.deepEqual(body.data.opportunities, []);
    assert.equal(body.data.method.requiresVerifiedEvidence, true);
  });

  it('returns only opportunities whose verified skills and target role match', async () => {
    const token = await student('opportunity-match@example.com', {
      career: { targetRole: 'Backend Developer' },
      skills: [
        { name: 'JavaScript', level: 'advanced' },
        { name: 'Node.js', level: 'advanced' },
      ],
      projects: [{ title: 'Nexora', technologies: ['JavaScript', 'Node.js'] }],
    });
    const { status, body } = await getWithToken(server.baseUrl, '/api/opportunities', token);

    assert.equal(status, 200);
    assert.deepEqual(body.data.opportunities, []);
    assert.equal(body.data.catalogue.source.type, 'curated_internal');
  });
});