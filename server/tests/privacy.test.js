import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { logger, sanitizeLogString } from '../src/utils/logger.js';
import { requestLogger } from '../src/middleware/requestLogger.js';
import { fakePassword } from './helpers/fakeSecrets.js';
import {
  clearAiQuotas,
  clearAssessmentAttempts,
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
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';
import {
  AssessmentAttempt,
  AuditLog,
  CareerTwin,
  InterviewSession,
  ReadinessSnapshot,
  Resume,
  SkillEvidenceCheck,
  StudentProfile,
  User,
  UserAiQuota,
} from '../src/models/index.js';

describe('Privacy, Data Minimization & Account Deletion (Task 39)', () => {
  let server;

  before(async () => {
    server = await startTestServer({ suiteId: 'privacy' });
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await clearUsers();
    await clearProfiles();
    await clearResumes();
    await clearCareerTwins();
    await clearSkillEvidenceChecks();
    await clearAssessmentAttempts();
    await clearInterviewSessions();
    await clearReadinessSnapshots();
    await clearAuditLogs();
    await clearAiQuotas();
  });

  describe('GET /api/auth/export (Data Portability)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const response = await fetch(`${server.baseUrl}/api/auth/export`);
      assert.equal(response.status, 401);
    });

    it('exports complete user data across all personal collections without leaking passwordHash or raw files', async () => {
      const password = fakePassword();
      const registerRes = await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Privacy Student',
        email: 'privacy.student@example.com',
        password,
      });
      assert.equal(registerRes.status, 201);

      const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
        email: 'privacy.student@example.com',
        password,
      });
      assert.equal(loginRes.status, 200);
      const { token, user } = loginRes.body.data;
      const userId = user.id;

      // Seed mock records across collections for this user
      await StudentProfile.create({
        user: userId,
        career: { targetRole: 'backend-developer' },
        skills: [{ name: 'Node.js', category: 'backend', level: 'intermediate' }],
      });

      await Resume.create({
        user: userId,
        source: 'pasted_text',
        extractedText: 'Experienced Node.js developer with MongoDB skills.',
        label: 'Primary CV',
        textLength: 50,
      });

      await CareerTwin.create({
        user: userId,
        targetRole: 'backend-developer',
        generatedAt: new Date(),
        skills: [{ name: 'Node.js', key: 'node-js', confidence: 0.85, strength: 'supported', evidenceCount: 1 }],
      });

      await SkillEvidenceCheck.create({
        user: userId,
        kind: 'assessment',
        skillKey: 'node-js',
        skillName: 'Node.js',
        score: 0.85,
        passMark: 0.7,
        outcome: 'pass',
        eligibleForVerified: true,
        evaluatedBy: 'rubric',
        reference: 'asm-node-1',
        completedAt: new Date(),
      });

      await AssessmentAttempt.create({
        user: userId,
        assessmentId: 'asm-node-1',
        attemptNumber: 1,
        skillKey: 'node-js',
        skillName: 'Node.js',
        difficulty: 'intermediate',
        passMark: 0.7,
        status: 'evaluated',
        score: 0.9,
      });

      await InterviewSession.create({
        user: userId,
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        status: 'completed',
        overallScore: 0.88,
      });

      await ReadinessSnapshot.create({
        user: userId,
        roleId: 'backend-developer',
        score: 82,
        evidenceStatus: 'supported',
      });

      await UserAiQuota.create({
        user: userId,
        dateKey: '2026-10-03',
        count: 5,
        costEstimateUsd: 0.0075,
      });

      // Request data export
      const exportRes = await getWithToken(server.baseUrl, '/api/auth/export', token);
      assert.equal(exportRes.status, 200);
      assert.equal(exportRes.body.success, true);

      const data = exportRes.body.data;
      assert.ok(data.exportedAt);
      assert.equal(data.schemaVersion, '1.0.0');

      // Account metadata verified
      assert.equal(data.account.id, userId);
      assert.equal(data.account.name, 'Privacy Student');
      assert.equal(data.account.email, 'privacy.student@example.com');
      assert.equal(data.account.role, 'student');
      assert.equal(data.account.passwordHash, undefined, 'passwordHash must never be exported');

      // Subsystems present
      assert.ok(data.profile);
      assert.equal(data.profile.career.targetRole, 'backend-developer');

      assert.equal(data.resumes.length, 1);
      assert.equal(data.resumes[0].label, 'Primary CV');

      assert.ok(data.careerTwin);
      assert.equal(data.careerTwin.skills.length, 1);
      assert.equal(data.careerTwin.skills[0].name, 'Node.js');

      assert.equal(data.skillEvidence.length, 1);
      assert.equal(data.skillEvidence[0].skillName, 'Node.js');

      assert.equal(data.assessmentAttempts.length, 1);
      assert.equal(data.assessmentAttempts[0].score, 0.9);

      assert.equal(data.interviewSessions.length, 1);
      assert.equal(data.interviewSessions[0].overallScore, 0.88);

      assert.equal(data.readinessSnapshots.length, 1);
      assert.equal(data.readinessSnapshots[0].score, 82);

      assert.equal(data.aiQuota.length, 1);
      assert.equal(data.aiQuota[0].count, 5);

      // Verify no sensitive keys leaked in export JSON string
      const exportString = JSON.stringify(data);
      assert.doesNotMatch(exportString, /passwordHash/i);
      assert.doesNotMatch(exportString, /fileBuffer/i);
    });
  });

  describe('DELETE /api/auth/account (GDPR Right to Erasure)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const response = await fetch(`${server.baseUrl}/api/auth/account`, { method: 'DELETE' });
      assert.equal(response.status, 401);
    });

    it('cascades deletion across all 8 user collections, invalidates future auth, and creates an audit record', async () => {
      const password = fakePassword();
      await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Erasure Candidate',
        email: 'erasure@example.com',
        password,
      });

      const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
        email: 'erasure@example.com',
        password,
      });
      const { token, user } = loginRes.body.data;
      const userId = user.id;

      // Seed items in all 8 user-data collections
      await Promise.all([
        StudentProfile.create({
          user: userId,
          targetRole: 'frontend-developer',
          skills: [{ name: 'React', category: 'frontend', level: 'beginner' }],
        }),
        Resume.create({
          user: userId,
          source: 'pasted_text',
          extractedText: 'Frontend candidate',
          textLength: 18,
        }),
        CareerTwin.create({
          user: userId,
          targetRole: 'frontend-developer',
          generatedAt: new Date(),
        }),
        SkillEvidenceCheck.create({
          user: userId,
          kind: 'assessment',
          skillKey: 'react',
          skillName: 'React',
          score: 0.8,
          passMark: 0.7,
          outcome: 'pass',
          eligibleForVerified: true,
          evaluatedBy: 'rubric',
          reference: 'asm-react-1',
          completedAt: new Date(),
        }),
        AssessmentAttempt.create({
          user: userId,
          assessmentId: 'asm-react-1',
          attemptNumber: 1,
          skillKey: 'react',
          skillName: 'React',
          difficulty: 'intermediate',
          passMark: 0.7,
          status: 'evaluated',
        }),
        InterviewSession.create({
          user: userId,
          targetRole: 'frontend-developer',
          targetSkills: ['React'],
          status: 'completed',
        }),
        ReadinessSnapshot.create({
          user: userId,
          roleId: 'frontend-developer',
          score: 75,
          evidenceStatus: 'supported',
        }),
        UserAiQuota.create({ user: userId, dateKey: '2026-10-03', count: 2 }),
      ]);

      // Verify before deletion: records exist
      assert.equal(await User.countDocuments({ _id: userId }), 1);
      assert.equal(await StudentProfile.countDocuments({ user: userId }), 1);
      assert.equal(await Resume.countDocuments({ user: userId }), 1);
      assert.equal(await CareerTwin.countDocuments({ user: userId }), 1);
      assert.equal(await SkillEvidenceCheck.countDocuments({ user: userId }), 1);
      assert.equal(await AssessmentAttempt.countDocuments({ user: userId }), 1);
      assert.equal(await InterviewSession.countDocuments({ user: userId }), 1);
      assert.equal(await ReadinessSnapshot.countDocuments({ user: userId }), 1);
      assert.equal(await UserAiQuota.countDocuments({ user: userId }), 1);

      // Execute account deletion
      const deleteRes = await sendWithToken(server.baseUrl, '/api/auth/account', {
        method: 'DELETE',
        token,
      });
      assert.equal(deleteRes.status, 200);
      assert.equal(deleteRes.body.success, true);
      assert.match(deleteRes.body.message, /permanently deleted/i);

      // Verify cascading erasure in all 8 collections + User
      assert.equal(await User.countDocuments({ _id: userId }), 0);
      assert.equal(await StudentProfile.countDocuments({ user: userId }), 0);
      assert.equal(await Resume.countDocuments({ user: userId }), 0);
      assert.equal(await CareerTwin.countDocuments({ user: userId }), 0);
      assert.equal(await SkillEvidenceCheck.countDocuments({ user: userId }), 0);
      assert.equal(await AssessmentAttempt.countDocuments({ user: userId }), 0);
      assert.equal(await InterviewSession.countDocuments({ user: userId }), 0);
      assert.equal(await ReadinessSnapshot.countDocuments({ user: userId }), 0);
      assert.equal(await UserAiQuota.countDocuments({ user: userId }), 0);

      // Audit log records the ACCOUNT_DELETED compliance event
      const auditLog = await AuditLog.findOne({
        action: 'ACCOUNT_DELETED',
        targetUser: userId,
      });
      assert.ok(auditLog);
      assert.equal(auditLog.action, 'ACCOUNT_DELETED');
      assert.equal(String(auditLog.targetUser), userId);

      // Subsequent login fails with 401
      const retryLogin = await postJson(server.baseUrl, '/api/auth/login', {
        email: 'erasure@example.com',
        password,
      });
      assert.equal(retryLogin.status, 401);

      // Subsequent request using old token fails immediately
      const retryMe = await getWithToken(server.baseUrl, '/api/auth/me', token);
      assert.equal(retryMe.status, 401);
      assert.match(retryMe.body.message, /no longer exists/i);
    });
  });

  describe('Sensitive-Data Protection & Log Sanitization', () => {
    it('sanitizes email addresses and phone numbers using sanitizeLogString', () => {
      const rawText = 'Contact student at student.secret@nexora.io or call +1 (555) 234-5678 immediately.';
      const sanitized = sanitizeLogString(rawText);
      assert.doesNotMatch(sanitized, /student\.secret@nexora\.io/);
      assert.doesNotMatch(sanitized, /\+1 \(555\) 234-5678/);
      assert.match(sanitized, /\[REDACTED_EMAIL\]/);
      assert.match(sanitized, /\[REDACTED_PHONE\]/);
    });

    it('logger redacts sensitive keys: email, phone, token, and password', () => {
      const logs = [];
      const origInfo = console.log;
      console.log = (line, meta) => logs.push({ line, meta });

      try {
        logger.info('Audit event', {
          userId: 'usr-999',
          email: 'student@example.com',
          phone: '+1 555-0199',
          password: fakePassword(),
          token: fakeSecretValue(),
          details: {
            subEmail: 'inner@example.com',
            publicField: 'safeValue',
          },
        });

        assert.equal(logs.length, 1);
        const meta = logs[0].meta;
        assert.equal(meta.email, '[REDACTED]');
        assert.equal(meta.phone, '[REDACTED]');
        assert.equal(meta.password, '[REDACTED]');
        assert.equal(meta.token, '[REDACTED]');
        assert.equal(meta.details.subEmail, '[REDACTED_EMAIL]');
        assert.equal(meta.details.publicField, 'safeValue');
      } finally {
        console.log = origInfo;
      }
    });

    it('requestLogger cleans sensitive query parameters from logged URLs', (t, done) => {
      const captured = [];
      const origInfo = logger.info;
      logger.info = (msg) => captured.push(msg);

      const fakeReq = {
        id: 'req-test-123',
        method: 'GET',
        originalUrl: '/api/v1/search?token=supersecret123&email=user@test.com&q=nodejs',
        url: '/api/v1/search?token=supersecret123&email=user@test.com&q=nodejs',
      };

      const callbacks = {};
      const fakeRes = {
        statusCode: 200,
        on(event, cb) {
          callbacks[event] = cb;
        },
      };

      try {
        requestLogger(fakeReq, fakeRes, () => {
          // Trigger response finish
          callbacks.finish();
          assert.equal(captured.length, 1);
          assert.doesNotMatch(captured[0], /supersecret123/);
          assert.doesNotMatch(captured[0], /user@test\.com/);
          assert.match(captured[0], /token=\[REDACTED\]/);
          assert.match(captured[0], /email=\[REDACTED\]/);
          assert.match(captured[0], /q=nodejs/);
          done();
        });
      } finally {
        logger.info = origInfo;
      }
    });
  });
});
