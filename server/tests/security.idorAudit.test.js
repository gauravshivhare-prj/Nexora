import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { User } from '../src/models/User.model.js';
import { Resume } from '../src/models/Resume.model.js';
import { Assessment, AssessmentAttempt } from '../src/models/index.js';
import { InterviewSession } from '../src/models/InterviewSession.model.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import { CareerTwin } from '../src/models/CareerTwin.model.js';
import { AuditLog } from '../src/models/AuditLog.model.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { fakePassword } from './helpers/fakeSecrets.js';
import { scoringTestAssessment } from './fixtures/assessmentScoringFixtures.js';
import {
  clearAssessmentAttempts,
  clearAssessments,
  clearAuditLogs,
  clearCareerTwins,
  clearInterviewSessions,
  clearProfiles,
  clearReadinessSnapshots,
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

describe('TASK 32 — RBAC, IDOR & Multi-Tenant Authorization Security Audit', () => {
  let server;
  let counter = 0;
  const PASSWORD = fakePassword();

  before(async () => {
    server = await startTestServer({ suiteId: 'idor_audit' });
  });

  after(async () => {
    if (server) {
      await server.close();
    }
  });

  beforeEach(async () => {
    resetRateLimiters();
    await clearUsers();
    await clearProfiles();
    await clearResumes();
    await clearAssessments();
    await clearAssessmentAttempts();
    await clearInterviewSessions();
    await clearSkillEvidenceChecks();
    await clearCareerTwins();
    await clearReadinessSnapshots();
    await clearAuditLogs();
  });

  async function registerAndLogin(prefix, role = 'student') {
    counter += 1;
    const email = `${prefix}_${counter}_${Date.now()}@example.com`;
    const name = `Test User ${counter}`;

    const regRes = await postJson(server.baseUrl, '/api/auth/register', {
      name,
      email,
      password: PASSWORD,
    });
    assert.equal(regRes.status, 201);
    const userId = regRes.body.data.user.id;

    if (role === 'admin') {
      await User.updateOne({ _id: userId }, { $set: { role: 'admin' } });
    }

    const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    assert.equal(loginRes.status, 200);

    return {
      id: userId,
      email,
      name,
      token: loginRes.body.data.token,
      user: loginRes.body.data.user,
    };
  }

  // ===========================================================================
  // 1. RBAC & Administrative Route Boundary
  // ===========================================================================
  describe('1. Role-Based Access Control (RBAC) & Privilege Separation', () => {
    it('defaults new user registrations to "student" role even if "admin" role is attempted in payload', async () => {
      counter += 1;
      const email = `attacker_${counter}_${Date.now()}@example.com`;

      const regRes = await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Attacker User',
        email,
        password: PASSWORD,
        role: 'admin',
      });
      assert.equal(regRes.status, 201);
      assert.equal(regRes.body.data.user.role, 'student');

      const userInDb = await User.findById(regRes.body.data.user.id);
      assert.equal(userInDb.role, 'student');
    });

    it('rejects student role users from admin endpoints with 403 Forbidden', async () => {
      const student = await registerAndLogin('student_user', 'student');
      const targetUser = await registerAndLogin('target_student', 'student');

      const endpoints = [
        { method: 'GET', path: `/api/admin/consistency/${targetUser.id}` },
        { method: 'POST', path: `/api/admin/consistency/${targetUser.id}/reconcile`, payload: {} },
        { method: 'GET', path: '/api/admin/audit-logs' },
      ];

      for (const ep of endpoints) {
        let res;
        if (ep.method === 'GET') {
          res = await getWithToken(server.baseUrl, ep.path, student.token);
        } else {
          res = await sendJsonWithToken(server.baseUrl, ep.path, {
            method: 'POST',
            token: student.token,
            payload: ep.payload,
          });
        }

        assert.equal(res.status, 403, `Student access to ${ep.path} must return 403 Forbidden`);
        assert.equal(res.body.success, false);
      }
    });

    it('allows admin role users to access admin endpoints and inspect student state', async () => {
      const admin = await registerAndLogin('admin_user', 'admin');
      const targetStudent = await registerAndLogin('target_student', 'student');

      const consistencyRes = await getWithToken(
        server.baseUrl,
        `/api/admin/consistency/${targetStudent.id}`,
        admin.token,
      );
      assert.equal(consistencyRes.status, 200);
      assert.equal(consistencyRes.body.success, true);
      assert.equal(consistencyRes.body.data.userId, targetStudent.id);

      const auditLogsRes = await getWithToken(server.baseUrl, '/api/admin/audit-logs', admin.token);
      assert.equal(auditLogsRes.status, 200);
      assert.equal(auditLogsRes.body.success, true);
      assert(Array.isArray(auditLogsRes.body.data));
    });
  });

  // ===========================================================================
  // 2. Resume IDOR & Cross-Tenant Boundary
  // ===========================================================================
  describe('2. Resume IDOR Isolation', () => {
    it('prevents User B from accessing, analyzing, or deleting User A resume', async () => {
      const userA = await registerAndLogin('user_a_resume');
      const userB = await registerAndLogin('user_b_resume');

      // User A creates a resume
      const createRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
        method: 'POST',
        token: userA.token,
        payload: {
          text: 'Experienced Node.js and TypeScript backend engineer with AWS expertise and microservices background.',
        },
      });
      assert.equal(createRes.status, 201);
      const resumeIdA = createRes.body.data.resume.id;

      // User B tries to read User A's resume
      const readRes = await getWithToken(server.baseUrl, `/api/resumes/${resumeIdA}`, userB.token);
      assert.equal(readRes.status, 404, 'Must return 404 Not Found on cross-tenant resume read');

      // User B tries to trigger analysis on User A's resume
      const analyseRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/resumes/${resumeIdA}/analysis`,
        {
          method: 'POST',
          token: userB.token,
          payload: {},
        },
      );
      assert.equal(analyseRes.status, 404, 'Must return 404 Not Found on cross-tenant analysis');

      // User B tries to delete User A's resume
      const deleteRes = await sendWithToken(server.baseUrl, `/api/resumes/${resumeIdA}`, {
        method: 'DELETE',
        token: userB.token,
      });
      assert.equal(deleteRes.status, 404, 'Must return 404 Not Found on cross-tenant delete');

      // Verify User A can still access their resume untouched
      const verifyRes = await getWithToken(server.baseUrl, `/api/resumes/${resumeIdA}`, userA.token);
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.body.data.resume.id, resumeIdA);

      // Verify User B's resume list does not contain User A's resume
      const listBRes = await getWithToken(server.baseUrl, '/api/resumes', userB.token);
      assert.equal(listBRes.status, 200);
      assert.equal(listBRes.body.data.resumes.length, 0);
    });
  });

  // ===========================================================================
  // 3. Assessment Attempt IDOR & Cross-Tenant Boundary
  // ===========================================================================
  describe('3. Assessment Attempt IDOR Isolation', () => {
    it('prevents User B from reading or submitting User A assessment attempt', async () => {
      const userA = await registerAndLogin('user_a_asm');
      const userB = await registerAndLogin('user_b_asm');

      // Seed an active assessment using valid scoring test fixture
      await Assessment.create({
        ...scoringTestAssessment,
        assessmentId: scoringTestAssessment.id,
      });

      // User A starts attempt
      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token: userA.token,
          payload: {},
        },
      );
      assert.equal(startRes.status, 201);
      const attemptIdA = startRes.body.data.attempt.id;

      // User B attempts to read User A's attempt
      const readRes = await getWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptIdA}`,
        userB.token,
      );
      assert.equal(readRes.status, 404, 'Must return 404 on cross-tenant attempt read');

      // User B attempts to submit User A's attempt
      const submitRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptIdA}/submit`,
        {
          method: 'POST',
          token: userB.token,
          payload: { answers: { q1: 1 } },
        },
      );
      assert.equal(submitRes.status, 404, 'Must return 404 on cross-tenant attempt submission');

      // User B attempt list must be empty
      const listBRes = await getWithToken(server.baseUrl, '/api/assessments/attempts', userB.token);
      assert.equal(listBRes.status, 200);
      assert.equal(listBRes.body.data.attempts.length, 0);

      // User A can read their own attempt
      const readARes = await getWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptIdA}`,
        userA.token,
      );
      assert.equal(readARes.status, 200);
      assert.equal(readARes.body.data.attempt.id, attemptIdA);
    });
  });

  // ===========================================================================
  // 4. Interview Session IDOR Isolation
  // ===========================================================================
  describe('4. Interview Session IDOR Isolation', () => {
    it('prevents User B from viewing, starting, answering, or completing User A interview session', async () => {
      const userA = await registerAndLogin('user_a_interview');
      const userB = await registerAndLogin('user_b_interview');

      // User A creates interview session
      const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: userA.token,
        payload: {
          targetRole: 'Backend Developer',
          targetSkills: ['Node.js'],
          difficulty: 'intermediate',
          questionCount: 3,
        },
      });
      assert.equal(createRes.status, 201);
      const sessionIdA = createRes.body.data.session.id;

      // User B attempts to read User A's session
      const readRes = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionIdA}`,
        userB.token,
      );
      assert.equal(readRes.status, 404, 'Cross-tenant interview session read must return 404');

      // User B attempts to start User A's session
      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionIdA}/start`,
        {
          method: 'POST',
          token: userB.token,
          payload: {},
        },
      );
      assert.equal(startRes.status, 404, 'Cross-tenant interview start must return 404');

      // User B attempts to complete User A's session
      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionIdA}/complete`,
        {
          method: 'POST',
          token: userB.token,
          payload: {},
        },
      );
      assert.equal(completeRes.status, 404, 'Cross-tenant interview complete must return 404');

      // User B attempts to abandon User A's session
      const abandonRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionIdA}/abandon`,
        {
          method: 'POST',
          token: userB.token,
          payload: {},
        },
      );
      assert.equal(abandonRes.status, 404, 'Cross-tenant interview abandon must return 404');

      // User B attempts to get report of User A's session
      const reportRes = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionIdA}/report`,
        userB.token,
      );
      assert.equal(reportRes.status, 404, 'Cross-tenant interview report must return 404');

      // User B session list does not contain User A's session
      const listBRes = await getWithToken(server.baseUrl, '/api/interviews/sessions', userB.token);
      assert.equal(listBRes.status, 200);
      assert.equal(listBRes.body.data.sessions.length, 0);
    });
  });

  // ===========================================================================
  // 5. Cross-Feature Student State Isolation (Profile, Twin, Evidence, Consistency)
  // ===========================================================================
  describe('5. Cross-Feature Multi-Tenant Student State Isolation', () => {
    it('isolates student profile mutations strictly to authenticated user', async () => {
      const userA = await registerAndLogin('user_a_profile');
      const userB = await registerAndLogin('user_b_profile');

      // User A patches profile
      const patchRes = await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token: userA.token,
        payload: {
          career: { targetRole: 'Backend Developer' },
          skills: [{ name: 'JavaScript', level: 'intermediate' }],
        },
      });
      assert.equal(patchRes.status, 200);

      // User B gets profile
      const profileBRes = await getWithToken(server.baseUrl, '/api/profile', userB.token);
      assert.equal(profileBRes.status, 200);
      assert.equal(profileBRes.body.data.exists, false);
      assert.equal(profileBRes.body.data.profile.career.targetRole, null);
      assert.equal(profileBRes.body.data.profile.skills.length, 0);
    });

    it('isolates career twin generation and access between users', async () => {
      const userA = await registerAndLogin('user_a_twin');
      const userB = await registerAndLogin('user_b_twin');

      // Give User A profile data so twin can build
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token: userA.token,
        payload: {
          career: { targetRole: 'Backend Developer' },
          skills: [{ name: 'JavaScript', level: 'intermediate' }],
        },
      });

      // User A generates twin
      const twinARes = await sendJsonWithToken(server.baseUrl, '/api/career-twin/rebuild', {
        method: 'POST',
        token: userA.token,
        payload: {},
      });
      assert.equal(twinARes.status, 200);

      // User B fetches twin
      const twinBRes = await getWithToken(server.baseUrl, '/api/career-twin', userB.token);
      // User B has not generated a twin, so exists: false
      assert.equal(twinBRes.status, 200);
      assert.equal(twinBRes.body.data.exists, false);
      assert.equal(twinBRes.body.data.careerTwin, null);
    });

    it('isolates student consistency self-check to own account', async () => {
      const userA = await registerAndLogin('user_a_cons');
      const userB = await registerAndLogin('user_b_cons');

      const consARes = await getWithToken(server.baseUrl, '/api/student/consistency', userA.token);
      assert.equal(consARes.status, 200);
      assert.equal(consARes.body.data.userId, userA.id);

      const consBRes = await getWithToken(server.baseUrl, '/api/student/consistency', userB.token);
      assert.equal(consBRes.status, 200);
      assert.equal(consBRes.body.data.userId, userB.id);
    });
  });

  // ===========================================================================
  // 6. Immutable Audit Trail Verification
  // ===========================================================================
  describe('6. Security Audit Trail & Event Ledger', () => {
    it('creates immutable audit log on password change', async () => {
      const user = await registerAndLogin('audit_pwd_user');
      const newPassword = fakePassword() + 'New9!';

      const changeRes = await sendJsonWithToken(server.baseUrl, '/api/auth/change-password', {
        method: 'POST',
        token: user.token,
        payload: {
          currentPassword: PASSWORD,
          newPassword,
        },
      });
      assert.equal(changeRes.status, 200);

      // Check audit log in DB
      const logs = await AuditLog.find({ targetUser: user.id, action: 'PASSWORD_CHANGED' });
      assert.equal(logs.length, 1);
      assert.equal(logs[0].actor.toString(), user.id);
      assert.equal(logs[0].actorRole, 'student');
      assert.equal(logs[0].action, 'PASSWORD_CHANGED');
    });

    it('creates audit log when admin inspects student consistency and allows admin to query logs', async () => {
      const admin = await registerAndLogin('audit_admin', 'admin');
      const student = await registerAndLogin('audit_student', 'student');

      // Admin audits student
      const auditRes = await getWithToken(
        server.baseUrl,
        `/api/admin/consistency/${student.id}`,
        admin.token,
      );
      assert.equal(auditRes.status, 200);

      // Admin queries audit logs
      const logsRes = await getWithToken(
        server.baseUrl,
        `/api/admin/audit-logs?targetUser=${student.id}`,
        admin.token,
      );
      assert.equal(logsRes.status, 200);
      assert(logsRes.body.data.length >= 1);
      const auditEntry = logsRes.body.data.find(
        (l) => l.action === 'ADMIN_CONSISTENCY_AUDIT' && l.targetUser === student.id,
      );
      assert(auditEntry, 'Audit log entry must be present for ADMIN_CONSISTENCY_AUDIT');
      assert.equal(auditEntry.actor, admin.id);
      assert.equal(auditEntry.actorRole, 'admin');
    });
  });
});
