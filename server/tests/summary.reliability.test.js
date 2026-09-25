import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  CareerTwin,
  Resume,
  StudentProfile,
} from '../src/models/index.js';
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
import { registerAiProvider, resetAiProviders, useAiProvider } from '../src/services/ai/aiProvider.js';
import { getSummary } from '../src/services/summary.service.js';

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let counter = 0;

const RESUME_TEXT = `Gaurav Shivhare
gaurav@example.com | Bhopal

SKILLS
Node.js, Express, MongoDB, SQL, JavaScript

PROJECTS
Nexora - a career readiness platform built with Node.js and Express.`;

const EXTRACTION = {
  basics: { fullName: 'Gaurav Shivhare', email: 'gaurav@example.com' },
  skills: [{ name: 'Node.js' }, { name: 'Express' }, { name: 'MongoDB' }],
  projects: [{ title: 'Nexora', technologies: ['Node.js', 'Express'] }],
};

describe('G06 — Dashboard Aggregation & Partial-Failure Reliability Suite', () => {
  before(async () => {
    server = await startTestServer();
    registerAiProvider({
      name: 'test-double-g06',
      async complete() {
        return { text: JSON.stringify(EXTRACTION), model: 'test-model' };
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
    await clearUsers();
    resetRateLimiters();
    useAiProvider('test-double-g06');
  });

  async function registerAndLogin() {
    counter += 1;
    const email = `summary.g06.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav Shivhare',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { email, user: res.body.data.user, token: res.body.data.token };
  }

  async function seedFullData(token) {
    // 1. Profile
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: {
        career: { targetRole: 'Backend Developer' },
        skills: [{ name: 'MongoDB', level: 'intermediate' }, { name: 'SQL', level: 'beginner' }],
        projects: [{ title: 'Nexora', technologies: ['Node.js', 'Express'] }],
        certifications: [],
      },
    });

    // 2. Resume & Analysis
    const { body: resumeBody } = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: RESUME_TEXT, label: 'Backend CV' },
    });
    await sendWithToken(server.baseUrl, `/api/resumes/${resumeBody.data.resume.id}/analysis`, {
      method: 'POST',
      token,
    });

    // 3. Career Twin
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
  }

  it('1. Empty State: returns 200 with clean default sections and COMPLETE_PROFILE prompt', async () => {
    const { token } = await registerAndLogin();
    const res = await getWithToken(server.baseUrl, '/api/summary', token);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.profile.exists, false);
    assert.equal(res.body.data.resumes.total, 0);
    assert.equal(res.body.data.resumes.analysed, 0);
    assert.equal(res.body.data.careerTwin.exists, false);
    assert.equal(res.body.data.matches.exists, false);
    assert.equal(res.body.data.nextStep.code, 'COMPLETE_PROFILE');
  });

  it('2. Full Success: aggregates all sections with single aggregation for resumes', async () => {
    const { token } = await registerAndLogin();
    await seedFullData(token);

    const res = await getWithToken(server.baseUrl, '/api/summary', token);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.profile.exists, true);
    assert.equal(res.body.data.resumes.total, 1);
    assert.equal(res.body.data.resumes.analysed, 1);
    assert.equal(res.body.data.careerTwin.exists, true);
    assert.equal(res.body.data.matches.exists, true);
    assert.ok(res.body.data.matches.top.length > 0);
    assert.ok(res.body.data.focusRole.roleId);
    assert.ok(res.body.data.skillGap.summary);
    assert.ok(res.body.data.roadmap.summary);
  });

  it('3. Partial Failure Isolation: gracefully degrades when CareerTwin service fails', async () => {
    const { user, token } = await registerAndLogin();
    await seedFullData(token);

    const originalFindOne = CareerTwin.findOne;
    try {
      CareerTwin.findOne = () => {
        return Promise.reject(new Error('Simulated transient DB error in CareerTwin'));
      };

      const res = await getWithToken(server.baseUrl, '/api/summary', token);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.profile.exists, true);
      assert.equal(res.body.data.resumes.total, 1);
      assert.equal(res.body.data.careerTwin.exists, false);
    } finally {
      CareerTwin.findOne = originalFindOne;
    }
  });

  it('4. Aggregation Fallback: falls back to countDocuments if Resume.aggregate encounters an issue', async () => {
    const { user, token } = await registerAndLogin();
    await seedFullData(token);

    const originalAggregate = Resume.aggregate;
    try {
      Resume.aggregate = () => {
        return Promise.reject(new Error('Simulated aggregation error'));
      };

      const res = await getWithToken(server.baseUrl, '/api/summary', token);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      // Fallback countDocuments works and returns accurate counts
      assert.equal(res.body.data.resumes.total, 1);
      assert.equal(res.body.data.resumes.analysed, 1);
    } finally {
      Resume.aggregate = originalAggregate;
    }
  });
});
