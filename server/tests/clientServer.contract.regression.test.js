import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  Assessment,
  AssessmentAttempt,
  CareerTwin,
  InterviewSession,
  Resume,
  SkillEvidenceCheck,
  StudentProfile,
  User,
  ensureModelIndexes,
} from '../src/models/index.js';
import { getWithToken, sendJsonWithToken, sendWithToken, startTestServer } from './helpers/testServer.js';
import { correctSubmissionFixture, scoringTestAssessment } from './fixtures/assessmentScoringFixtures.js';

describe('G25 — Client-Server Contract Regression Suite', () => {
  let server;
  let authToken;
  let testUser;
  let createdResumeId;
  let assessmentId;
  let attemptId;
  let interviewSessionId;

  const targetRoleId = 'backend-developer';

  before(async () => {
    server = await startTestServer();
    await ensureModelIndexes();

    // Register active assessment for assessment contract checks
    await Assessment.deleteMany({});
    const assessmentDoc = await Assessment.create({
      ...scoringTestAssessment,
      assessmentId: scoringTestAssessment.id,
      status: 'active',
    });
    assessmentId = assessmentDoc.assessmentId;
  });

  after(async () => {
    await server.close();
  });

  describe('1. Auth Contract (auth.service.js)', () => {
    const userEmail = `contract.${Date.now()}@example.com`;
    const userPassword = 'ContractPassword123!';

    it('matches POST /api/auth/register contract (data.user)', async () => {
      const res = await fetch(`${server.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Contract User',
          email: userEmail,
          password: userPassword,
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data.user);
      assert.ok(body.data.user.id);
      assert.equal(body.data.user.email, userEmail.toLowerCase());
      assert.equal(body.data.token, undefined, 'Register must not issue a token');
    });

    it('matches POST /api/auth/login contract (data.user and data.token)', async () => {
      const res = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          password: userPassword,
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data.user);
      assert.ok(body.data.token);
      authToken = body.data.token;
      testUser = body.data.user;
    });

    it('matches GET /api/auth/me contract (data.user)', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/auth/me', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.user.id, testUser.id);
      assert.equal(body.data.user.email, userEmail.toLowerCase());
    });

    it('matches POST /api/auth/logout contract', async () => {
      const res = await fetch(`${server.baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
    });
  });

  describe('2. Profile Contract (profile.service.js)', () => {
    it('matches GET /api/profile empty contract before first save', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/profile', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.exists, false);
      assert.ok(body.data.profile);
    });

    it('matches PATCH /api/profile contract (data.profile and exists: true)', async () => {
      const payload = {
        personal: { city: 'Bengaluru', state: 'Karnataka' },
        academic: { collegeName: 'Tech Institute', degree: 'B.Tech', branch: 'CSE', graduationYear: 2026 },
        career: { targetRole: targetRoleId },
        skills: [{ name: 'JavaScript', level: 'intermediate' }, { name: 'Node.js', level: 'intermediate' }],
        projects: [{ title: 'Nexora API', technologies: ['Node.js', 'Express', 'MongoDB'] }],
      };

      const res = await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token: authToken,
        payload,
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.exists, true);
      assert.ok(res.body.data.profile);
      assert.equal(res.body.data.profile.career.targetRole, targetRoleId);
    });
  });

  describe('3. Resume Contract (resume.service.js)', () => {
    it('matches POST /api/resumes contract (data.resume)', async () => {
      const res = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
        method: 'POST',
        token: authToken,
        payload: {
          label: 'Primary CV',
          text: 'Backend software engineer with 2 years of experience building Node.js microservices and MongoDB database schemas.',
        },
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.resume);
      assert.ok(res.body.data.resume.id);
      assert.equal(res.body.data.resume.label, 'Primary CV');
      createdResumeId = res.body.data.resume.id;
    });

    it('matches GET /api/resumes list contract (data.resumes array)', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/resumes', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.resumes));
      assert.ok(body.data.resumes.length >= 1);
    });

    it('matches GET /api/resumes/:id detail contract (data.resume)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        `/api/resumes/${createdResumeId}`,
        authToken,
      );
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.resume);
      assert.ok(body.data.resume.extractedText || body.data.resume.rawText);
    });
  });

  describe('4. CareerTwin Contract (careerTwin.service.js)', () => {
    it('matches POST /api/career-twin contract (data.careerTwin and exists: true)', async () => {
      const res = await sendJsonWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token: authToken,
        payload: {},
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.careerTwin);
      assert.equal(res.body.data.exists, true);
      assert.ok(Array.isArray(res.body.data.careerTwin.skills));
    });

    it('matches GET /api/career-twin contract (data.careerTwin and exists)', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/career-twin', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.careerTwin);
      assert.equal(body.data.exists, true);
    });
  });

  describe('5. Careers, Recommendations & Opportunities Contracts (career.service.js)', () => {
    it('matches GET /api/careers/roles contract (data.roles, data.source)', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/careers/roles', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.roles));
      assert.ok(body.data.source);
    });

    it('matches GET /api/careers/recommendations contract (data.matches, data.basedOn, data.method)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/careers/recommendations',
        authToken,
      );
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.matches));
      assert.ok(body.data.basedOn);
      assert.ok(body.data.method);
    });

    it('matches GET /api/careers/roles/:roleId/skill-gap contract (data.gap, data.basedOn, data.method)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        `/api/careers/roles/${targetRoleId}/skill-gap`,
        authToken,
      );
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.gap);
      assert.ok(body.data.basedOn);
      assert.ok(body.data.method);
    });

    it('matches GET /api/careers/roles/:roleId/roadmap contract (data.roadmap, data.basedOn)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        `/api/careers/roles/${targetRoleId}/roadmap`,
        authToken,
      );
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.roadmap);
      assert.ok(body.data.basedOn);
    });

    it('matches GET /api/careers/roles/:roleId/readiness contract (data.readiness)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        `/api/careers/roles/${targetRoleId}/readiness`,
        authToken,
      );
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.readiness);
      assert.equal(body.data.readiness.roleId, targetRoleId);
    });

    it('matches GET /api/opportunities contract (data.opportunities, data.catalogue, data.method)', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/opportunities', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.opportunities));
      assert.ok(body.data.catalogue);
      assert.ok(body.data.method);
    });
  });

  describe('6. Dashboard Summary Contract (dashboard.service.js)', () => {
    it('matches GET /api/summary contract (data contains profile, resumes, careerTwin, matches, focusRole, skillGap, roadmap, nextStep)', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/summary', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.profile);
      assert.ok(body.data.resumes);
      assert.ok(body.data.careerTwin);
      assert.ok(body.data.matches);
      assert.ok(body.data.focusRole);
      assert.ok(body.data.nextStep);
    });
  });

  describe('7. Assessment Contract (assessment.service.js)', () => {
    it('matches GET /api/assessments contract (data.assessments)', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/assessments', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.assessments));
    });

    it('matches GET /api/assessments/:id contract (data.assessment)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        `/api/assessments/${assessmentId}`,
        authToken,
      );
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.assessment);
      assert.equal(body.data.assessment.assessmentId, assessmentId);
    });

    it('matches POST /api/assessments/:id/attempts contract (data.attempt, data.assessment)', async () => {
      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${assessmentId}/attempts`,
        {
          method: 'POST',
          token: authToken,
          payload: {},
        },
      );

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.attempt);
      assert.ok(res.body.data.attempt.attemptId);
      attemptId = res.body.data.attempt.attemptId;
    });

    it('matches POST /api/assessments/attempts/:id/submit contract (data.attempt, data.result, data.verification)', async () => {
      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token: authToken,
          payload: {
            answers: correctSubmissionFixture.answers,
            timeSpentSeconds: 45,
          },
        },
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.attempt);
      assert.ok(res.body.data.result);
      assert.equal(res.body.data.result.passed, true);
    });

    it('matches GET /api/assessments/attempts/:id contract (data.attempt)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}`,
        authToken,
      );
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.attempt);
    });

    it('matches GET /api/assessments/attempts contract (data.attempts)', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/assessments/attempts', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.attempts));
    });

    it('matches GET /api/assessments/:id/latest contract (data.attempt, data.result)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        `/api/assessments/${assessmentId}/latest`,
        authToken,
      );
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.attempt);
      assert.ok(body.data.result);
    });
  });

  describe('8. Interview Contract (interview.service.js)', () => {
    it('matches POST /api/interviews/sessions contract (data.session)', async () => {
      const res = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: authToken,
        payload: {
          targetRole: targetRoleId,
          targetSkills: ['JavaScript', 'Node.js'],
        },
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.session);
      assert.ok(res.body.data.session.id || res.body.data.session._id);
      interviewSessionId = res.body.data.session.id || res.body.data.session._id;
    });

    it('matches GET /api/interviews/sessions contract (data.sessions)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/interviews/sessions',
        authToken,
      );
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.sessions));
    });

    it('matches GET /api/interviews/sessions/:id contract (data.session)', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${interviewSessionId}`,
        authToken,
      );
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.session);
    });

    it('matches POST /api/interviews/sessions/:id/start contract (data.session)', async () => {
      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${interviewSessionId}/start`,
        {
          method: 'POST',
          token: authToken,
          payload: {},
        },
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.session.status, 'in_progress');
    });

    it('matches POST /api/interviews/sessions/:id/abandon contract (data.session)', async () => {
      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${interviewSessionId}/abandon`,
        {
          method: 'POST',
          token: authToken,
          payload: {},
        },
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.session.status, 'abandoned');
    });
  });
});
