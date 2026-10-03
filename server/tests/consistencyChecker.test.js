import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  RECONCILIATION_ACTIONS,
  VIOLATION_CODES,
  checkConsistency,
} from '../src/domain/student/consistencyChecker.js';
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
import { fakePassword } from './helpers/fakeSecrets.js';
import { User, CareerTwin, SkillEvidenceCheck } from '../src/models/index.js';

describe('TASK 30 — Cross-Feature Intelligence Consistency & Reconciliation Engine', () => {
  describe('Phase 1 — Pure Deterministic Consistency Checker Engine', () => {
    const baseEvidenceCheck = {
      skillKey: 'node_js',
      skillName: 'Node.js',
      outcome: 'pass',
      score: 0.85,
      passMark: 0.7,
      eligibleForVerified: true,
      status: 'active',
      completedAt: new Date('2026-09-01T10:00:00.000Z'),
    };

    const baseTwin = {
      generatedAt: new Date('2026-09-02T10:00:00.000Z'),
      sources: { verifiedEvidenceCount: 1 },
      skills: [
        {
          key: 'node_js',
          name: 'Node.js',
          strength: 'verified',
          evidence: [{ source: 'assessment', strength: 'verified', verified: true, detail: 'Passed assessment' }],
        },
        {
          key: 'javascript',
          name: 'JavaScript',
          strength: 'supported',
          evidence: [{ source: 'project', strength: 'supported', verified: false, detail: 'Project Nexora' }],
        },
      ],
      targetRoles: [{ title: 'Backend Developer', origin: 'student' }],
    };

    const baseGap = {
      roleId: 'backend-developer',
      roleTitle: 'Backend Developer',
      skills: [
        { key: 'node_js', name: 'Node.js', importance: 'required', status: 'verified' },
        { key: 'javascript', name: 'JavaScript', importance: 'required', status: 'supported' },
        { key: 'sql', name: 'SQL', importance: 'required', status: 'missing' },
      ],
    };

    const baseReadiness = {
      roleId: 'backend-developer',
      blockingSkills: [
        { key: 'javascript', name: 'JavaScript', importance: 'required', status: 'supported' },
        { key: 'sql', name: 'SQL', importance: 'required', status: 'missing' },
      ],
    };

    const baseRecommendations = [
      {
        roleId: 'backend-developer',
        role: { id: 'backend-developer', title: 'Backend Developer', requiredSkills: ['Node.js', 'SQL'] },
        score: { overall: 65 },
      },
    ];

    it('returns consistent report with 0 violations for perfectly synchronized state', () => {
      const report = checkConsistency({
        twin: baseTwin,
        gap: baseGap,
        readiness: baseReadiness,
        recommendations: baseRecommendations,
        evidenceChecks: [baseEvidenceCheck],
      });

      assert.equal(report.isConsistent, true);
      assert.equal(report.status, 'consistent');
      assert.equal(report.violationCount, 0);
      assert.equal(report.violations.length, 0);
      assert.equal(report.reconciliationActions.length, 0);
      assert.ok(report.evaluatedAt);
    });

    it('detects TWIN_GAP_SKILL_MISMATCH when CareerTwin verified skill is reported missing in gap', () => {
      const contradictoryGap = {
        roleId: 'backend-developer',
        roleTitle: 'Backend Developer',
        skills: [
          { key: 'node_js', name: 'Node.js', importance: 'required', status: 'missing' }, // Contradiction!
          { key: 'javascript', name: 'JavaScript', importance: 'required', status: 'supported' },
          { key: 'sql', name: 'SQL', importance: 'required', status: 'missing' },
        ],
      };

      const report = checkConsistency({
        twin: baseTwin,
        gap: contradictoryGap,
        evidenceChecks: [baseEvidenceCheck],
      });

      assert.equal(report.isConsistent, false);
      assert.equal(report.status, 'inconsistent');
      const violation = report.violations.find((v) => v.code === VIOLATION_CODES.TWIN_GAP_SKILL_MISMATCH);
      assert.ok(violation, 'Must report TWIN_GAP_SKILL_MISMATCH');
      assert.equal(violation.severity, 'error');
      assert.equal(violation.expected, 'verified');
      assert.equal(violation.actual, 'missing');

      const action = report.reconciliationActions.find((a) => a.action === RECONCILIATION_ACTIONS.REFRESH_GAP);
      assert.ok(action, 'Must suggest REFRESH_GAP reconciliation');
    });

    it('detects UNVERIFIED_EVIDENCE_IN_TWIN when twin claims verified strength without institutional check', () => {
      const unverifiedTwin = {
        ...baseTwin,
        skills: [
          ...baseTwin.skills,
          {
            key: 'docker',
            name: 'Docker',
            strength: 'verified', // Unbacked claim!
            evidence: [{ verified: true, strength: 'verified', detail: 'Falsified check' }],
          },
        ],
      };

      const report = checkConsistency({
        twin: unverifiedTwin,
        evidenceChecks: [baseEvidenceCheck], // only holds node_js
      });

      assert.equal(report.isConsistent, false);
      const violation = report.violations.find((v) => v.code === VIOLATION_CODES.UNVERIFIED_EVIDENCE_IN_TWIN);
      assert.ok(violation, 'Must report UNVERIFIED_EVIDENCE_IN_TWIN');
      assert.equal(violation.severity, 'error');

      const action = report.reconciliationActions.find((a) => a.action === RECONCILIATION_ACTIONS.REBUILD_TWIN);
      assert.ok(action, 'Must suggest REBUILD_TWIN');
    });

    it('detects INVALIDATED_EVIDENCE_IN_TWIN when verified skill references an invalidated check', () => {
      const invalidatedCheck = {
        ...baseEvidenceCheck,
        status: 'invalidated',
      };

      const report = checkConsistency({
        twin: baseTwin,
        evidenceChecks: [invalidatedCheck],
      });

      assert.equal(report.isConsistent, false);
      const violation = report.violations.find((v) => v.code === VIOLATION_CODES.INVALIDATED_EVIDENCE_IN_TWIN);
      assert.ok(violation, 'Must report INVALIDATED_EVIDENCE_IN_TWIN');
    });

    it('detects READINESS_GAP_BLOCKER_MISMATCH when verified skill is reported as a readiness blocker', () => {
      const contradictoryReadiness = {
        roleId: 'backend-developer',
        blockingSkills: [
          { key: 'node_js', name: 'Node.js', importance: 'required', status: 'verified' }, // Contradiction!
          { key: 'sql', name: 'SQL', importance: 'required', status: 'missing' },
        ],
      };

      const report = checkConsistency({
        twin: baseTwin,
        gap: baseGap,
        readiness: contradictoryReadiness,
        evidenceChecks: [baseEvidenceCheck],
      });

      assert.equal(report.isConsistent, false);
      const violation = report.violations.find((v) => v.code === VIOLATION_CODES.READINESS_GAP_BLOCKER_MISMATCH);
      assert.ok(violation, 'Must flag verified skill present in blocking skills');

      const action = report.reconciliationActions.find((a) => a.action === RECONCILIATION_ACTIONS.RECOMPUTE_READINESS);
      assert.ok(action, 'Must suggest RECOMPUTE_READINESS');
    });

    it('detects READINESS_GAP_BLOCKER_MISMATCH when required missing skill is omitted from blockers', () => {
      const incompleteReadiness = {
        roleId: 'backend-developer',
        blockingSkills: [
          // Omits 'sql' which is required and missing in baseGap
          { key: 'javascript', name: 'JavaScript', importance: 'required', status: 'supported' },
        ],
      };

      const report = checkConsistency({
        twin: baseTwin,
        gap: baseGap,
        readiness: incompleteReadiness,
        evidenceChecks: [baseEvidenceCheck],
      });

      assert.equal(report.isConsistent, false);
      const violation = report.violations.find((v) => v.code === VIOLATION_CODES.READINESS_GAP_BLOCKER_MISMATCH);
      assert.ok(violation, 'Must flag omitted required skill from blockers');
    });

    it('detects CANONICAL_TWIN_DIVERGENCE when canonical state has verified skill absent from twin', () => {
      const canonicalStudent = {
        studentId: 'usr-123',
        skills: [
          { key: 'node_js', name: 'Node.js', strength: 'verified' },
          { key: 'python', name: 'Python', strength: 'verified' }, // Divergence!
        ],
      };

      const report = checkConsistency({
        canonicalStudent,
        twin: baseTwin, // only holds node_js and javascript
        evidenceChecks: [baseEvidenceCheck],
      });

      assert.equal(report.isConsistent, false);
      const violation = report.violations.find((v) => v.code === VIOLATION_CODES.CANONICAL_TWIN_DIVERGENCE);
      assert.ok(violation, 'Must report CANONICAL_TWIN_DIVERGENCE');
      assert.equal(violation.severity, 'error');
    });

    it('detects STALE_CAREER_TWIN when evidence check has newer timestamp than twin generation', () => {
      const newerEvidenceCheck = {
        ...baseEvidenceCheck,
        completedAt: new Date('2026-09-10T12:00:00.000Z'), // after baseTwin.generatedAt (2026-09-02)
      };

      const report = checkConsistency({
        twin: baseTwin,
        evidenceChecks: [newerEvidenceCheck],
      });

      // Staleness is a warning, not a hard error
      assert.equal(report.status, 'stale');
      const violation = report.violations.find((v) => v.code === VIOLATION_CODES.STALE_CAREER_TWIN);
      assert.ok(violation, 'Must detect stale CareerTwin');
      assert.equal(violation.severity, 'warning');

      const action = report.reconciliationActions.find((a) => a.action === RECONCILIATION_ACTIONS.REBUILD_TWIN);
      assert.ok(action, 'Must suggest REBUILD_TWIN for staleness');
    });

    it('detects RECOMMENDATION_SCORE_INCONSISTENCY on ungrounded high score with 0 skill matches', () => {
      const anomalousRecommendations = [
        {
          roleId: 'cloud-engineer',
          role: { id: 'cloud-engineer', title: 'Cloud Engineer', requiredSkills: ['Cloud Computing', 'Linux'] },
          score: { overall: 65 }, // Twin has no cloud/linux skills and no target role alignment
        },
      ];

      const report = checkConsistency({
        twin: baseTwin,
        recommendations: anomalousRecommendations,
        evidenceChecks: [baseEvidenceCheck],
      });

      const violation = report.violations.find((v) => v.code === VIOLATION_CODES.RECOMMENDATION_SCORE_INCONSISTENCY);
      assert.ok(violation, 'Must flag ungrounded elevated recommendation score');
      assert.equal(violation.severity, 'warning');
    });
  });

  describe('Phase 2 — Service & API Security Integration Suite', () => {
    let server;
    const PASSWORD = fakePassword();

    before(async () => {
      server = await startTestServer();
    });

    after(async () => {
      await server.close();
    });

    beforeEach(async () => {
      resetRateLimiters();
      await clearCareerTwins();
      await clearSkillEvidenceChecks();
      await clearResumes();
      await clearProfiles();
      await clearUsers();
    });

    async function registerUser(email, role = 'student') {
      await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Consistency Test User',
        email,
        password: PASSWORD,
      });

      if (role === 'admin') {
        await User.updateOne({ email }, { $set: { role: 'admin' } });
      }

      const { body } = await postJson(server.baseUrl, '/api/auth/login', {
        email,
        password: PASSWORD,
      });

      return {
        token: body.data.token,
        userId: body.data.user.id || body.data.user._id,
      };
    }

    it('GET /api/student/consistency: returns consistent report for student with valid profile and twin', async () => {
      const { token, userId } = await registerUser('student.consistency@nexora.test');

      // Populate profile with skills and target role
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          academic: { degree: 'B.Tech', branch: 'Computer Science', graduationYear: 2026 },
          career: { targetRole: 'Backend Developer' },
          skills: [
            { name: 'JavaScript', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' },
          ],
        },
      });

      // Generate CareerTwin
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Student checks own consistency
      const { status, body } = await getWithToken(server.baseUrl, '/api/student/consistency', token);

      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.userId, String(userId));
      assert.equal(body.data.isConsistent, true);
      assert.equal(body.data.status, 'consistent');
      assert.equal(body.data.violationCount, 0);
    });

    it('GET /api/admin/consistency/:userId: allows admin to inspect student consistency', async () => {
      const admin = await registerUser('admin.consistency@nexora.test', 'admin');
      const student = await registerUser('student.to.audit@nexora.test', 'student');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token: student.token,
        payload: {
          career: { targetRole: 'Frontend Developer' },
          skills: [{ name: 'React', level: 'intermediate' }],
        },
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token: student.token });

      const { status, body } = await getWithToken(
        server.baseUrl,
        `/api/admin/consistency/${student.userId}`,
        admin.token,
      );

      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.userId, String(student.userId));
      assert.equal(body.data.isConsistent, true);
    });

    it('RBAC & IDOR: rejects non-admin student attempting to access admin consistency endpoint', async () => {
      const student1 = await registerUser('student1@nexora.test', 'student');
      const student2 = await registerUser('student2@nexora.test', 'student');

      const { status, body } = await getWithToken(
        server.baseUrl,
        `/api/admin/consistency/${student2.userId}`,
        student1.token,
      );

      assert.equal(status, 403);
      assert.equal(body.success, false);
      assert.ok(body.message.includes('permission'));
    });

    it('Authentication Security: rejects unauthenticated consistency request with 401', async () => {
      const response = await fetch(`${server.baseUrl}/api/student/consistency`);
      assert.equal(response.status, 401);
    });

    it('Self-Healing: auto-reconciles out-of-sync CareerTwin via POST /api/student/consistency/reconcile', async () => {
      const { token, userId } = await registerUser('healer@nexora.test');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          career: { targetRole: 'Backend Developer' },
          skills: [{ name: 'Node.js', level: 'intermediate' }],
        },
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Make the initial twin 1 hour old so the subsequent evidence check is newer
      await CareerTwin.updateOne(
        { user: userId },
        { $set: { generatedAt: new Date(Date.now() - 3600000) } },
      );

      // Record a verified institutional evidence check completed after the twin was built
      await SkillEvidenceCheck.create({
        user: userId,
        kind: 'assessment',
        skillKey: 'node_js',
        skillName: 'Node.js',
        score: 0.95,
        passMark: 0.7,
        outcome: 'pass',
        eligibleForVerified: true,
        evaluatedBy: 'institutional_proctor',
        reference: 'asm_test_001',
        completedAt: new Date(),
      });

      // Check consistency without autoReconcile -> should report staleness
      const checkRes = await getWithToken(server.baseUrl, '/api/student/consistency', token);
      assert.equal(checkRes.status, 200);
      assert.equal(checkRes.body.data.status, 'stale');
      assert.ok(
        checkRes.body.data.reconciliationActions.some(
          (a) => a.action === RECONCILIATION_ACTIONS.REBUILD_TWIN,
        ),
      );

      // Now trigger self-healing reconciliation
      const healRes = await sendWithToken(
        server.baseUrl,
        '/api/student/consistency/reconcile',
        { method: 'POST', token },
      );

      assert.equal(healRes.status, 200);
      assert.equal(healRes.body.success, true);
      assert.equal(healRes.body.data.selfHealed, true);
      assert.equal(healRes.body.data.isConsistent, true);
      assert.equal(healRes.body.data.status, 'consistent');

      // Verify the rebuilt twin now holds verified strength for Node.js
      const updatedTwin = await CareerTwin.findOne({ user: userId });
      const nodeSkill = updatedTwin.skills.find(
        (s) => s.key === 'nodejs' || s.name === 'Node.js',
      );
      assert.ok(nodeSkill, 'Node.js must be in CareerTwin');
      assert.equal(nodeSkill.strength, 'verified');
    });
  });
});
