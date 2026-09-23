import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
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
import { registerAiProvider, resetAiProviders, useAiProvider } from '../src/services/ai/aiProvider.js';

const PASSWORD = 'Str0ngPassphrase';
const RESUME_TEXT = `
Gaurav Shivhare
Skills: JavaScript, Node.js, SQL, REST APIs
Project: Nexora backend API with Node.js and MongoDB.
`;

describe('authenticated core loop integration', () => {
  let server;
  let counter = 0;

  before(async () => {
    server = await startTestServer();
    registerAiProvider({
      name: 'core-loop-test-provider',
      async complete() {
        return {
          model: 'core-loop-test-model',
          text: JSON.stringify({
            skills: [
              { name: 'JavaScript', level: 'advanced', evidence: 'listed in the resume' },
              { name: 'Node.js', level: 'advanced', evidence: 'used in the Nexora project' },
              { name: 'SQL', level: 'intermediate', evidence: 'listed in the resume' },
            ],
            projects: [{ title: 'Nexora', technologies: ['Node.js', 'SQL'] }],
          }),
        };
      },
    });
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();
    useAiProvider('core-loop-test-provider');
  });

  it('propagates evidence through every current core-loop stage', async () => {
    counter += 1;
    const email = `core-loop.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav Shivhare',
      email,
      password: PASSWORD,
    });
    const login = await postJson(server.baseUrl, '/api/auth/login', { email, password: PASSWORD });
    const token = login.body.data.token;

    const profile = await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: {
        career: { targetRole: 'Backend Developer' },
        skills: [
          { name: 'JavaScript', level: 'advanced' },
          { name: 'SQL', level: 'intermediate' },
        ],
        projects: [{ title: 'Nexora', technologies: ['Node.js'] }],
      },
    });
    assert.equal(profile.status, 200);

    const resume = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: RESUME_TEXT },
    });
    assert.equal(resume.status, 201);

    const analysis = await sendWithToken(server.baseUrl, `/api/resumes/${resume.body.data.resume.id}/analysis`, {
      method: 'POST',
      token,
    });
    assert.equal(analysis.status, 200);
    assert.equal(analysis.body.data.resume.analysis.status, 'completed');

    const twin = await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
    assert.equal(twin.status, 200);
    assert.ok(twin.body.data.careerTwin.skills.some((skill) => skill.name === 'Node.js'));

    const recommendations = await getWithToken(server.baseUrl, '/api/careers/recommendations', token);
    assert.equal(recommendations.status, 200);
    assert.ok(recommendations.body.data.matches.some((match) => match.roleId === 'backend-developer'));

    const gap = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/skill-gap',
      token,
    );
    assert.equal(gap.status, 200);
    assert.equal(gap.body.data.gap.skills.find((skill) => skill.name === 'Node.js').status, 'supported');

    const roadmap = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/roadmap',
      token,
    );
    assert.equal(roadmap.status, 200);
    assert.equal(roadmap.body.data.roadmap.goal.roleId, 'backend-developer');

    const readiness = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness',
      token,
    );
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.data.readiness.roleId, 'backend-developer');
    assert.equal(readiness.body.data.readiness.dataStatus, 'fresh');

    const summary = await getWithToken(server.baseUrl, '/api/summary', token);
    assert.equal(summary.status, 200);
    assert.equal(summary.body.data.focusRole.roleId, 'backend-developer');
    assert.ok(summary.body.data.skillGap);
    assert.ok(summary.body.data.roadmap);
  });

  it('keeps summary available when one downstream section fails', async () => {
    counter += 1;
    const email = `core-loop-failure.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Failure Student',
      email,
      password: PASSWORD,
    });
    const login = await postJson(server.baseUrl, '/api/auth/login', { email, password: PASSWORD });
    const token = login.body.data.token;

    const summary = await getWithToken(server.baseUrl, '/api/summary', token);
    assert.equal(summary.status, 200);
    assert.equal(summary.body.success, true);
    assert.equal(summary.body.data.skillGap, null);
    assert.equal(summary.body.data.roadmap, null);
  });
});