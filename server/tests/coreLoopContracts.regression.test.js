import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  clearAssessmentAttempts,
  clearAssessments,
  clearInterviewSessions,
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
import { registerAiProvider, resetAiProviders, useAiProvider } from '../src/services/ai/aiProvider.js';
import { Assessment } from '../src/models/index.js';
import { scoringTestAssessment, correctSubmissionFixture } from './fixtures/assessmentScoringFixtures.js';

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let counter = 0;

describe('G01 — Core-Loop API Contract Freeze Regression Suite', () => {
  before(async () => {
    server = await startTestServer();
    registerAiProvider({
      name: 'g01-mock-provider',
      async complete() {
        return {
          model: 'g01-mock-model',
          text: JSON.stringify({
            skills: [
              { name: 'JavaScript', level: 'advanced', evidence: 'used in fullstack app' },
              { name: 'Node.js', level: 'advanced', evidence: 'built REST services' },
              { name: 'Python', level: 'intermediate', evidence: 'data scripts' },
            ],
            projects: [{ title: 'Nexora Core', technologies: ['Node.js', 'MongoDB'] }],
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
    await clearAssessmentAttempts();
    await clearAssessments();
    await clearInterviewSessions();
    await clearSkillEvidenceChecks();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();
    useAiProvider('g01-mock-provider');

    // Seed scoring assessment
    await Assessment.create({
      assessmentId: scoringTestAssessment.id,
      version: scoringTestAssessment.version,
      skillKey: scoringTestAssessment.skillKey,
      skillName: scoringTestAssessment.skillKey,
      difficulty: scoringTestAssessment.difficulty,
      title: scoringTestAssessment.title,
      description: scoringTestAssessment.description,
      passMark: scoringTestAssessment.passMark,
      timeLimitMinutes: scoringTestAssessment.timeLimitMinutes,
      questions: scoringTestAssessment.questions,
    });
  });

  it('validates the complete response contract across all 13 core-loop domains', async () => {
    counter += 1;
    const email = `contract.student.${Date.now()}.${counter}@example.com`;

    // 1. Auth: register
    const regRes = await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Contract Student',
      email,
      password: PASSWORD,
    });
    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.success, true);
    assert.ok(regRes.body.data.user);
    assert.equal(regRes.body.data.user.email, email);
    assert.equal(regRes.body.data.user.passwordHash, undefined);

    // 1b. Auth: login
    const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.success, true);
    assert.ok(loginRes.body.data.user);
    assert.ok(loginRes.body.data.token);
    const token = loginRes.body.data.token;

    // 1c. Auth: me
    const meRes = await getWithToken(server.baseUrl, '/api/auth/me', token);
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.success, true);
    assert.equal(meRes.body.data.user.email, email);

    // 1d. Auth: logout
    const logoutRes = await sendJsonWithToken(server.baseUrl, '/api/auth/logout', {
      method: 'POST',
      token,
      payload: {},
    });
    assert.equal(logoutRes.status, 200);
    assert.equal(logoutRes.body.success, true);
    assert.ok(logoutRes.body.data.instruction);

    // 2. Profile: read initially empty
    const profileEmpty = await getWithToken(server.baseUrl, '/api/profile', token);
    assert.equal(profileEmpty.status, 200);
    assert.equal(profileEmpty.body.success, true);
    assert.equal(profileEmpty.body.data.exists, false);

    // 2b. Profile: update
    const profileSaved = await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: {
        career: { targetRole: 'Backend Developer' },
        skills: [{ name: 'JavaScript', level: 'advanced' }],
      },
    });
    assert.equal(profileSaved.status, 200);
    assert.equal(profileSaved.body.success, true);
    assert.equal(profileSaved.body.data.exists, true);
    assert.ok(profileSaved.body.data.profile);

    // 3. Resume: create & analysis
    const resumeCreated = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: 'Gaurav Shivhare\nSkills: JavaScript, Node.js, Python' },
    });
    assert.equal(resumeCreated.status, 201);
    assert.equal(resumeCreated.body.success, true);
    assert.ok(resumeCreated.body.data.resume.id);
    const resumeId = resumeCreated.body.data.resume.id;

    const resumeList = await getWithToken(server.baseUrl, '/api/resumes', token);
    assert.equal(resumeList.status, 200);
    assert.equal(resumeList.body.data.count, 1);
    assert.ok(Array.isArray(resumeList.body.data.resumes));

    const resumeAnalyse = await sendWithToken(
      server.baseUrl,
      `/api/resumes/${resumeId}/analysis`,
      { method: 'POST', token },
    );
    assert.equal(resumeAnalyse.status, 200);
    assert.equal(resumeAnalyse.body.data.resume.analysis.status, 'completed');

    // 4. CareerTwin: generate & read
    const twinGenerated = await sendWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token,
    });
    assert.equal(twinGenerated.status, 200);
    assert.equal(twinGenerated.body.data.exists, true);
    assert.ok(twinGenerated.body.data.careerTwin);

    const twinRead = await getWithToken(server.baseUrl, '/api/career-twin', token);
    assert.equal(twinRead.status, 200);
    assert.equal(twinRead.body.data.exists, true);

    // 5. Careers & Recommendations: roles, recommendations, match, skillGap, roadmap, readiness
    const rolesRes = await getWithToken(server.baseUrl, '/api/careers/roles', token);
    assert.equal(rolesRes.status, 200);
    assert.ok(Array.isArray(rolesRes.body.data.roles));

    const recsRes = await getWithToken(server.baseUrl, '/api/careers/recommendations', token);
    assert.equal(recsRes.status, 200);
    assert.ok(Array.isArray(recsRes.body.data.matches));

    const matchRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/match',
      token,
    );
    assert.equal(matchRes.status, 200);
    assert.ok(matchRes.body.data.match);

    const gapRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/skill-gap',
      token,
    );
    assert.equal(gapRes.status, 200);
    assert.ok(gapRes.body.data.gap);

    const roadmapRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/roadmap',
      token,
    );
    assert.equal(roadmapRes.status, 200);
    assert.ok(roadmapRes.body.data.roadmap);

    const readinessRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness',
      token,
    );
    assert.equal(readinessRes.status, 200);
    assert.ok(readinessRes.body.data.readiness);
    assert.equal(readinessRes.body.data.readiness.roleId, 'backend-developer');

    // 6. Opportunities
    const oppRes = await getWithToken(server.baseUrl, '/api/opportunities', token);
    assert.equal(oppRes.status, 200);
    assert.ok(Array.isArray(oppRes.body.data.opportunities));

    // 7. Summary
    const summaryRes = await getWithToken(server.baseUrl, '/api/summary', token);
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.success, true);
    assert.ok(summaryRes.body.data.profile);
    assert.ok(summaryRes.body.data.resumes);
    assert.ok(summaryRes.body.data.careerTwin);

    // 8. Skill Evidence
    const evidenceList = await getWithToken(server.baseUrl, '/api/skill-evidence', token);
    assert.equal(evidenceList.status, 200);
    assert.ok(Array.isArray(evidenceList.body.data.checks));

    // Non-admin cannot record direct evidence
    const unauthEv = await sendJsonWithToken(
      server.baseUrl,
      '/api/skill-evidence/assessments',
      {
        method: 'POST',
        token,
        payload: { skill: 'Node.js', score: 0.9, assessmentId: 'fake-id' },
      },
    );
    assert.equal(unauthEv.status, 403);

    // 9. Assessments: catalog, detail, start attempt, submit attempt
    const asmList = await getWithToken(server.baseUrl, '/api/assessments', token);
    assert.equal(asmList.status, 200);
    assert.ok(Array.isArray(asmList.body.data.assessments));

    const asmDetail = await getWithToken(
      server.baseUrl,
      `/api/assessments/${scoringTestAssessment.id}`,
      token,
    );
    assert.equal(asmDetail.status, 200);
    assert.ok(asmDetail.body.data.assessment);
    // Never leak answer keys
    assert.equal(asmDetail.body.data.assessment.questions[0].correctOptionId, undefined);

    const startAsm = await sendJsonWithToken(
      server.baseUrl,
      `/api/assessments/${scoringTestAssessment.id}/attempts`,
      { method: 'POST', token, payload: {} },
    );
    assert.equal(startAsm.status, 201);
    assert.ok(startAsm.body.data.attempt.id);
    const attemptId = startAsm.body.data.attempt.id;

    // Submit attempt -> verify attempt, result, verification fields
    const submitAsm = await sendJsonWithToken(
      server.baseUrl,
      `/api/assessments/attempts/${attemptId}/submit`,
      {
        method: 'POST',
        token,
        payload: {
          answers: correctSubmissionFixture.answers,
          timeSpentSeconds: 60,
        },
      },
    );
    assert.equal(submitAsm.status, 200);
    assert.ok(submitAsm.body.data.attempt);
    assert.ok(submitAsm.body.data.result, 'Response data must include result object');
    assert.equal(typeof submitAsm.body.data.result.score, 'number');
    assert.ok(submitAsm.body.data.verification !== undefined);
    assert.equal(submitAsm.body.data.attempt.result.passed, true);

    const getAttempt = await getWithToken(
      server.baseUrl,
      `/api/assessments/attempts/${attemptId}`,
      token,
    );
    assert.equal(getAttempt.status, 200);
    assert.equal(getAttempt.body.data.attempt.id, attemptId);
    assert.ok(getAttempt.body.data.attempt.result);

    const listAttempts = await getWithToken(
      server.baseUrl,
      '/api/assessments/attempts',
      token,
    );
    assert.equal(listAttempts.status, 200);
    assert.ok(Array.isArray(listAttempts.body.data.attempts));

    const latestRes = await getWithToken(
      server.baseUrl,
      `/api/assessments/${scoringTestAssessment.id}/latest`,
      token,
    );
    assert.equal(latestRes.status, 200);
    assert.ok(latestRes.body.data.attempt);
    assert.ok(latestRes.body.data.result);

    // 10. Interviews: lifecycle
    const createSession = await sendJsonWithToken(
      server.baseUrl,
      '/api/interviews/sessions',
      {
        method: 'POST',
        token,
        payload: {
          targetRole: 'backend-developer',
          targetSkills: ['JavaScript', 'Node.js'],
          difficulty: 'intermediate',
          questionCount: 3,
        },
      },
    );
    assert.equal(createSession.status, 201);
    assert.ok(createSession.body.data.session.id);
    const sessionId = createSession.body.data.session.id;

    const listSessions = await getWithToken(server.baseUrl, '/api/interviews/sessions', token);
    assert.equal(listSessions.status, 200);
    assert.equal(listSessions.body.data.count, 1);

    const readSession = await getWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${sessionId}`,
      token,
    );
    assert.equal(readSession.status, 200);
    assert.equal(readSession.body.data.session.id, sessionId);

    const startSession = await sendWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${sessionId}/start`,
      { method: 'POST', token },
    );
    assert.equal(startSession.status, 200);
    assert.equal(startSession.body.data.session.status, 'in_progress');

    const abandonSession = await sendWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${sessionId}/abandon`,
      { method: 'POST', token },
    );
    assert.equal(abandonSession.status, 200);
    assert.equal(abandonSession.body.data.session.status, 'abandoned');
  });
});
