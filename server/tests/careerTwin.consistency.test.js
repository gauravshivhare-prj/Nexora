import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

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
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import { SkillEvidenceCheck } from '../src/models/index.js';

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let counter = 0;

const RESUME_TEXT = `Gaurav Shivhare
gaurav@example.com | Bhopal

SKILLS
Node.js, Express, MongoDB, JavaScript

PROJECTS
Nexora - career platform built with Node.js and Express.`;

const EXTRACTION = {
  basics: { fullName: 'Gaurav Shivhare', email: 'gaurav@example.com' },
  skills: [{ name: 'Node.js' }, { name: 'MongoDB' }],
  projects: [{ title: 'Nexora', technologies: ['Node.js', 'Express'] }],
};

describe('G08 — CareerTwin Consistency & Stale-Invalidation Suite', () => {
  before(async () => {
    server = await startTestServer();
    registerAiProvider({
      name: 'twin-double-g08',
      async complete(request) {
        if (request.system?.includes('factual summary')) {
          return {
            text: JSON.stringify({ summary: 'You have recorded skills in Node.js and applied them in projects.' }),
            model: 'test-twin-model',
          };
        }
        return { text: JSON.stringify(EXTRACTION), model: 'test-resume-model' };
      },
    });
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    await clearCareerTwins();
    await clearResumes();
    await clearProfiles();
    await clearSkillEvidenceChecks();
    await clearUsers();
    resetRateLimiters();
    useAiProvider('twin-double-g08');
  });

  async function registerAndLogin() {
    counter += 1;
    const email = `twin.cons.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav Consistency',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { email, user: res.body.data.user, token: res.body.data.token };
  }

  it('1. Evidence aggregation: correctly merges claimed, supported, and verified strengths', async () => {
    const { user, token } = await registerAndLogin();

    // 1. Profile: Node.js (claimed), SQL (claimed)
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: {
        career: { targetRole: 'Backend Developer' },
        skills: [{ name: 'Node.js', level: 'intermediate' }, { name: 'SQL', level: 'beginner' }],
      },
    });

    // 2. Resume: Node.js, MongoDB (supported)
    const { body: resumeBody } = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: RESUME_TEXT, label: 'CV' },
    });
    await sendWithToken(server.baseUrl, `/api/resumes/${resumeBody.data.resume.id}/analysis`, {
      method: 'POST',
      token,
    });

    // 3. Evidence check: Node.js (verified)
    await SkillEvidenceCheck.create({
      user: user.id,
      kind: 'assessment',
      skillKey: 'nodejs',
      skillName: 'Node.js',
      score: 0.9,
      passMark: 0.7,
      outcome: 'pass',
      eligibleForVerified: true,
      evaluatedBy: 'assessment-service',
      reference: 'attempt-node-001',
      completedAt: new Date(),
    });

    // Build CareerTwin
    const buildRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token,
    });
    assert.equal(buildRes.status, 200);
    const twin = buildRes.body.data.careerTwin;

    // Node.js should be merged to strongest strength: verified
    const nodeSkill = twin.skills.find((s) => s.key === 'nodejs');
    assert.ok(nodeSkill, 'Node.js skill must be present');
    assert.equal(nodeSkill.strength, 'verified');
    assert.ok(nodeSkill.evidence.length >= 2, 'Must carry multiple evidence sources');

    // Indicators check
    assert.ok(twin.indicators.verified >= 1);
    assert.ok(twin.indicators.supported >= 1);
  });

  it('2. Stale Invalidation: profile update invalidates twin', async () => {
    const { token } = await registerAndLogin();

    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: {
        career: { targetRole: 'Backend Developer' },
        skills: [{ name: 'SQL', level: 'intermediate' }],
      },
    });

    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    const freshRes = await getWithToken(server.baseUrl, '/api/career-twin', token);
    assert.equal(freshRes.body.data.careerTwin.isStale, false);

    // Update profile
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: { personal: { city: 'Bengaluru' } },
    });

    const staleRes = await getWithToken(server.baseUrl, '/api/career-twin', token);
    assert.equal(staleRes.body.data.careerTwin.isStale, true);
    assert.match(staleRes.body.data.careerTwin.staleReasons[0], /profile has changed/i);
  });

  it('3. Stale Invalidation: new verified evidence invalidates twin', async () => {
    const { user, token } = await registerAndLogin();

    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: { skills: [{ name: 'Python', level: 'beginner' }] },
    });

    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    const freshRes = await getWithToken(server.baseUrl, '/api/career-twin', token);
    assert.equal(freshRes.body.data.careerTwin.isStale, false);

    // Record new verified evidence
    await SkillEvidenceCheck.create({
      user: user.id,
      kind: 'assessment',
      skillKey: 'python',
      skillName: 'Python',
      score: 0.85,
      passMark: 0.7,
      outcome: 'pass',
      eligibleForVerified: true,
      evaluatedBy: 'assessment-service',
      reference: 'attempt-py-001',
      completedAt: new Date(Date.now() + 1000),
    });

    const staleRes = await getWithToken(server.baseUrl, '/api/career-twin', token);
    assert.equal(staleRes.body.data.careerTwin.isStale, true);
    assert.match(staleRes.body.data.careerTwin.staleReasons[0], /skill evidence has been recorded/i);
  });

  it('4. Narrative Generation: generates grounded narrative when ?narrative=true', async () => {
    const { token } = await registerAndLogin();

    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: {
        skills: [{ name: 'Node.js', level: 'intermediate' }],
        projects: [{ title: 'Nexora', technologies: ['Node.js'] }],
      },
    });

    const res = await sendWithToken(server.baseUrl, '/api/career-twin?narrative=true', {
      method: 'POST',
      token,
    });
    assert.equal(res.status, 200);
    const narrative = res.body.data.careerTwin.narrative;
    assert.ok(narrative);
    assert.equal(narrative.isModelWritten, true);
    assert.ok(narrative.text.includes('Node.js'));
  });
});
