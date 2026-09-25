import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { CAREER_ROLES, findRole } from '../src/domain/careers/roleCatalogue.js';
import { DIMENSION_WEIGHTS, WEIGHTS_VERSION } from '../src/domain/careers/scoring.js';
import {
  clearCareerTwins,
  clearProfiles,
  clearResumes,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let counter = 0;

const BACKEND_PROFILE = {
  academic: { branch: 'Computer Science and Engineering', graduationYear: 2027 },
  career: { targetRole: 'Backend Developer', careerInterests: ['Distributed systems'] },
  skills: [
    { name: 'JavaScript', level: 'advanced' },
    { name: 'Node.js', level: 'advanced' },
    { name: 'SQL', level: 'intermediate' },
    { name: 'REST APIs', level: 'intermediate' },
  ],
  projects: [{ title: 'Nexora', technologies: ['Express.js', 'MongoDB', 'Node.js'] }],
};

describe('G09 — Recommendation Integration & Scoring Regression Suite', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearCareerTwins();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();
  });

  async function registerAndLogin() {
    counter += 1;
    const email = `rec.g09.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav Rec',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { email, user: res.body.data.user, token: res.body.data.token };
  }

  it('1. Role Catalogue: lists all curated roles with schema integrity', async () => {
    const { token } = await registerAndLogin();
    const res = await getWithToken(server.baseUrl, '/api/careers/roles', token);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.roles.length, CAREER_ROLES.length);
    assert.ok(res.body.data.source);

    const first = res.body.data.roles[0];
    assert.ok(first.id);
    assert.ok(first.title);
    assert.ok(Array.isArray(first.requiredSkills));
    assert.ok(Array.isArray(first.preferredSkills));
  });

  it('2. CareerTwin Prerequisite: refuses recommendations and role match when twin is missing (409)', async () => {
    const { token } = await registerAndLogin();

    // Without CareerTwin
    const recRes = await getWithToken(server.baseUrl, '/api/careers/recommendations', token);
    assert.equal(recRes.status, 409);
    assert.equal(recRes.body.errorCode, ERROR_CODES.CAREER_TWIN_NOT_FOUND);

    const matchRes = await getWithToken(server.baseUrl, '/api/careers/roles/backend-developer/match', token);
    assert.equal(matchRes.status, 409);
    assert.equal(matchRes.body.errorCode, ERROR_CODES.CAREER_TWIN_NOT_FOUND);
  });

  it('3. Unknown Role Match: returns 404 CAREER_ROLE_NOT_FOUND', async () => {
    const { token } = await registerAndLogin();

    // Create profile & twin
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: BACKEND_PROFILE,
    });
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    const res = await getWithToken(server.baseUrl, '/api/careers/roles/non-existent-role/match', token);
    assert.equal(res.status, 404);
    assert.equal(res.body.errorCode, ERROR_CODES.CAREER_ROLE_NOT_FOUND);
  });

  it('4. Limit Query Parameter: validates bounds 1..20 cleanly', async () => {
    const { token } = await registerAndLogin();

    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: BACKEND_PROFILE,
    });
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    // Limit 0 (below min 1)
    const resLow = await getWithToken(server.baseUrl, '/api/careers/recommendations?limit=0', token);
    assert.equal(resLow.status, 400);
    assert.equal(resLow.body.errorCode, ERROR_CODES.VALIDATION_ERROR);

    // Limit 25 (above max 20)
    const resHigh = await getWithToken(server.baseUrl, '/api/careers/recommendations?limit=25', token);
    assert.equal(resHigh.status, 400);
    assert.equal(resHigh.body.errorCode, ERROR_CODES.VALIDATION_ERROR);

    // Valid limit 3
    const resValid = await getWithToken(server.baseUrl, '/api/careers/recommendations?limit=3', token);
    assert.equal(resValid.status, 200);
    assert.ok(resValid.body.data.matches.length <= 3);
  });

  it('5. Scoring & Weights Verification: verifies explainability and dimension weights', async () => {
    const { token } = await registerAndLogin();

    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: BACKEND_PROFILE,
    });
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    const res = await getWithToken(server.baseUrl, '/api/careers/roles/backend-developer/match', token);
    assert.equal(res.status, 200);

    const { match, method } = res.body.data;
    assert.equal(match.roleId, 'backend-developer');
    assert.ok(match.score >= 0 && match.score <= 100);
    assert.ok(match.band);

    // Check weights
    assert.deepEqual(method.weights, DIMENSION_WEIGHTS);
    assert.equal(method.weightsVersion, WEIGHTS_VERSION);
    assert.equal(method.deterministic, true);
    assert.equal(method.usesAi, false);

    // Check dimensions breakdown
    assert.ok(match.dimensions.requiredSkills);
    assert.ok(match.dimensions.preferredSkills);
    assert.ok(match.dimensions.evidenceStrength);
    assert.ok(match.dimensions.interestAlignment);
    assert.ok(match.dimensions.backgroundAlignment);

    // Check explainability fields
    assert.ok(Array.isArray(match.matchedRequired));
    assert.ok(Array.isArray(match.missingRequired));
    assert.ok(Array.isArray(match.matchedPreferred));
    assert.ok(Array.isArray(match.missingPreferred));
    assert.ok(Array.isArray(match.evidence));
  });
});
