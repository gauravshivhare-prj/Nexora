import test from 'node:test';
import assert from 'node:assert/strict';

import {
  startTestServer,
  postJson,
  getWithToken,
  sendJsonWithToken,
} from './helpers/testServer.js';
import { User } from '../src/models/User.model.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import {
  EVIDENCE_STATUS,
  validateEvidenceIntake,
  recomputeSkillEvidenceState,
  recomputeStudentEvidenceLedger,
} from '../src/domain/evidence/evidenceEngine.js';
import { resolveCanonicalSkill } from '../src/domain/skills/skillOntology.js';

test('Task 04: Evidence Architecture & Evidence Lifecycle Engine Suite', async (t) => {
  let server;
  let studentAId;
  let studentAToken;
  let studentBId;
  let studentBToken;
  let adminId;
  let adminToken;

  t.before(async () => {
    server = await startTestServer();

    // Clean test records
    await User.deleteMany({ email: /@test-evidence-t4\.com$/ });
    await SkillEvidenceCheck.deleteMany({});

    // Register & Login Student A
    const regResA = await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Evidence Student A',
      email: 'student-a@test-evidence-t4.com',
      password: 'Password123!',
    });
    studentAId = regResA.body.data.user.id;

    const loginResA = await postJson(server.baseUrl, '/api/auth/login', {
      email: 'student-a@test-evidence-t4.com',
      password: 'Password123!',
    });
    studentAToken = loginResA.body.data.token;

    // Register & Login Student B
    const regResB = await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Evidence Student B',
      email: 'student-b@test-evidence-t4.com',
      password: 'Password123!',
    });
    studentBId = regResB.body.data.user.id;

    const loginResB = await postJson(server.baseUrl, '/api/auth/login', {
      email: 'student-b@test-evidence-t4.com',
      password: 'Password123!',
    });
    studentBToken = loginResB.body.data.token;

    // Register Admin
    const regAdmin = await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Evidence Admin',
      email: 'admin@test-evidence-t4.com',
      password: 'Password123!',
    });
    adminId = regAdmin.body.data.user.id;
    // Elevate admin role directly in DB
    await User.updateOne({ _id: adminId }, { $set: { role: 'admin' } });
    const loginAdmin = await postJson(server.baseUrl, '/api/auth/login', {
      email: 'admin@test-evidence-t4.com',
      password: 'Password123!',
    });
    adminToken = loginAdmin.body.data.token;
  });

  t.after(async () => {
    if (server) {
      await server.close();
    }
  });

  await t.test('1. Claim -> Support -> Verification Lifecycle Transitions', async () => {
    // A. Submit Claim
    const claimRes = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/claim', {
      method: 'POST',
      token: studentAToken,
      payload: {
        skill: 'React',
        detail: 'Studied React tutorial and hooks',
      },
    });

    assert.equal(claimRes.status, 201);
    assert.equal(claimRes.body.data.evidence.strength, 'claimed');
    assert.equal(claimRes.body.data.evidence.canonicalSkillId, 'sk_react');
    assert.equal(claimRes.body.data.evidence.eligibleForVerified, false);
    assert.ok(claimRes.body.data.evidence.confidence >= 0.3);

    // B. Submit Support (Project)
    const supportRes = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/support', {
      method: 'POST',
      token: studentAToken,
      payload: {
        skill: 'reactjs', // alias resolution
        source: 'project',
        repoUrl: 'https://github.com/studentA/nexora-dashboard',
        detail: 'Built full stack frontend with React and TypeScript',
      },
    });

    assert.equal(supportRes.status, 201);
    assert.equal(supportRes.body.data.evidence.strength, 'supported');
    assert.equal(supportRes.body.data.evidence.canonicalSkillId, 'sk_react');
    assert.equal(supportRes.body.data.evidence.eligibleForVerified, false);
    assert.ok(supportRes.body.data.evidence.confidence >= 0.65);

    // C. Record Proctored Assessment Verification (via Admin)
    const verifyRes = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/assessments', {
      method: 'POST',
      token: adminToken,
      payload: {
        skill: 'React',
        score: 0.92,
        passMark: 0.70,
        assessmentId: 'asm-react-core-01',
        evaluatedBy: 'assessment-engine',
      },
    });

    assert.equal(verifyRes.status, 201);
    assert.equal(verifyRes.body.data.assessment.outcome, 'pass');
    assert.equal(verifyRes.body.data.assessment.eligibleForVerified, true);
    assert.equal(verifyRes.body.data.assessment.canonicalSkillId, 'sk_react');
  });

  await t.test('2. Anti-AI-Promotion Invariant Enforcement', async () => {
    // Domain layer validation
    const aiIntake = validateEvidenceIntake({
      skill: 'Node.js',
      source: 'interview',
      score: 0.95,
      evaluatedBy: 'ai',
      reference: 'ai-mock-interview-session-123',
    });

    assert.equal(aiIntake.strength, 'supported');
    assert.equal(aiIntake.eligibleForVerified, false);
    assert.equal(aiIntake.isAdvisory, true);
    assert.equal(aiIntake.outcome, 'uncertain');

    // Attempting direct DB creation with AI evaluator and eligibleForVerified: true fails schema validation
    await assert.rejects(
      async () => {
        await SkillEvidenceCheck.create({
          user: studentAId,
          kind: 'interview',
          skillKey: 'nodejs',
          skillName: 'Node.js',
          score: 1.0,
          passMark: 0.75,
          outcome: 'pass',
          eligibleForVerified: true, // Forbidden!
          evaluatedBy: 'ai',
          reference: 'forged-ai-interview',
          completedAt: new Date(),
        });
      },
      /AI.*cannot be eligible for verified status/i
    );
  });

  await t.test('3. Non-Downgrade Invariants', async () => {
    const canonical = resolveCanonicalSkill('sk_react');

    const historicalRecords = [
      // 1. Verified pass
      {
        id: 'rec-1',
        source: 'assessment',
        strength: 'verified',
        score: 0.90,
        passMark: 0.70,
        outcome: 'pass',
        confidence: 0.95,
        completedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10), // 10 days ago
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 100),
      },
      // 2. Subsequent self-declared claim (weaker)
      {
        id: 'rec-2',
        source: 'self_declared',
        strength: 'claimed',
        score: 1.0,
        passMark: 0.70,
        outcome: 'pass',
        confidence: 0.35,
        completedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 80),
      },
      // 3. Failed practice assessment
      {
        id: 'rec-3',
        source: 'assessment',
        strength: 'claimed',
        score: 0.50,
        passMark: 0.70,
        outcome: 'fail',
        confidence: 0.10,
        completedAt: new Date(), // Today
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180),
      },
    ];

    const state = recomputeSkillEvidenceState(historicalRecords, canonical);
    assert.equal(state.effectiveStrength, 'verified', 'Verified status must NOT be downgraded by lower-tier records');
    assert.equal(state.isDisputed, false, 'Verified skill with prior proctored pass cannot be falsely marked disputed');
    assert.ok(state.compositeConfidence >= 0.90);
  });

  await t.test('4. Dispute Detection for Unverified Claims Failing Proctored Checks', async () => {
    const canonical = resolveCanonicalSkill('sk_python');

    const disputedRecords = [
      // Self-declared claim
      {
        id: 'claim-1',
        source: 'self_declared',
        strength: 'claimed',
        outcome: 'pass',
        confidence: 0.35,
        completedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 85),
      },
      // Failed assessment
      {
        id: 'fail-1',
        source: 'assessment',
        strength: 'claimed',
        score: 0.25,
        passMark: 0.70,
        outcome: 'fail',
        confidence: 0.10,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180),
      },
    ];

    const state = recomputeSkillEvidenceState(disputedRecords, canonical);
    assert.equal(state.isDisputed, true, 'Skill must be flagged as disputed');
    assert.equal(state.status, EVIDENCE_STATUS.DISPUTED);
    assert.ok(state.compositeConfidence <= 0.25, 'Disputed skill confidence must be penalized');
  });

  await t.test('5. Staleness Horizons & Confidence Decay', async () => {
    const canonical = resolveCanonicalSkill('sk_sql');

    // Record completed 200 days ago (past the 180-day assessment horizon)
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const staleRecords = [
      {
        id: 'stale-1',
        source: 'assessment',
        strength: 'verified',
        score: 0.85,
        passMark: 0.70,
        outcome: 'pass',
        confidence: 0.90,
        completedAt: oldDate,
        expiresAt: new Date(oldDate.getTime() + 180 * 24 * 60 * 60 * 1000), // Expired 20 days ago
      },
    ];

    const state = recomputeSkillEvidenceState(staleRecords, canonical);
    assert.equal(state.isStale, true, 'Expired evidence must be marked stale');
    assert.equal(state.status, EVIDENCE_STATUS.STALE);
    assert.ok(state.compositeConfidence < 0.90, 'Stale confidence must reflect decay');
  });

  await t.test('6. Invalidation Engine & Audit Trail', async () => {
    // Create an active claim for Student A
    const claimRes = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/claim', {
      method: 'POST',
      token: studentAToken,
      payload: {
        skill: 'Docker',
        detail: 'Claiming docker proficiency',
      },
    });
    const evidenceId = claimRes.body.data.evidence.id;

    // Invalidate the claim
    const invRes = await sendJsonWithToken(
      server.baseUrl,
      `/api/skill-evidence/${evidenceId}/invalidate`,
      {
        method: 'POST',
        token: studentAToken,
        payload: {
          reason: 'Duplicate entry submitted in error',
        },
      }
    );

    assert.equal(invRes.status, 200);
    assert.equal(invRes.body.data.evidence.status, 'invalidated');
    assert.equal(invRes.body.data.evidence.invalidationReason, 'Duplicate entry submitted in error');

    // Confirm it is excluded from getEvidenceSummary
    const summaryRes = await getWithToken(server.baseUrl, '/api/skill-evidence/summary', studentAToken);

    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.data.skills['docker'], undefined, 'Invalidated record must not appear in active skills');
  });

  await t.test('7. Multi-Tenant IDOR Protection', async () => {
    // Create record for Student A
    const claimRes = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/claim', {
      method: 'POST',
      token: studentAToken,
      payload: {
        skill: 'Git',
        detail: 'Git proficiency',
      },
    });
    const recordId = claimRes.body.data.evidence.id;

    // Student B attempts to invalidate Student A's record -> 404 NOT_FOUND
    const attackRes = await sendJsonWithToken(
      server.baseUrl,
      `/api/skill-evidence/${recordId}/invalidate`,
      {
        method: 'POST',
        token: studentBToken,
        payload: {
          reason: 'Malicious invalidation attempt',
        },
      }
    );

    assert.equal(attackRes.status, 404, 'Must return 404 without leaking existence of another tenant record');
  });

  await t.test('8. Canonical Skill Ontology Validation', async () => {
    // Attempting to submit claim for unknown hallucinated skill
    const badRes = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/claim', {
      method: 'POST',
      token: studentAToken,
      payload: {
        skill: 'QuantumMindReadingTech999',
        detail: 'Fake skill',
      },
    });

    assert.equal(badRes.status, 400);
    assert.match(badRes.body.message, /not recognized in the canonical ontology/i);
  });

  await t.test('9. Full Ledger Recomputation & Verification', async () => {
    const recomputeRes = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/recompute', {
      method: 'POST',
      token: studentAToken,
      payload: {},
    });

    assert.equal(recomputeRes.status, 200);
    assert.ok(recomputeRes.body.data.summary.totalTrackedSkills >= 1);
    assert.ok(typeof recomputeRes.body.data.summary.verifiedCount === 'number');
    assert.ok(typeof recomputeRes.body.data.summary.supportedCount === 'number');
    assert.ok(typeof recomputeRes.body.data.summary.claimedCount === 'number');
  });
});
