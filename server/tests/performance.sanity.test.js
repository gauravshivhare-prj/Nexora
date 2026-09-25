import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { PROCESSING_STATUS } from '../src/constants/resumePolicy.js';
import {
  CareerTwin,
  Resume,
  SkillEvidenceCheck,
  StudentProfile,
  User,
  ensureModelIndexes,
} from '../src/models/index.js';
import { getWithToken, sendJsonWithToken, startTestServer } from './helpers/testServer.js';

describe('G24 — Backend Performance Sanity Suite', () => {
  let server;
  let testUser;
  let token;
  const targetRoleId = 'backend-developer';

  before(async () => {
    server = await startTestServer();
    await ensureModelIndexes();
  });

  after(async () => {
    await server.close();
  });

  it('measures baseline latency for core endpoints', async () => {
    // Register a valid user to obtain clean JWT
    const email = `perf.student.${Date.now()}@example.com`;
    const regRes = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Perf Student',
        email,
        password: 'PerfPassword123!',
      }),
    });
    assert.equal(regRes.status, 201);
    const regBody = await regRes.json();
    const userId = regBody.data.user.id;

    const loginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'PerfPassword123!',
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    token = loginBody.data.token;

    // Create profile
    await StudentProfile.create({
      user: userId,
      skills: [
        { name: 'JavaScript', level: 'intermediate' },
        { name: 'Node.js', level: 'intermediate' },
        { name: 'MongoDB', level: 'intermediate' },
        { name: 'Express', level: 'intermediate' },
        { name: 'Git', level: 'beginner' },
      ],
      projects: [
        {
          title: 'API Server',
          description: 'REST API built with Node and Express',
          technologies: ['Node.js', 'Express', 'MongoDB'],
        },
      ],
      career: { targetRole: targetRoleId },
    });

    // Create analyzed resume
    await Resume.create({
      user: userId,
      source: 'pasted_text',
      extractedText: 'Experienced Node.js and MongoDB backend developer with JavaScript expertise.',
      rawText: 'Experienced Node.js and MongoDB backend developer with JavaScript expertise.',
      analysis: {
        status: PROCESSING_STATUS.COMPLETED,
        startedAt: new Date(),
        completedAt: new Date(),
      },
      parsed: {
        skills: [{ name: 'JavaScript' }, { name: 'Node.js' }, { name: 'MongoDB' }],
        projects: [
          {
            title: 'Backend API',
            technologies: ['Node.js', 'MongoDB'],
          },
        ],
      },
    });

    // Generate CareerTwin via POST
    const twinPostStart = Date.now();
    const twinPostRes = await sendJsonWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token,
      payload: {},
    });
    const twinPostDuration = Date.now() - twinPostStart;
    assert.equal(twinPostRes.status, 200);
    assert.ok(twinPostRes.body.data.careerTwin);

    // Warm-up run
    await getWithToken(server.baseUrl, '/api/summary', token);

    // Benchmark 1: GET /api/summary (Unified Dashboard)
    const summaryTimes = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const res = await getWithToken(server.baseUrl, '/api/summary', token);
      summaryTimes.push(Date.now() - start);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.profile);
    }
    const avgSummary = summaryTimes.reduce((a, b) => a + b, 0) / summaryTimes.length;

    // Benchmark 2: GET /api/career-twin
    const twinTimes = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const res = await getWithToken(server.baseUrl, '/api/career-twin', token);
      twinTimes.push(Date.now() - start);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.careerTwin);
    }
    const avgTwin = twinTimes.reduce((a, b) => a + b, 0) / twinTimes.length;

    // Benchmark 3: GET /api/careers/recommendations
    const recTimes = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const res = await getWithToken(server.baseUrl, '/api/careers/recommendations', token);
      recTimes.push(Date.now() - start);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data.matches));
    }
    const avgRec = recTimes.reduce((a, b) => a + b, 0) / recTimes.length;

    // Benchmark 4: GET /api/careers/roles/:roleId/skill-gap
    const gapTimes = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const res = await getWithToken(
        server.baseUrl,
        `/api/careers/roles/${targetRoleId}/skill-gap`,
        token,
      );
      gapTimes.push(Date.now() - start);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.gap);
    }
    const avgGap = gapTimes.reduce((a, b) => a + b, 0) / gapTimes.length;

    // Benchmark 5: GET /api/careers/roles/:roleId/roadmap
    const roadmapTimes = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const res = await getWithToken(
        server.baseUrl,
        `/api/careers/roles/${targetRoleId}/roadmap`,
        token,
      );
      roadmapTimes.push(Date.now() - start);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.roadmap);
    }
    const avgRoadmap = roadmapTimes.reduce((a, b) => a + b, 0) / roadmapTimes.length;

    // Benchmark 6: GET /api/opportunities
    const oppTimes = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const res = await getWithToken(server.baseUrl, '/api/opportunities', token);
      oppTimes.push(Date.now() - start);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data.opportunities));
    }
    const avgOpp = oppTimes.reduce((a, b) => a + b, 0) / oppTimes.length;

    console.log('\n--- G24 Performance Sanity Measurements ---');
    console.log(`POST /api/career-twin:                      ${twinPostDuration}ms`);
    console.log(`GET  /api/summary (Dashboard Avg):          ${avgSummary.toFixed(1)}ms`);
    console.log(`GET  /api/career-twin (Avg):                ${avgTwin.toFixed(1)}ms`);
    console.log(`GET  /api/careers/recommendations (Avg):    ${avgRec.toFixed(1)}ms`);
    console.log(`GET  /api/careers/roles/:id/skill-gap (Avg):${avgGap.toFixed(1)}ms`);
    console.log(`GET  /api/careers/roles/:id/roadmap (Avg):  ${avgRoadmap.toFixed(1)}ms`);
    console.log(`GET  /api/opportunities (Avg):              ${avgOpp.toFixed(1)}ms`);
    console.log('-------------------------------------------\n');

    // Performance bounds: all endpoints should complete well within reasonable SLA (< 2000ms over remote Atlas)
    assert.ok(avgSummary < 2000, `Dashboard average ${avgSummary}ms should be < 2000ms`);
    assert.ok(avgTwin < 1000, `CareerTwin read average ${avgTwin}ms should be < 1000ms`);
    assert.ok(avgRec < 1000, `Recommendations average ${avgRec}ms should be < 1000ms`);
    assert.ok(avgGap < 1000, `Skill gap average ${avgGap}ms should be < 1000ms`);
    assert.ok(avgRoadmap < 1000, `Roadmap average ${avgRoadmap}ms should be < 1000ms`);
    assert.ok(avgOpp < 1000, `Opportunities average ${avgOpp}ms should be < 1000ms`);
  });
});
