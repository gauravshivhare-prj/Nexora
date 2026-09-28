process.env.MONGODB_URI_TEST =
  process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/nexora_radhika_r21_test';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  CHECK_KINDS,
  CHECK_OUTCOMES,
  INTERVIEW_PASS_MARK,
} from '../src/domain/evidence/skillEvidenceCheck.js';
import {
  Assessment,
  AssessmentAttempt,
  CareerTwin,
  isCareerTwinStale,
} from '../src/models/index.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import { InterviewSession } from '../src/models/InterviewSession.model.js';
import {
  loadVerifiedEvidence,
  listEvidenceChecks,
} from '../src/services/skillEvidence.service.js';
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
import {
  correctSubmissionFixture,
  scoringTestAssessment,
} from './fixtures/assessmentScoringFixtures.js';

const PASSWORD = 'Str0ngPassphrase1!';
let counter = 0;
let server;

describe('TASK R21 — Assessment / Interview Evidence Coexistence & Non-Downgrade Suite', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearAssessmentAttempts();
    await clearAssessments();
    await clearInterviewSessions();
    await clearSkillEvidenceChecks();
    await clearCareerTwins();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();

    // Seed canonical assessment fixture for testing
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

  async function signUp(label, role = 'student') {
    counter += 1;
    const email = `r21.${label}.${Date.now()}.${counter}@example.com`;
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
  // 1. Storage-Level Coexistence & Append-Only Invariants
  // =========================================================================
  describe('1. Storage-Level Coexistence & Append-Only Invariants', () => {
    it('stores assessment and interview checks for the same skill as distinct append-only documents', async () => {
      const { user } = await signUp('storage');

      const checkTime1 = new Date('2026-09-20T10:00:00.000Z');
      const checkTime2 = new Date('2026-09-21T10:00:00.000Z');

      const assessmentDoc = await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.ASSESSMENT,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.85,
        passMark: 0.7,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'assessment_engine',
        reference: 'asm_scoring_fixture_node',
        completedAt: checkTime1,
      });

      const interviewDoc = await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.9,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session_interview_ref_123',
        completedAt: checkTime2,
      });

      assert.notEqual(String(assessmentDoc._id), String(interviewDoc._id));
      assert.equal(assessmentDoc.kind, 'assessment');
      assert.equal(interviewDoc.kind, 'interview');

      // Verify both exist independently in the collection
      const docs = await SkillEvidenceCheck.find({ user: user.id, skillKey: 'nodejs' }).sort({ completedAt: 1 });
      assert.equal(docs.length, 2);
      assert.equal(docs[0].reference, 'asm_scoring_fixture_node');
      assert.equal(docs[1].reference, 'session_interview_ref_123');

      // Verify loadVerifiedEvidence loads both without overwriting
      const verified = await loadVerifiedEvidence(user.id);
      assert.equal(verified.length, 2);
      const sources = verified.map((v) => v.evidence.source).sort();
      assert.deepEqual(sources, ['assessment', 'interview']);
    });
  });

  // =========================================================================
  // 2. Non-Downgrade Invariants
  // =========================================================================
  describe('2. Non-Downgrade Invariants', () => {
    it('verified assessment is NOT downgraded or overwritten by a subsequent failing human interview', async () => {
      const { token, user } = await signUp('no-downgrade-asm');

      // 1. Student claims Node.js on profile
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [{ name: 'Node.js', level: 'intermediate' }],
          career: { targetRole: 'Backend Developer' },
        },
      });

      // 2. Student earns verified assessment evidence
      const checkTime1 = new Date('2026-09-20T12:00:00.000Z');
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.ASSESSMENT,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.85,
        passMark: 0.7,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'assessment_engine',
        reference: 'asm_scoring_fixture_node',
        completedAt: checkTime1,
      });

      // 3. Generate CareerTwin: Node.js is verified
      const initTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(initTwinRes.status, 200);
      const initTwin = initTwinRes.body.data.careerTwin;
      const nodeSkill = initTwin.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeSkill);
      assert.equal(nodeSkill.strength, 'verified');
      assert.equal(nodeSkill.evidence[0].source, 'assessment');

      // 4. Student takes a human interview for Node.js and FAILS (score 0.40)
      const checkTime2 = new Date('2026-09-21T12:00:00.000Z');
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
        reference: 'session_failed_interview',
        completedAt: checkTime2,
      });

      // 5. Query CareerTwin: failing check MUST NOT trigger staleness of existing verified twin
      const twinCheckRes = await getWithToken(server.baseUrl, '/api/career-twin', token);
      assert.equal(twinCheckRes.status, 200);
      assert.equal(twinCheckRes.body.data.careerTwin.isStale, false);

      // 6. Regenerate CareerTwin explicitly: Node.js MUST REMAIN verified via assessment
      const regenTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(regenTwinRes.status, 200);
      const regenNode = regenTwinRes.body.data.careerTwin.skills.find((s) => s.key === 'nodejs');
      assert.equal(regenNode.strength, 'verified');
      assert.equal(regenNode.evidence[0].source, 'assessment');
      assert.equal(regenNode.evidence[0].reference, 'asm_scoring_fixture_node');
    });

    it('verified assessment is NOT downgraded by a subsequent AI interview', async () => {
      const { token, user } = await signUp('no-downgrade-ai');

      // Seed verified assessment
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.ASSESSMENT,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.95,
        passMark: 0.7,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'assessment_engine',
        reference: 'asm_scoring_fixture_node',
        completedAt: new Date('2026-09-20T10:00:00.000Z'),
      });

      // Build twin
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Record AI interview (advisory only: outcome uncertain, eligibleForVerified false)
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
        reference: 'session_ai_interview',
        completedAt: new Date('2026-09-21T10:00:00.000Z'),
      });

      // Twin stays fresh and maintains verified assessment strength
      const twinRes = await getWithToken(server.baseUrl, '/api/career-twin', token);
      assert.equal(twinRes.body.data.careerTwin.isStale, false);

      const verified = await loadVerifiedEvidence(user.id);
      assert.equal(verified.length, 1);
      assert.equal(verified[0].evidence.source, 'assessment');
    });

    it('verified human interview is NOT downgraded or overwritten by a subsequent failing assessment', async () => {
      const { token, user } = await signUp('no-downgrade-interview');

      // 1. Student claims Node.js on profile
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [{ name: 'Node.js', level: 'advanced' }],
          career: { targetRole: 'Backend Developer' },
        },
      });

      // 2. Student earns verified human interview evidence
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
        reference: 'session_human_interview_pass',
        completedAt: new Date('2026-09-20T15:00:00.000Z'),
      });

      // 3. Generate initial CareerTwin: Node.js is verified with interview provenance
      const initTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(initTwinRes.status, 200);
      const initNode = initTwinRes.body.data.careerTwin.skills.find((s) => s.key === 'nodejs');
      assert.equal(initNode.strength, 'verified');
      assert.equal(initNode.evidence[0].source, 'interview');
      assert.equal(initNode.evidence[0].reference, 'session_human_interview_pass');

      // 4. Student takes Node.js assessment and FAILS (score 0.35, passMark 0.70)
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.ASSESSMENT,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.35,
        passMark: 0.7,
        outcome: CHECK_OUTCOMES.FAIL,
        eligibleForVerified: false,
        evaluatedBy: 'assessment_engine',
        reference: 'asm_scoring_fixture_node',
        completedAt: new Date('2026-09-21T15:00:00.000Z'),
      });

      // 5. Query CareerTwin: failing assessment MUST NOT mark twin stale
      const twinCheck = await getWithToken(server.baseUrl, '/api/career-twin', token);
      assert.equal(twinCheck.body.data.careerTwin.isStale, false);

      // 6. Regenerate CareerTwin: Node.js MUST REMAIN verified via human interview
      const regenRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(regenRes.status, 200);
      const regenNode = regenRes.body.data.careerTwin.skills.find((s) => s.key === 'nodejs');
      assert.equal(regenNode.strength, 'verified');
      assert.equal(regenNode.evidence[0].source, 'interview');
      assert.equal(regenNode.evidence[0].reference, 'session_human_interview_pass');
    });
  });

  // =========================================================================
  // 3. Dual Verification & Aggregation Coexistence
  // =========================================================================
  describe('3. Dual Verification & Aggregation Coexistence', () => {
    it('aggregates both assessment and interview evidence when both pass, increasing sourceCount and preserving all provenance', async () => {
      const { token, user } = await signUp('dual-verify');

      // 1. Initial profile
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [{ name: 'Node.js', level: 'intermediate' }],
          career: { targetRole: 'Backend Developer' },
        },
      });

      // 2. First verified check: Assessment passes
      const t1 = new Date('2026-09-20T08:00:00.000Z');
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.ASSESSMENT,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.85,
        passMark: 0.7,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'assessment_engine',
        reference: 'asm_node_attempt_1',
        completedAt: t1,
      });

      // 3. Generate initial twin with 1 verified source
      const twin1Res = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(twin1Res.status, 200);
      const twin1Node = twin1Res.body.data.careerTwin.skills.find((s) => s.key === 'nodejs');
      assert.equal(twin1Node.strength, 'verified');
      assert.equal(twin1Node.sourceCount, 2); // 1 self_declared + 1 assessment
      assert.equal(twin1Node.evidence.length, 2);

      // 4. Second verified check: Human interview passes
      const t2 = new Date('2026-09-22T08:00:00.000Z');
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.92,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session_interview_pass_2',
        completedAt: t2,
      });

      // 5. Query CareerTwin: MUST be marked stale because new verified evidence arrived!
      const staleCheck = await getWithToken(server.baseUrl, '/api/career-twin', token);
      assert.equal(staleCheck.status, 200);
      assert.equal(staleCheck.body.data.careerTwin.isStale, true);
      assert.ok(staleCheck.body.data.careerTwin.staleReasons.some((r) => r.includes('skill evidence')));

      // 6. Regenerate CareerTwin: MUST now contain BOTH assessment AND interview evidence
      const twin2Res = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(twin2Res.status, 200);
      const twin2Node = twin2Res.body.data.careerTwin.skills.find((s) => s.key === 'nodejs');
      assert.equal(twin2Node.strength, 'verified');
      assert.equal(twin2Node.sourceCount, 3); // self_declared + assessment + interview

      // Both verified evidence objects must exist in the evidence array
      const hasAssessment = twin2Node.evidence.some(
        (e) => e.source === 'assessment' && e.strength === 'verified' && e.reference === 'asm_node_attempt_1',
      );
      const hasInterview = twin2Node.evidence.some(
        (e) => e.source === 'interview' && e.strength === 'verified' && e.reference === 'session_interview_pass_2',
      );
      assert.ok(hasAssessment, 'Expected assessment evidence to be present');
      assert.ok(hasInterview, 'Expected interview evidence to be present');

      // Distinct verified skills count in twin indicators remains 1
      assert.equal(twin2Res.body.data.careerTwin.indicators.verified, 1);
    });

    it('reverse order: passing human interview followed by passing assessment coexists seamlessly', async () => {
      const { token, user } = await signUp('reverse-dual-verify');

      // 1. Initial human interview pass
      const t1 = new Date('2026-09-18T10:00:00.000Z');
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.8,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session_interview_first',
        completedAt: t1,
      });

      // 2. Generate initial twin
      const twin1 = await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
      assert.equal(twin1.status, 200);
      assert.equal(twin1.body.data.careerTwin.skills[0].strength, 'verified');

      // 3. Passing assessment arrives second
      const t2 = new Date('2026-09-23T10:00:00.000Z');
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.ASSESSMENT,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.9,
        passMark: 0.7,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'assessment_engine',
        reference: 'asm_scoring_fixture_node',
        completedAt: t2,
      });

      // 4. Twin reports stale
      const checkStale = await getWithToken(server.baseUrl, '/api/career-twin', token);
      assert.equal(checkStale.body.data.careerTwin.isStale, true);

      // 5. Regenerated twin contains both
      const twin2 = await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
      const node = twin2.body.data.careerTwin.skills.find((s) => s.key === 'nodejs');
      assert.equal(node.strength, 'verified');
      assert.ok(node.evidence.some((e) => e.source === 'interview'));
      assert.ok(node.evidence.some((e) => e.source === 'assessment'));
    });
  });

  // =========================================================================
  // 4. Complementary Cross-Skill Verification & Role Readiness
  // =========================================================================
  describe('4. Complementary Cross-Skill Verification & Role Readiness', () => {
    it('unblocks required role skills and readiness when Skill A is verified via assessment and Skill B is verified via interview', async () => {
      const { token, user } = await signUp('cross-skill');

      // 1. Student profile claims Node.js and SQL targeting Backend Developer
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'Node.js', level: 'intermediate' },
            { name: 'SQL', level: 'intermediate' },
          ],
          career: { targetRole: 'Backend Developer' },
        },
      });

      // 2. Student earns assessment evidence for Node.js
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.ASSESSMENT,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.88,
        passMark: 0.7,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'assessment_engine',
        reference: 'asm_node_cross_skill',
        completedAt: new Date('2026-09-21T09:00:00.000Z'),
      });

      // 3. Student earns human interview evidence for SQL
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'sql',
        skillName: 'SQL',
        score: 0.85,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session_sql_cross_skill',
        completedAt: new Date('2026-09-22T09:00:00.000Z'),
      });

      // 4. Generate CareerTwin
      const twinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(twinRes.status, 200);
      const twin = twinRes.body.data.careerTwin;
      assert.equal(twin.indicators.verified, 2);

      const nodeSkill = twin.skills.find((s) => s.key === 'nodejs');
      const sqlSkill = twin.skills.find((s) => s.key === 'sql');
      assert.equal(nodeSkill.strength, 'verified');
      assert.equal(nodeSkill.evidence[0].source, 'assessment');
      assert.equal(sqlSkill.strength, 'verified');
      assert.equal(sqlSkill.evidence[0].source, 'interview');

      // 5. Query SkillGap for backend-developer: both skills MUST show verified with zero suggestions
      const gapRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/skill-gap',
        token,
      );
      assert.equal(gapRes.status, 200);
      const gap = gapRes.body.data.gap;
      const nodeGap = gap.skills.find((s) => s.key === 'nodejs');
      const sqlGap = gap.skills.find((s) => s.key === 'sql');
      assert.equal(nodeGap.status, 'verified');
      assert.equal(sqlGap.status, 'verified');
      assert.deepEqual(nodeGap.suggestedEvidence, []);
      assert.deepEqual(sqlGap.suggestedEvidence, []);

      // 6. Query Readiness for backend-developer: both verified skills count towards readiness
      const readinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(readinessRes.status, 200);
      const readiness = readinessRes.body.data.readiness;
      assert.equal(readiness.dataStatus, 'fresh');
      assert.equal(readiness.required.verified, 2);
      assert.ok(!readiness.blockingSkills.some((s) => s.key === 'nodejs'));
      assert.ok(!readiness.blockingSkills.some((s) => s.key === 'sql'));
    });
  });

  // =========================================================================
  // 5. Upgrade Invariants (Failure / Advisory to Verified)
  // =========================================================================
  describe('5. Upgrade Invariants (Failure / Advisory to Verified)', () => {
    it('promotes skill from failing assessment to verified when subsequent human interview passes', async () => {
      const { token, user } = await signUp('upgrade-asm-to-interview');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: { skills: [{ name: 'Node.js', level: 'beginner' }] },
      });

      // 1. Failing assessment
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.ASSESSMENT,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.4,
        passMark: 0.7,
        outcome: CHECK_OUTCOMES.FAIL,
        eligibleForVerified: false,
        evaluatedBy: 'assessment_engine',
        reference: 'asm_fail_1',
        completedAt: new Date('2026-09-19T10:00:00.000Z'),
      });

      const twin1 = await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
      assert.equal(twin1.body.data.careerTwin.skills[0].strength, 'claimed');

      // 2. Passing human interview
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.82,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session_pass_interview',
        completedAt: new Date('2026-09-24T10:00:00.000Z'),
      });

      const twin2 = await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
      const node = twin2.body.data.careerTwin.skills.find((s) => s.key === 'nodejs');
      assert.equal(node.strength, 'verified');
      assert.equal(node.evidence[0].source, 'interview');
    });

    it('promotes skill from failing human interview to verified when subsequent assessment passes', async () => {
      const { token, user } = await signUp('upgrade-interview-to-asm');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: { skills: [{ name: 'Node.js', level: 'beginner' }] },
      });

      // 1. Failing human interview
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.45,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.FAIL,
        eligibleForVerified: false,
        evaluatedBy: 'human',
        reference: 'session_fail_interview',
        completedAt: new Date('2026-09-19T10:00:00.000Z'),
      });

      const twin1 = await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
      assert.equal(twin1.body.data.careerTwin.skills[0].strength, 'claimed');

      // 2. Passing assessment
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.ASSESSMENT,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.88,
        passMark: 0.7,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'assessment_engine',
        reference: 'asm_pass_1',
        completedAt: new Date('2026-09-24T10:00:00.000Z'),
      });

      const twin2 = await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
      const node = twin2.body.data.careerTwin.skills.find((s) => s.key === 'nodejs');
      assert.equal(node.strength, 'verified');
      assert.equal(node.evidence[0].source, 'assessment');
    });
  });

  // =========================================================================
  // 6. API Contracts, Isolation & Security
  // =========================================================================
  describe('6. API Contracts, Isolation & Security', () => {
    it('GET /api/skill-evidence returns full coexistence history chronologically sorted newest-first', async () => {
      const { token, user } = await signUp('history');

      const t1 = new Date('2026-09-20T10:00:00.000Z');
      const t2 = new Date('2026-09-21T10:00:00.000Z');
      const t3 = new Date('2026-09-22T10:00:00.000Z');

      await SkillEvidenceCheck.create([
        {
          user: user.id,
          kind: CHECK_KINDS.ASSESSMENT,
          skillKey: 'nodejs',
          skillName: 'Node.js',
          score: 0.85,
          passMark: 0.7,
          outcome: CHECK_OUTCOMES.PASS,
          eligibleForVerified: true,
          evaluatedBy: 'assessment_engine',
          reference: 'asm_ref_1',
          completedAt: t1,
        },
        {
          user: user.id,
          kind: CHECK_KINDS.INTERVIEW,
          skillKey: 'nodejs',
          skillName: 'Node.js',
          score: 0.5,
          passMark: INTERVIEW_PASS_MARK,
          outcome: CHECK_OUTCOMES.FAIL,
          eligibleForVerified: false,
          evaluatedBy: 'human',
          reference: 'session_ref_2',
          completedAt: t2,
        },
        {
          user: user.id,
          kind: CHECK_KINDS.INTERVIEW,
          skillKey: 'sql',
          skillName: 'SQL',
          score: 0.95,
          passMark: INTERVIEW_PASS_MARK,
          outcome: CHECK_OUTCOMES.PASS,
          eligibleForVerified: true,
          evaluatedBy: 'human',
          reference: 'session_ref_3',
          completedAt: t3,
        },
      ]);

      const res = await getWithToken(server.baseUrl, '/api/skill-evidence', token);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const checks = res.body.data.checks;
      assert.equal(checks.length, 3);

      // Verify newest-first order
      assert.equal(checks[0].reference, 'session_ref_3');
      assert.equal(checks[0].kind, 'interview');
      assert.equal(checks[0].eligibleForVerified, true);

      assert.equal(checks[1].reference, 'session_ref_2');
      assert.equal(checks[1].kind, 'interview');
      assert.equal(checks[1].eligibleForVerified, false);

      assert.equal(checks[2].reference, 'asm_ref_1');
      assert.equal(checks[2].kind, 'assessment');
      assert.equal(checks[2].eligibleForVerified, true);
    });

    it('enforces owner isolation: users cannot see other users evidence checks', async () => {
      const studentA = await signUp('student-a');
      const studentB = await signUp('student-b');

      await SkillEvidenceCheck.create({
        user: studentA.user.id,
        kind: CHECK_KINDS.ASSESSMENT,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.9,
        passMark: 0.7,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'assessment_engine',
        reference: 'asm_student_a',
        completedAt: new Date(),
      });

      const resA = await getWithToken(server.baseUrl, '/api/skill-evidence', studentA.token);
      assert.equal(resA.body.data.checks.length, 1);

      const resB = await getWithToken(server.baseUrl, '/api/skill-evidence', studentB.token);
      assert.equal(resB.body.data.checks.length, 0);
    });

    it('forbids students from recording evidence directly via admin routes', async () => {
      const student = await signUp('malicious-student');

      const asmRes = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/assessments', {
        method: 'POST',
        token: student.token,
        payload: {
          skill: 'Node.js',
          score: 1.0,
          assessmentId: 'forged_assessment',
        },
      });
      assert.equal(asmRes.status, 403);

      const intRes = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/interviews', {
        method: 'POST',
        token: student.token,
        payload: {
          skill: 'Node.js',
          score: 1.0,
          interviewId: 'forged_interview',
          evaluatedBy: 'human',
        },
      });
      assert.equal(intRes.status, 403);
    });
  });
});
