import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { GAP_STATUS } from '../src/domain/skillGap/computeSkillGap.js';
import {
  clearCareerTwins,
  clearProfiles,
  clearResumes,
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
let server;
let counter = 0;

describe('G10 — Skill-Gap + Roadmap End-to-End Integration Suite', () => {
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
    await clearSkillEvidenceChecks();
    await clearUsers();
    resetRateLimiters();
  });

  async function registerAndLogin() {
    counter += 1;
    const email = `sg.rm.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav Gap Roadmap',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { email, user: res.body.data.user, token: res.body.data.token };
  }

  it('1. Prerequisite & Unknown Role: enforces 409 for missing CareerTwin and 404 for unknown role', async () => {
    const { token } = await registerAndLogin();

    // 1. Missing twin
    const gap409 = await getWithToken(server.baseUrl, '/api/careers/roles/backend-developer/skill-gap', token);
    assert.equal(gap409.status, 409);
    assert.equal(gap409.body.errorCode, ERROR_CODES.CAREER_TWIN_NOT_FOUND);

    const rm409 = await getWithToken(server.baseUrl, '/api/careers/roles/backend-developer/roadmap', token);
    assert.equal(rm409.status, 409);
    assert.equal(rm409.body.errorCode, ERROR_CODES.CAREER_TWIN_NOT_FOUND);

    // Build twin
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: { skills: [{ name: 'JavaScript', level: 'beginner' }] },
    });
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    // 2. Unknown role
    const gap404 = await getWithToken(server.baseUrl, '/api/careers/roles/invalid-role-slug/skill-gap', token);
    assert.equal(gap404.status, 404);
    assert.equal(gap404.body.errorCode, ERROR_CODES.CAREER_ROLE_NOT_FOUND);

    const rm404 = await getWithToken(server.baseUrl, '/api/careers/roles/invalid-role-slug/roadmap', token);
    assert.equal(rm404.status, 404);
    assert.equal(rm404.body.errorCode, ERROR_CODES.CAREER_ROLE_NOT_FOUND);
  });

  it('2. End-to-end chain: recommendation -> skill-gap -> roadmap and canonical skill normalization', async () => {
    const { token } = await registerAndLogin();

    // Seed profile with variant skill casing and spacing: 'node js'
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: {
        career: { targetRole: 'Backend Developer' },
        skills: [{ name: 'Node.js', level: 'intermediate' }],
        projects: [{ title: 'API Server', technologies: ['Node.js'] }],
      },
    });
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    // Recommendation gives backend-developer
    const recRes = await getWithToken(server.baseUrl, '/api/careers/recommendations?limit=1', token);
    assert.equal(recRes.status, 200);
    const topRole = recRes.body.data.matches[0];
    assert.ok(topRole);
    assert.equal(topRole.roleId, 'backend-developer');

    // Query skill-gap for topRole
    const gapRes = await getWithToken(server.baseUrl, `/api/careers/roles/${topRole.roleId}/skill-gap`, token);
    assert.equal(gapRes.status, 200);
    const gapSkills = gapRes.body.data.gap.skills;

    // Node.js should be recognized as supported (due to project)
    const nodeGap = gapSkills.find((s) => s.key === 'nodejs');
    assert.ok(nodeGap);
    assert.equal(nodeGap.status, GAP_STATUS.SUPPORTED);

    // Other required skills like SQL should be missing
    const sqlGap = gapSkills.find((s) => s.key === 'sql');
    assert.ok(sqlGap);
    assert.equal(sqlGap.status, GAP_STATUS.MISSING);

    // Query roadmap for topRole
    const rmRes = await getWithToken(server.baseUrl, `/api/careers/roles/${topRole.roleId}/roadmap`, token);
    assert.equal(rmRes.status, 200);
    const rmItems = rmRes.body.data.roadmap.items;

    // SQL should be on the roadmap
    const sqlItem = rmItems.find((item) => item.skill?.key === 'sql');
    assert.ok(sqlItem, 'Missing required skill SQL must be in roadmap items');
    assert.ok(sqlItem.objective);
    assert.ok(sqlItem.verification);
  });

  it('3. Evidence closure: adding evidence closes the gap and updates roadmap', async () => {
    const { token } = await registerAndLogin();

    // Initially student has only Node.js
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: {
        skills: [{ name: 'Node.js', level: 'intermediate' }],
      },
    });
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    // Check roadmap before: SQL is on roadmap
    const initialRm = await getWithToken(server.baseUrl, '/api/careers/roles/backend-developer/roadmap', token);
    const hadSql = initialRm.body.data.roadmap.items.some((i) => i.skill?.key === 'sql');
    assert.equal(hadSql, true);

    // Student now closes the gap by building a project with SQL and adding to profile
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: {
        skills: [
          { name: 'Node.js', level: 'intermediate' },
          { name: 'SQL', level: 'intermediate' },
        ],
        projects: [
          { title: 'Database Project', technologies: ['SQL', 'Node.js'] },
        ],
      },
    });
    // Regenerate CareerTwin
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    // Check skill gap: SQL is now supported
    const updatedGap = await getWithToken(server.baseUrl, '/api/careers/roles/backend-developer/skill-gap', token);
    const sqlGapAfter = updatedGap.body.data.gap.skills.find((s) => s.key === 'sql');
    assert.equal(sqlGapAfter.status, GAP_STATUS.SUPPORTED);

    // Check roadmap: SQL no longer appears as missing
    const updatedRm = await getWithToken(server.baseUrl, '/api/careers/roles/backend-developer/roadmap', token);
    const hasSqlMissingNow = updatedRm.body.data.roadmap.items.some(
      (i) => i.skill?.key === 'sql' && i.because?.currentStatus === GAP_STATUS.MISSING,
    );
    assert.equal(hasSqlMissingNow, false);
  });
});
