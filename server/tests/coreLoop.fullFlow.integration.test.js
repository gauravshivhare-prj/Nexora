import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Assessment } from '../src/models/index.js';
import {
  clearAssessmentAttempts,
  clearAssessments,
  clearCareerTwins,
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
import {
  correctSubmissionFixture,
  scoringTestAssessment,
} from './fixtures/assessmentScoringFixtures.js';

const PASSWORD = 'Str0ngPassphrase1!';
const RESUME_TEXT = `
Gaurav Shivhare
Experienced Software Engineer
Skills: JavaScript, Node.js, REST APIs, SQL
Projects:
Nexora Cloud Platform - High performance backend using Node.js, Express, and MongoDB.
`;

describe('G15 — Core-Loop End-to-End Integration Suite', () => {
  let server;
  let counter = 0;

  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: 'core-loop-full-mock',
      async complete(request) {
        const text = `${request.prompt || ''} ${request.system || ''} ${request.user || ''}`;

        // If request is for interview question answer evaluation
        if (text.includes('rubric') || text.includes('interview') || text.includes('dimensions')) {
          return {
            model: 'mock-evaluator',
            text: JSON.stringify({
              dimensions: {
                accuracy: 0.88,
                depth: 0.82,
                clarity: 0.85,
                relevance: 0.90,
              },
              feedback: 'Solid technical explanation with appropriate context.',
              strengths: ['Clear terminology', 'Addresses question constraints'],
              growthAreas: ['Consider edge cases with backpressure'],
              groundedSkills: ['Node.js'],
            }),
          };
        }

        // Default: Resume analysis extraction
        return {
          model: 'mock-resume-analyser',
          text: JSON.stringify({
            skills: [
              { name: 'JavaScript', level: 'advanced', evidence: 'listed in resume' },
              { name: 'Node.js', level: 'advanced', evidence: 'used in Nexora platform' },
              { name: 'REST APIs', level: 'intermediate', evidence: 'built RESTful APIs' },
              { name: 'SQL', level: 'intermediate', evidence: 'database querying' },
            ],
            projects: [
              { title: 'Nexora Cloud Platform', technologies: ['Node.js', 'JavaScript'] },
            ],
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
    resetRateLimiters();
    await clearAssessmentAttempts();
    await clearAssessments();
    await clearInterviewSessions();
    await clearCareerTwins();
    await clearSkillEvidenceChecks();
    await clearResumes();
    await clearProfiles();
    await clearUsers();

    useAiProvider('core-loop-full-mock');

    // Seed test assessment into MongoDB
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
      isActive: true,
    });
  });

  it('completes the entire core-loop lifecycle across all 11 stages deterministically', async () => {
    counter += 1;
    const email = `coreloop.${Date.now()}.${counter}@example.com`;

    // =========================================================================
    // Stage 1: Auth (Register & Login)
    // =========================================================================
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav CoreLoop',
      email,
      password: PASSWORD,
    });
    const { body: loginBody } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    const token = loginBody.data.token;
    const userId = loginBody.data.user.id;
    assert.ok(token);
    assert.ok(userId);

    // =========================================================================
    // Stage 2: Profile Setup
    // =========================================================================
    const profileRes = await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: {
        career: { targetRole: 'Backend Developer' },
        skills: [
          { name: 'JavaScript', level: 'advanced' },
          { name: 'Node.js', level: 'advanced' },
          { name: 'REST APIs', level: 'intermediate' },
          { name: 'SQL', level: 'intermediate' },
        ],
        projects: [{ title: 'Nexora Cloud', technologies: ['JavaScript', 'Node.js'] }],
      },
    });
    assert.equal(profileRes.status, 200);

    // =========================================================================
    // Stage 3: Resume Upload & Analysis
    // =========================================================================
    const resumeRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: RESUME_TEXT },
    });
    assert.equal(resumeRes.status, 201);
    const resumeId = resumeRes.body.data.resume.id;

    const analysisRes = await sendWithToken(
      server.baseUrl,
      `/api/resumes/${resumeId}/analysis`,
      { method: 'POST', token },
    );
    assert.equal(analysisRes.status, 200);
    assert.equal(analysisRes.body.data.resume.analysis.status, 'completed');

    // =========================================================================
    // Stage 4: Initial CareerTwin Generation
    // =========================================================================
    const twinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token,
    });
    assert.equal(twinRes.status, 200);
    const initialTwin = twinRes.body.data.careerTwin;
    assert.ok(initialTwin);
    assert.ok(initialTwin.skills.some((s) => s.name === 'Node.js'));
    assert.equal(initialTwin.indicators.verified, 0); // No verified evidence yet

    // =========================================================================
    // Stage 5: Career Recommendations
    // =========================================================================
    const recoRes = await getWithToken(server.baseUrl, '/api/careers/recommendations', token);
    assert.equal(recoRes.status, 200);
    const matches = recoRes.body.data.matches;
    assert.ok(matches.length > 0);
    const backendMatch = matches.find((m) => m.roleId === 'backend-developer');
    assert.ok(backendMatch, 'Expected backend-developer in recommendations');

    // =========================================================================
    // Stage 6: Skill Gap Analysis
    // =========================================================================
    const gapRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/skill-gap',
      token,
    );
    assert.equal(gapRes.status, 200);
    const gap = gapRes.body.data.gap;
    assert.equal(gap.roleId, 'backend-developer');
    assert.ok(gap.skills.length >= 4);

    // =========================================================================
    // Stage 7: Personalized Career Roadmap
    // =========================================================================
    const roadmapRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/roadmap',
      token,
    );
    assert.equal(roadmapRes.status, 200);
    const roadmap = roadmapRes.body.data.roadmap;
    assert.equal(roadmap.goal.roleId, 'backend-developer');
    assert.ok(roadmap.items.length > 0);

    // =========================================================================
    // Stage 8: Assessment Engine & Verified Evidence
    // =========================================================================
    const startAttemptRes = await sendJsonWithToken(
      server.baseUrl,
      `/api/assessments/${scoringTestAssessment.id}/attempts`,
      { method: 'POST', token, payload: {} },
    );
    assert.equal(startAttemptRes.status, 201);
    const attemptId = startAttemptRes.body.data.attempt.id;

    const submitAttemptRes = await sendJsonWithToken(
      server.baseUrl,
      `/api/assessments/attempts/${attemptId}/submit`,
      { method: 'POST', token, payload: { answers: correctSubmissionFixture.answers } },
    );
    assert.equal(submitAttemptRes.status, 200);
    assert.equal(submitAttemptRes.body.data.attempt.passed, true);
    assert.equal(submitAttemptRes.body.data.evidenceResult.eligibleForVerified, true);
    assert.ok(submitAttemptRes.body.data.attempt.evidenceCheckId);

    // =========================================================================
    // Stage 9: Interview Practice Session
    // =========================================================================
    const createSessionRes = await sendJsonWithToken(
      server.baseUrl,
      '/api/interviews/sessions',
      {
        method: 'POST',
        token,
        payload: {
          targetRole: 'backend-developer',
          targetSkills: ['Node.js'],
          questionCount: 1,
        },
      },
    );
    assert.equal(createSessionRes.status, 201);
    const sessionId = createSessionRes.body.data.session.id;
    const q1Id = createSessionRes.body.data.session.questions[0].questionId;

    await sendWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${sessionId}/start`,
      { method: 'POST', token },
    );

    const submitAnswerRes = await sendJsonWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${sessionId}/questions/${q1Id}/answers`,
      {
        method: 'POST',
        token,
        payload: {
          answerText: 'Node.js is an event-driven runtime using libuv for asynchronous non-blocking I/O.',
        },
      },
    );
    assert.equal(submitAnswerRes.status, 200);

    const completeSessionRes = await sendJsonWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${sessionId}/complete`,
      { method: 'POST', token, payload: {} },
    );
    assert.equal(completeSessionRes.status, 200);

    // =========================================================================
    // Stage 10: CareerTwin Refresh (Incorporates Verified Evidence)
    // =========================================================================
    const refreshedTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token,
    });
    assert.equal(refreshedTwinRes.status, 200);
    const updatedTwin = refreshedTwinRes.body.data.careerTwin;
    assert.ok(updatedTwin.indicators.verified >= 1);
    const verifiedNode = updatedTwin.skills.find(
      (s) =>
        (s.key === 'nodejs' || s.key === 'node.js' || s.name.toLowerCase() === 'node.js') &&
        s.strength === 'verified',
    );
    assert.ok(verifiedNode, 'Node.js must be upgraded to verified strength');

    // =========================================================================
    // Stage 11: Readiness & Opportunities
    // =========================================================================
    const readinessRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness',
      token,
    );
    assert.equal(readinessRes.status, 200);
    const readiness = readinessRes.body.data.readiness;
    assert.equal(readiness.dataStatus, 'fresh');
    assert.ok(readiness.required.verified >= 1);

    // Opportunity matching requires verified JavaScript & Node.js
    // We already verified Node.js above; add verified JavaScript check to satisfy opportunity eligibility
    const { SkillEvidenceCheck } = await import('../src/models/SkillEvidenceCheck.model.js');
    await SkillEvidenceCheck.create({
      user: userId,
      kind: 'assessment',
      skillKey: 'javascript',
      skillName: 'JavaScript',
      score: 0.95,
      passMark: 0.7,
      outcome: 'pass',
      eligibleForVerified: true,
      evaluatedBy: 'assessment-system',
      reference: 'asm_test',
      completedAt: new Date(),
    });

    // Re-generate twin so JavaScript verified evidence is absorbed
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    const oppRes = await getWithToken(server.baseUrl, '/api/opportunities', token);
    assert.equal(oppRes.status, 200);
    assert.ok(oppRes.body.data.opportunities.length >= 1);
    assert.equal(
      oppRes.body.data.opportunities[0].id,
      'curated_internal:backend-apprenticeship',
    );

    // =========================================================================
    // Stage 12: Unified Dashboard / Summary
    // =========================================================================
    const summaryRes = await getWithToken(server.baseUrl, '/api/summary', token);
    assert.equal(summaryRes.status, 200);
    const summary = summaryRes.body.data;
    assert.equal(summary.focusRole.roleId, 'backend-developer');
    assert.ok(summary.careerTwin);
    assert.ok(summary.skillGap);
    assert.ok(summary.roadmap);
    assert.ok(summary.careerTwin.indicators.verified >= 1);
  });
});
