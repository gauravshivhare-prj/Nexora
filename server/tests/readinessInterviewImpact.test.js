process.env.MONGODB_URI_TEST = 'mongodb://127.0.0.1:27017/nexora_radhika_r22_test';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  CHECK_KINDS,
  CHECK_OUTCOMES,
  INTERVIEW_PASS_MARK,
} from '../src/domain/evidence/skillEvidenceCheck.js';
import {
  READINESS_CONTRACT_VERSION,
  READINESS_DATA_STATUS,
  READINESS_EVIDENCE_STATUS,
  READINESS_REQUIRED_FIELDS,
} from '../src/domain/readiness/readinessContract.js';
import {
  CareerTwin,
  isCareerTwinStale,
} from '../src/models/index.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import {
  clearCareerTwins,
  clearInterviewSessions,
  clearProfiles,
  clearResumes,
  clearSkillEvidenceChecks,
  clearUsers,
  getWithToken,
  postJson,
  requestWithHeaders,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';

const PASSWORD = 'Str0ngPassphrase1!';
let counter = 0;
let server;

describe('TASK R22 — Readiness Interview Evidence Impact & Deterministic Policy Suite', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearInterviewSessions();
    await clearSkillEvidenceChecks();
    await clearCareerTwins();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();
  });

  async function signUp(label, role = 'student') {
    counter += 1;
    const email = `r22.${label}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: `Student ${label}`,
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    if (role !== 'student') {
      await mongoose.connection.collection('users').updateOne({ email }, { $set: { role } });
    }
    return { token: body.data.token, user: body.data.user };
  }

  // =========================================================================
  // 1. AI-Evaluated Interview Evidence Isolation (Zero Impact on Readiness)
  // =========================================================================
  describe('1. AI-Evaluated Interview Evidence Isolation (Zero Impact on Readiness)', () => {
    it('guarantees AI interview evaluations NEVER increment verified counts or remove skills from blockingSkills', async () => {
      const { token, user } = await signUp('ai-isolation');

      // 1. Setup profile claiming all 4 required backend skills
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'JavaScript', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' },
            { name: 'REST APIs', level: 'intermediate' },
            { name: 'SQL', level: 'intermediate' },
          ],
          career: { targetRole: 'Backend Developer' },
        },
      });

      // 2. Generate baseline CareerTwin
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // 3. Initial readiness check
      const initReadinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(initReadinessRes.status, 200);
      const initReadiness = initReadinessRes.body.data.readiness;
      assert.equal(initReadiness.dataStatus, 'fresh');
      assert.equal(initReadiness.evidenceStatus, 'partial');
      assert.equal(initReadiness.required.total, 4);
      assert.equal(initReadiness.required.verified, 0);
      assert.equal(initReadiness.required.claimed, 4);
      assert.equal(initReadiness.blockingSkills.length, 4);

      // 4. Candidate completes AI interview for Node.js scoring 1.0 (flawless score)
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 1.0,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.UNCERTAIN,
        eligibleForVerified: false,
        evaluatedBy: 'ai',
        reference: 'session_ai_flawless_1',
        completedAt: new Date(),
      });

      // 5. Query readiness: MUST stay fresh, verified MUST stay 0, Node.js MUST stay blocking!
      const postAiRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(postAiRes.status, 200);
      const postAi = postAiRes.body.data.readiness;
      assert.equal(postAi.dataStatus, 'fresh', 'AI interview check must not mark readiness stale');
      assert.equal(postAi.required.verified, 0, 'AI interview check must not increment required.verified');
      assert.equal(postAi.evidenceStatus, 'partial');
      assert.ok(
        postAi.blockingSkills.some((s) => s.key === 'nodejs'),
        'Node.js must remain in blockingSkills after AI interview',
      );

      // 6. Explicit twin regeneration also keeps Node.js unverified in readiness
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
      const regenRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      const regenReadiness = regenRes.body.data.readiness;
      assert.equal(regenReadiness.required.verified, 0);
      assert.ok(regenReadiness.blockingSkills.some((s) => s.key === 'nodejs'));
    });
  });

  // =========================================================================
  // 2. Failing Human Evaluation Isolation (Zero Impact on Readiness)
  // =========================================================================
  describe('2. Failing Human Evaluation Isolation (Zero Impact on Readiness)', () => {
    it('guarantees failing human interview evaluations NEVER increment verified counts or unblock skills', async () => {
      const { token, user } = await signUp('human-fail');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'JavaScript', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' },
            { name: 'REST APIs', level: 'intermediate' },
            { name: 'SQL', level: 'intermediate' },
          ],
        },
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Record failing human interview check (score 0.40, below 0.75 passMark)
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.4,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.FAIL,
        eligibleForVerified: false,
        evaluatedBy: 'human',
        reference: 'session_failed_human',
        completedAt: new Date(),
      });

      const res = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(res.status, 200);
      const readiness = res.body.data.readiness;
      assert.equal(readiness.dataStatus, 'fresh');
      assert.equal(readiness.required.verified, 0);
      assert.ok(readiness.blockingSkills.some((s) => s.key === 'nodejs'));
    });
  });

  // =========================================================================
  // 3. Passing Human Evaluation Deterministic Invalidation & Unblocking
  // =========================================================================
  describe('3. Passing Human Evaluation Deterministic Invalidation & Unblocking', () => {
    it('transitions readiness to stale upon recording passing human check, then increments verified count and unblocks skill upon refresh', async () => {
      const { token, user } = await signUp('human-pass-unblock');

      // 1. Initial profile with claimed required skills
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'JavaScript', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' },
            { name: 'REST APIs', level: 'intermediate' },
            { name: 'SQL', level: 'intermediate' },
          ],
        },
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Initial state: 4 required skills, 0 verified, 4 blocking
      const initRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(initRes.body.data.readiness.dataStatus, 'fresh');
      assert.equal(initRes.body.data.readiness.required.verified, 0);
      assert.equal(initRes.body.data.readiness.blockingSkills.length, 4);

      // 2. Candidate passes human interview for Node.js (score 0.88, passMark 0.75)
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.88,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session_pass_nodejs_human',
        completedAt: new Date(),
      });

      // 3. Immediate readiness check: MUST BE STALE!
      const staleRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(staleRes.status, 200);
      assert.equal(
        staleRes.body.data.readiness.dataStatus,
        'stale',
        'Readiness dataStatus must be stale immediately after verified check',
      );

      // 4. Regenerate CareerTwin to absorb new verified evidence
      const regenTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(regenTwinRes.status, 200);

      // 5. Post-refresh readiness check: MUST BE FRESH and Node.js MUST BE UNBLOCKED!
      const freshRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(freshRes.status, 200);
      const freshReadiness = freshRes.body.data.readiness;
      assert.equal(freshReadiness.dataStatus, 'fresh');
      assert.equal(freshReadiness.required.verified, 1);
      assert.equal(freshReadiness.required.claimed, 3);
      assert.equal(freshReadiness.blockingSkills.length, 3);

      // Node.js is NO LONGER in blockingSkills
      assert.ok(
        !freshReadiness.blockingSkills.some((s) => s.key === 'nodejs'),
        'Node.js must be removed from blockingSkills',
      );

      // Remaining skills stay in blockingSkills
      const blockingKeys = freshReadiness.blockingSkills.map((s) => s.key).sort();
      assert.deepEqual(blockingKeys, ['javascript', 'restapis', 'sql']);
    });
  });

  // =========================================================================
  // 4. Multi-Skill Selective Readiness Projection
  // =========================================================================
  describe('4. Multi-Skill Selective Readiness Projection', () => {
    it('unblocks ONLY passing skills in multi-skill sessions without leaking verified status to failing skills', async () => {
      const { token, user } = await signUp('multi-skill-readiness');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'JavaScript', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' },
            { name: 'REST APIs', level: 'intermediate' },
            { name: 'SQL', level: 'intermediate' },
          ],
        },
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      const now = new Date();
      // JavaScript passes
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'javascript',
        skillName: 'JavaScript',
        score: 0.9,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session_multi_eval_1',
        completedAt: now,
      });

      // SQL fails
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'sql',
        skillName: 'SQL',
        score: 0.45,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.FAIL,
        eligibleForVerified: false,
        evaluatedBy: 'human',
        reference: 'session_multi_eval_1',
        completedAt: now,
      });

      // Refresh twin
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      const res = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(res.status, 200);
      const readiness = res.body.data.readiness;
      assert.equal(readiness.required.verified, 1);
      assert.ok(!readiness.blockingSkills.some((s) => s.key === 'javascript'));
      assert.ok(readiness.blockingSkills.some((s) => s.key === 'sql'));
    });
  });

  // =========================================================================
  // 5. Preferred vs Required Skill Deterministic Impact
  // =========================================================================
  describe('5. Preferred vs Required Skill Deterministic Impact', () => {
    it('passing interview for preferred skill increments preferred.verified without affecting required.verified or blockingSkills', async () => {
      const { token, user } = await signUp('preferred-skill-readiness');

      // Profile claims required + preferred skills
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'JavaScript', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' },
            { name: 'REST APIs', level: 'intermediate' },
            { name: 'SQL', level: 'intermediate' },
            { name: 'MongoDB', level: 'intermediate' }, // Preferred skill for Backend Developer
          ],
        },
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Baseline readiness
      const beforeRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      const before = beforeRes.body.data.readiness;
      assert.equal(before.required.verified, 0);
      assert.equal(before.preferred.verified, 0);
      assert.equal(before.preferred.claimed, 1);
      assert.equal(before.blockingSkills.length, 4);

      // Candidate passes human interview for MongoDB (preferred skill)
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'mongodb',
        skillName: 'MongoDB',
        score: 0.85,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session_mongodb_pass',
        completedAt: new Date(),
      });

      // Regenerate twin
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // After readiness
      const afterRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      const after = afterRes.body.data.readiness;
      // Preferred verified increments
      assert.equal(after.preferred.verified, 1);
      assert.equal(after.preferred.claimed, 0);
      // Required verified and blocking skills are strictly UNAFFECTED
      assert.equal(after.required.verified, 0);
      assert.equal(after.blockingSkills.length, 4);
      assert.equal(after.evidenceStatus, 'partial');
    });
  });

  // =========================================================================
  // 6. Non-Role Skill Isolation
  // =========================================================================
  describe('6. Non-Role Skill Isolation', () => {
    it('passing interview for non-role skill leaves target role readiness completely unaffected', async () => {
      const { token, user } = await signUp('non-role-skill');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'JavaScript', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' },
            { name: 'REST APIs', level: 'intermediate' },
            { name: 'SQL', level: 'intermediate' },
            { name: 'Figma', level: 'intermediate' }, // Non-role skill for Backend Developer
          ],
        },
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Candidate passes interview for Figma
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'figma',
        skillName: 'Figma',
        score: 0.95,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session_figma_pass',
        completedAt: new Date(),
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      const res = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(res.status, 200);
      const readiness = res.body.data.readiness;
      assert.equal(readiness.required.total, 4);
      assert.equal(readiness.required.verified, 0);
      assert.equal(readiness.required.claimed, 4);
      assert.equal(readiness.blockingSkills.length, 4);
      assert.equal(readiness.evidenceStatus, 'partial');
    });
  });

  // =========================================================================
  // 7. Full Required Skill Verification Transition (evidenceStatus: verified)
  // =========================================================================
  describe('7. Full Required Skill Verification Transition (evidenceStatus: verified)', () => {
    it('transitions evidenceStatus to verified and empties blockingSkills when all required skills are verified via interview', async () => {
      const { token, user } = await signUp('full-verification');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'JavaScript', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' },
            { name: 'REST APIs', level: 'intermediate' },
            { name: 'SQL', level: 'intermediate' },
          ],
        },
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Verify all 4 required skills via passing human interviews
      const now = new Date();
      await SkillEvidenceCheck.create([
        {
          user: user.id,
          kind: CHECK_KINDS.INTERVIEW,
          skillKey: 'javascript',
          skillName: 'JavaScript',
          score: 0.85,
          passMark: INTERVIEW_PASS_MARK,
          outcome: CHECK_OUTCOMES.PASS,
          eligibleForVerified: true,
          evaluatedBy: 'human',
          reference: 'session_v1',
          completedAt: now,
        },
        {
          user: user.id,
          kind: CHECK_KINDS.INTERVIEW,
          skillKey: 'nodejs',
          skillName: 'Node.js',
          score: 0.88,
          passMark: INTERVIEW_PASS_MARK,
          outcome: CHECK_OUTCOMES.PASS,
          eligibleForVerified: true,
          evaluatedBy: 'human',
          reference: 'session_v2',
          completedAt: now,
        },
        {
          user: user.id,
          kind: CHECK_KINDS.INTERVIEW,
          skillKey: 'restapis',
          skillName: 'REST APIs',
          score: 0.8,
          passMark: INTERVIEW_PASS_MARK,
          outcome: CHECK_OUTCOMES.PASS,
          eligibleForVerified: true,
          evaluatedBy: 'human',
          reference: 'session_v3',
          completedAt: now,
        },
        {
          user: user.id,
          kind: CHECK_KINDS.INTERVIEW,
          skillKey: 'sql',
          skillName: 'SQL',
          score: 0.9,
          passMark: INTERVIEW_PASS_MARK,
          outcome: CHECK_OUTCOMES.PASS,
          eligibleForVerified: true,
          evaluatedBy: 'human',
          reference: 'session_v4',
          completedAt: now,
        },
      ]);

      // Regenerate twin
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      const res = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(res.status, 200);
      const readiness = res.body.data.readiness;
      assert.equal(readiness.dataStatus, 'fresh');
      assert.equal(readiness.required.verified, 4);
      assert.equal(readiness.required.claimed, 0);
      assert.equal(readiness.required.missing, 0);
      assert.deepEqual(readiness.blockingSkills, []);
      assert.equal(
        readiness.evidenceStatus,
        READINESS_EVIDENCE_STATUS.VERIFIED,
        'evidenceStatus must be verified when all required skills are verified',
      );
    });
  });

  // =========================================================================
  // 8. Intermediate Supported Transition (evidenceStatus: supported)
  // =========================================================================
  describe('8. Intermediate Supported Transition (evidenceStatus: supported)', () => {
    it('evaluates evidenceStatus as supported when all required skills are at least supported and none are claimed or missing', async () => {
      const { token, user } = await signUp('supported-readiness');

      // Profile where all 4 required skills are supported via project evidence
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'JavaScript', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' },
            { name: 'REST APIs', level: 'intermediate' },
            { name: 'SQL', level: 'intermediate' },
          ],
          projects: [
            {
              title: 'Nexora API Platform',
              description: 'Backend platform built with modern technologies.',
              technologies: ['JavaScript', 'Node.js', 'REST APIs', 'SQL'],
            },
          ],
        },
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Initial state: all 4 are supported -> evidenceStatus is 'supported'
      const initRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(initRes.body.data.readiness.evidenceStatus, 'supported');
      assert.equal(initRes.body.data.readiness.required.supported, 4);
      assert.equal(initRes.body.data.readiness.required.verified, 0);
      assert.equal(initRes.body.data.readiness.blockingSkills.length, 4);

      // Verify 1 skill via interview
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.9,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session_sup_1',
        completedAt: new Date(),
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      const midRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      const mid = midRes.body.data.readiness;
      assert.equal(mid.evidenceStatus, 'supported'); // Still supported because not all are verified
      assert.equal(mid.required.verified, 1);
      assert.equal(mid.required.supported, 3);
      assert.equal(mid.blockingSkills.length, 3);
    });
  });

  // =========================================================================
  // 9. Structural Safety, Explainability & Anti-Fabrication Invariants
  // =========================================================================
  describe('9. Structural Safety, Explainability & Anti-Fabrication Invariants', () => {
    it('readiness contains NO scores or percentages and conforms strictly to contract schema', async () => {
      const { token } = await signUp('safety-checks');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [{ name: 'Node.js', level: 'intermediate' }],
        },
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      const res = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(res.status, 200);
      const data = res.body.data.readiness;

      // 1. Required contract fields must be present
      for (const field of READINESS_REQUIRED_FIELDS) {
        assert.ok(field in data, `Expected field ${field} in readiness response`);
      }

      // 2. FORBIDDEN fields: No scores or percentages
      const forbiddenFields = [
        'score',
        'readinessScore',
        'percentage',
        'percentComplete',
        'overallScore',
        'fitScore',
        'matchPercentage',
      ];
      for (const forbidden of forbiddenFields) {
        assert.equal(forbidden in data, false, `Forbidden field "${forbidden}" must not exist in readiness`);
      }

      // 3. Provenance checks
      assert.equal(data.basedOn.contractVersion, READINESS_CONTRACT_VERSION);
      assert.equal(typeof data.basedOn.catalogueVersion, 'number');
      assert.ok(data.basedOn.careerTwinGeneratedAt);

      // 4. Counts are all integers >= 0
      for (const key of ['total', 'missing', 'claimed', 'supported', 'verified']) {
        assert.equal(Number.isInteger(data.required[key]), true);
        assert.ok(data.required[key] >= 0);
      }
    });
  });

  // =========================================================================
  // 10. API Authentication, Validation & Tenant Isolation
  // =========================================================================
  describe('10. API Authentication, Validation & Tenant Isolation', () => {
    it('enforces authentication, validates role existence, and preserves tenant isolation', async () => {
      // 1. Unauthenticated request rejected
      const unauth = await requestWithHeaders(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
      );
      assert.equal(unauth.status, 401);

      // 2. Unknown role rejected with 404
      const studentA = await signUp('student-tenant-a');
      const unknownRole = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/quantum-teleportation-engineer/readiness',
        studentA.token,
      );
      assert.equal(unknownRole.status, 404);

      // 3. Candidate A verifies Node.js
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token: studentA.token,
        payload: { skills: [{ name: 'Node.js', level: 'expert' }] },
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token: studentA.token });

      await SkillEvidenceCheck.create({
        user: studentA.user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.9,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session_student_a',
        completedAt: new Date(),
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token: studentA.token });

      const readinessA = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        studentA.token,
      );
      assert.equal(readinessA.body.data.readiness.required.verified, 1);

      // 4. Candidate B has identical profile but has NOT earned verified evidence
      const studentB = await signUp('student-tenant-b');
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token: studentB.token,
        payload: { skills: [{ name: 'Node.js', level: 'expert' }] },
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token: studentB.token });

      const readinessB = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        studentB.token,
      );
      // Student B's verified count MUST BE 0! No leak across tenants!
      assert.equal(readinessB.body.data.readiness.required.verified, 0);
      assert.ok(readinessB.body.data.readiness.blockingSkills.some((s) => s.key === 'nodejs'));
    });
  });
});
