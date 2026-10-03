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
import { fakePassword } from './helpers/fakeSecrets.js';
import { registerAiProvider, resetAiProviders, useAiProvider } from '../src/services/ai/aiProvider.js';
import {
  correctSubmissionFixture,
  scoringTestAssessment,
} from './fixtures/assessmentScoringFixtures.js';
import {
  STUDENT_PERSONAS,
  assertNonProductionEnvironment,
} from './fixtures/studentPersonas.js';

describe('TASK 47 — Real-Student Multi-Persona Simulation & End-to-End Validation', () => {
  let server;
  let runCounter = 0;
  const suiteId = 'persona-sim';

  before(async () => {
    assertNonProductionEnvironment();
    server = await startTestServer({ suiteId });

    registerAiProvider({
      name: 'persona-sim-provider',
      async complete(request) {
        const text = `${request.prompt || ''} ${request.system || ''} ${request.user || ''}`;

        // Interview evaluation mock
        if (text.includes('rubric') || text.includes('interview') || text.includes('dimensions')) {
          return {
            model: 'mock-evaluator',
            text: JSON.stringify({
              dimensions: {
                accuracy: 0.9,
                depth: 0.85,
                clarity: 0.88,
                relevance: 0.92,
              },
              feedback: 'Demonstrated solid understanding of asynchronous workflows.',
              strengths: ['Accurate explanation', 'Good depth'],
              growthAreas: ['Detail error backoff'],
              groundedSkills: ['Node.js'],
            }),
          };
        }

        // Persona-specific resume extraction
        if (text.includes('Aarav Sharma') || text.includes('NITK')) {
          return {
            model: 'mock-resume-analyser',
            text: JSON.stringify({
              skills: [
                { name: 'Node.js', level: 'intermediate', evidence: 'Campus Food Delivery API' },
                { name: 'Python', level: 'intermediate', evidence: 'Distributed Log Collector' },
                { name: 'Data Structures', level: 'intermediate', evidence: 'CS Coursework' },
                { name: 'SQL', level: 'beginner', evidence: 'Relational schemas' },
                { name: 'Git', level: 'intermediate', evidence: 'Version control' },
              ],
              projects: [
                { title: 'Campus Food Delivery API', technologies: ['Node.js', 'SQL'] },
                { title: 'Distributed Log Collector', technologies: ['Python'] },
              ],
            }),
          };
        }

        if (text.includes('Priya Nair') || text.includes('Literary Journal')) {
          return {
            model: 'mock-resume-analyser',
            text: JSON.stringify({
              skills: [
                { name: 'HTML', level: 'intermediate', evidence: 'Responsive portfolio' },
                { name: 'CSS', level: 'intermediate', evidence: 'CSS Grid layouts' },
                { name: 'JavaScript', level: 'beginner', evidence: 'Basic DOM scripting' },
              ],
              projects: [
                { title: 'Literary Journal Showcase', technologies: ['HTML', 'CSS'] },
              ],
            }),
          };
        }

        if (text.includes('Rohan Varma') || text.includes('CloudScale')) {
          return {
            model: 'mock-resume-analyser',
            text: JSON.stringify({
              skills: [
                { name: 'JavaScript', level: 'advanced', evidence: 'Production UI engineering' },
                { name: 'Node.js', level: 'advanced', evidence: 'CloudScale microservices' },
                { name: 'React', level: 'advanced', evidence: 'Component library design' },
                { name: 'Docker', level: 'intermediate', evidence: 'Containerized sandboxes' },
                { name: 'MongoDB', level: 'advanced', evidence: 'Replica set data store' },
                { name: 'TypeScript', level: 'intermediate', evidence: 'Typed APIs' },
                { name: 'SQL', level: 'intermediate', evidence: 'Relational data queries' },
                { name: 'Git', level: 'advanced', evidence: 'CI/CD pipeline orchestration' },
              ],
              projects: [
                { title: 'Collaborative Code Sandbox', technologies: ['React', 'Node.js', 'Docker', 'MongoDB'] },
              ],
            }),
          };
        }

        // Default empty extraction for minimal or unknown
        return {
          model: 'mock-resume-analyser',
          text: JSON.stringify({
            skills: [],
            projects: [],
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

    useAiProvider('persona-sim-provider');

    // Seed test assessment for evidence checks
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

  async function registerAndLogin(name, email, password) {
    const regRes = await postJson(server.baseUrl, '/api/auth/register', { name, email, password });
    assert.equal(regRes.status, 201);
    const loginRes = await postJson(server.baseUrl, '/api/auth/login', { email, password });
    assert.equal(loginRes.status, 200);
    return {
      userId: loginRes.body.data.user.id,
      token: loginRes.body.data.token,
    };
  }

  it('simulates end-to-end journeys across all 4 synthetic personas with divergent outcomes and zero cross-tenant leakage', async () => {
    runCounter += 1;
    const testPassword = fakePassword();

    // Container for capturing each persona's journey results
    const results = {};

    // =========================================================================
    // 1. PERSONA A: CS Sophomore (Strong Backend Track)
    // =========================================================================
    const csPersona = STUDENT_PERSONAS.csSophomore;
    const csEmail = `${csPersona.emailPrefix}.${Date.now()}.${runCounter}@example.com`;

    const { userId: csUserId, token: csToken } = await registerAndLogin(
      csPersona.name,
      csEmail,
      testPassword,
    );

    // Profile Setup
    const csProfRes = await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token: csToken,
      payload: csPersona.profile,
    });
    assert.equal(csProfRes.status, 200);

    // Resume Upload & Analysis
    const csResumeRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token: csToken,
      payload: { text: csPersona.resumeText },
    });
    assert.equal(csResumeRes.status, 201);
    const csResumeId = csResumeRes.body.data.resume.id;

    const csAnalysisRes = await sendWithToken(server.baseUrl, `/api/resumes/${csResumeId}/analysis`, {
      method: 'POST',
      token: csToken,
    });
    assert.equal(csAnalysisRes.status, 200);

    // Generate CareerTwin
    const csTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token: csToken,
    });
    assert.equal(csTwinRes.status, 200);
    const csTwin = csTwinRes.body.data.careerTwin;
    assert.ok(csTwin.skills.some((s) => s.name === 'Node.js'));

    // Recommendations
    const csRecRes = await getWithToken(server.baseUrl, '/api/careers/recommendations', csToken);
    assert.equal(csRecRes.status, 200);
    const csMatches = csRecRes.body.data.matches;
    const csBackendMatch = csMatches.find((m) => m.roleId === 'backend-developer');
    assert.ok(csBackendMatch, 'Backend Developer must appear in CS Sophomore matches');

    // Readiness for Backend Developer
    const csReadinessRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness?includeScore=true',
      csToken,
    );
    assert.equal(csReadinessRes.status, 200);
    const csReadinessScore = csReadinessRes.body.data.readiness.score.score;

    results.csSophomore = {
      userId: csUserId,
      token: csToken,
      resumeId: csResumeId,
      twin: csTwin,
      matches: csMatches,
      backendScore: csBackendMatch.score,
      readinessScore: csReadinessScore,
    };

    // =========================================================================
    // 2. PERSONA B: Career Changer (Humanities to Frontend)
    // =========================================================================
    const changerPersona = STUDENT_PERSONAS.careerChanger;
    const changerEmail = `${changerPersona.emailPrefix}.${Date.now()}.${runCounter}@example.com`;

    const { userId: changerUserId, token: changerToken } = await registerAndLogin(
      changerPersona.name,
      changerEmail,
      testPassword,
    );

    // Profile Setup
    const changerProfRes = await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token: changerToken,
      payload: changerPersona.profile,
    });
    assert.equal(changerProfRes.status, 200);

    // Resume Upload & Analysis
    const changerResumeRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token: changerToken,
      payload: { text: changerPersona.resumeText },
    });
    assert.equal(changerResumeRes.status, 201);
    const changerResumeId = changerResumeRes.body.data.resume.id;

    const changerAnalysisRes = await sendWithToken(
      server.baseUrl,
      `/api/resumes/${changerResumeId}/analysis`,
      { method: 'POST', token: changerToken },
    );
    assert.equal(changerAnalysisRes.status, 200);

    // Generate CareerTwin
    const changerTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token: changerToken,
    });
    assert.equal(changerTwinRes.status, 200);
    const changerTwin = changerTwinRes.body.data.careerTwin;
    assert.ok(changerTwin.skills.some((s) => s.name === 'HTML'));

    // Recommendations
    const changerRecRes = await getWithToken(server.baseUrl, '/api/careers/recommendations', changerToken);
    assert.equal(changerRecRes.status, 200);
    const changerMatches = changerRecRes.body.data.matches;
    const changerFrontendMatch = changerMatches.find((m) => m.roleId === 'frontend-developer');
    assert.ok(changerFrontendMatch, 'Frontend Developer must appear in Career Changer recommendations');

    // Readiness for Frontend Developer
    const changerReadinessRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/frontend-developer/readiness?includeScore=true',
      changerToken,
    );
    assert.equal(changerReadinessRes.status, 200);
    const changerReadinessScore = changerReadinessRes.body.data.readiness.score.score;

    // Also get Backend Developer score to test domain divergence
    const changerBackendMatch = changerMatches.find((m) => m.roleId === 'backend-developer');

    results.careerChanger = {
      userId: changerUserId,
      token: changerToken,
      resumeId: changerResumeId,
      twin: changerTwin,
      matches: changerMatches,
      frontendScore: changerFrontendMatch.score,
      backendScore: changerBackendMatch ? changerBackendMatch.score : 0,
      readinessScore: changerReadinessScore,
    };

    // =========================================================================
    // 3. PERSONA C: Experienced Graduate Developer (Verified Skills)
    // =========================================================================
    const expPersona = STUDENT_PERSONAS.experiencedDev;
    const expEmail = `${expPersona.emailPrefix}.${Date.now()}.${runCounter}@example.com`;

    const { userId: expUserId, token: expToken } = await registerAndLogin(
      expPersona.name,
      expEmail,
      testPassword,
    );

    // Profile Setup
    const expProfRes = await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token: expToken,
      payload: expPersona.profile,
    });
    assert.equal(expProfRes.status, 200);

    // Resume Upload & Analysis
    const expResumeRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token: expToken,
      payload: { text: expPersona.resumeText },
    });
    assert.equal(expResumeRes.status, 201);
    const expResumeId = expResumeRes.body.data.resume.id;

    const expAnalysisRes = await sendWithToken(
      server.baseUrl,
      `/api/resumes/${expResumeId}/analysis`,
      { method: 'POST', token: expToken },
    );
    assert.equal(expAnalysisRes.status, 200);

    // Initial CareerTwin
    await sendWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token: expToken,
    });

    // Complete an assessment attempt for Node.js to obtain verified skill evidence
    const expAttemptRes = await sendJsonWithToken(
      server.baseUrl,
      `/api/assessments/${scoringTestAssessment.id}/attempts`,
      { method: 'POST', token: expToken, payload: {} },
    );
    assert.equal(expAttemptRes.status, 201);
    const expAttemptId = expAttemptRes.body.data.attempt.id;

    const expSubmitRes = await sendJsonWithToken(
      server.baseUrl,
      `/api/assessments/attempts/${expAttemptId}/submit`,
      { method: 'POST', token: expToken, payload: { answers: correctSubmissionFixture.answers } },
    );
    assert.equal(expSubmitRes.status, 200);
    assert.equal(expSubmitRes.body.data.attempt.passed, true);

    // Rebuild CareerTwin to incorporate verified evidence
    const expRebuildRes = await sendWithToken(server.baseUrl, '/api/career-twin/rebuild', {
      method: 'POST',
      token: expToken,
    });
    assert.equal(expRebuildRes.status, 200);
    const expTwin = expRebuildRes.body.data.careerTwin;
    assert.ok(expTwin.indicators.verified >= 1, 'Experienced dev should have at least 1 verified skill indicator');

    // Recommendations
    const expRecRes = await getWithToken(server.baseUrl, '/api/careers/recommendations', expToken);
    assert.equal(expRecRes.status, 200);
    const expMatches = expRecRes.body.data.matches;
    assert.ok(expMatches.length > 0);

    // Readiness for Full Stack Developer
    const expReadinessRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/full-stack-developer/readiness?includeScore=true',
      expToken,
    );
    assert.equal(expReadinessRes.status, 200);
    const expReadinessScore = expReadinessRes.body.data.readiness.score.score;

    results.experiencedDev = {
      userId: expUserId,
      token: expToken,
      resumeId: expResumeId,
      attemptId: expAttemptId,
      twin: expTwin,
      matches: expMatches,
      readinessScore: expReadinessScore,
    };

    // =========================================================================
    // 4. PERSONA D: Minimal Profile (Cold-Start, Newly Registered)
    // =========================================================================
    const minPersona = STUDENT_PERSONAS.minimalProfile;
    const minEmail = `${minPersona.emailPrefix}.${Date.now()}.${runCounter}@example.com`;

    const { userId: minUserId, token: minToken } = await registerAndLogin(
      minPersona.name,
      minEmail,
      testPassword,
    );

    // Blank profile setup
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token: minToken,
      payload: minPersona.profile,
    });

    // Cold-start guardrail 1: Cannot generate CareerTwin with zero skills, projects, or resumes
    const coldStartTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token: minToken,
    });
    assert.equal(coldStartTwinRes.status, 409, 'Must reject CareerTwin generation when no profile input exists');
    assert.equal(coldStartTwinRes.body.errorCode, 'CAREER_TWIN_NO_INPUT');

    // Cold-start guardrail 2: Cannot get recommendations before CareerTwin is built
    const coldStartRecRes = await getWithToken(server.baseUrl, '/api/careers/recommendations', minToken);
    assert.equal(coldStartRecRes.status, 409, 'Must reject recommendations before CareerTwin exists');
    assert.equal(coldStartRecRes.body.errorCode, 'CAREER_TWIN_NOT_FOUND');

    // Student completes initial onboarding step: adds 1 beginner skill
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token: minToken,
      payload: {
        skills: [{ name: 'Git', level: 'beginner' }],
      },
    });

    // Now CareerTwin can be successfully built
    const minTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token: minToken,
    });
    assert.equal(minTwinRes.status, 200);
    const minTwin = minTwinRes.body.data.careerTwin;
    assert.equal(minTwin.skills.length, 1);
    assert.equal(minTwin.indicators.verified, 0);

    // Recommendations under initial onboarding state
    const minRecRes = await getWithToken(server.baseUrl, '/api/careers/recommendations', minToken);
    assert.equal(minRecRes.status, 200);
    const minMatches = minRecRes.body.data.matches;
    assert.ok(Array.isArray(minMatches));

    // Readiness under initial onboarding state
    const minReadinessRes = await getWithToken(
      server.baseUrl,
      '/api/careers/roles/backend-developer/readiness?includeScore=true',
      minToken,
    );
    assert.equal(minReadinessRes.status, 200);
    const minReadinessScore = minReadinessRes.body.data.readiness.score.score;

    results.minimalProfile = {
      userId: minUserId,
      token: minToken,
      twin: minTwin,
      matches: minMatches,
      readinessScore: minReadinessScore,
    };

    // =========================================================================
    // 5. CROSS-PERSONA VALIDATION & DOMAIN DIVERGENCE AUDIT
    // =========================================================================
    // (a) Readiness hierarchy: Experienced > CS Sophomore > Minimal
    assert.ok(
      results.experiencedDev.readinessScore > results.csSophomore.readinessScore,
      `Experienced (${results.experiencedDev.readinessScore}) must have higher readiness than CS Sophomore (${results.csSophomore.readinessScore})`,
    );
    assert.ok(
      results.csSophomore.readinessScore > results.minimalProfile.readinessScore,
      `CS Sophomore (${results.csSophomore.readinessScore}) must have higher readiness than Minimal (${results.minimalProfile.readinessScore})`,
    );

    // (b) Role domain divergence:
    // CS Sophomore matches backend-developer significantly higher than Career Changer does
    assert.ok(
      results.csSophomore.backendScore > results.careerChanger.backendScore,
      `CS Sophomore backend score (${results.csSophomore.backendScore}) must exceed Career Changer (${results.careerChanger.backendScore})`,
    );

    // Career Changer matches frontend-developer higher than backend-developer
    assert.ok(
      results.careerChanger.frontendScore > results.careerChanger.backendScore,
      `Career Changer frontend score (${results.careerChanger.frontendScore}) must exceed backend score (${results.careerChanger.backendScore})`,
    );

    // =========================================================================
    // 6. MULTI-TENANT ISOLATION & ZERO CROSS-TENANT DATA LEAKAGE
    // =========================================================================
    // Persona D (Minimal) tries to read Persona C's (Experienced) resume
    const leakedResumeRes = await getWithToken(
      server.baseUrl,
      `/api/resumes/${results.experiencedDev.resumeId}`,
      results.minimalProfile.token,
    );
    assert.equal(leakedResumeRes.status, 404, 'Must return 404 on cross-tenant resume access');

    // Persona B (Changer) tries to access Persona C's (Experienced) assessment attempt
    const leakedAttemptRes = await getWithToken(
      server.baseUrl,
      `/api/assessments/attempts/${results.experiencedDev.attemptId}`,
      results.careerChanger.token,
    );
    assert.equal(leakedAttemptRes.status, 404, 'Must return 404 on cross-tenant assessment attempt access');

    // Verify CareerTwin isolation: Minimal twin does not have any skills from other personas
    assert.equal(results.minimalProfile.twin.skills.length, 1);
    assert.equal(results.minimalProfile.twin.skills[0].name, 'Git');

    // Career Changer twin does not have Node.js or Python (from CS Sophomore)
    const changerTwinSkillNames = results.careerChanger.twin.skills.map((s) => s.name);
    assert.equal(changerTwinSkillNames.includes('Python'), false);
  });
});
