import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { Assessment, AssessmentAttempt, CareerTwin, isCareerTwinStale } from '../src/models/index.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import {
  clearAssessmentAttempts,
  clearAssessments,
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
  beginnerHighScorerSubmissionFixture,
  beginnerTestAssessment,
  correctSubmissionFixture,
  partialSubmissionFixture,
  scoringTestAssessment,
} from './fixtures/assessmentScoringFixtures.js';

const PASSWORD = 'Str0ngPassphrase1!';
let counter = 0;
let server;

describe('A8 — Assessment → Evidence Integration & Anti-Forgery Regressions', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearAssessmentAttempts();
    await clearAssessments();
    await clearSkillEvidenceChecks();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    await mongoose.connection.collection('careertwins').deleteMany({});
    resetRateLimiters();

    // Seed canonical scoring fixture assessments
    await Assessment.create([
      {
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
      },
      {
        assessmentId: beginnerTestAssessment.id,
        version: beginnerTestAssessment.version,
        skillKey: beginnerTestAssessment.skillKey,
        skillName: beginnerTestAssessment.skillKey,
        difficulty: beginnerTestAssessment.difficulty,
        title: beginnerTestAssessment.title,
        description: beginnerTestAssessment.description,
        passMark: beginnerTestAssessment.passMark,
        timeLimitMinutes: beginnerTestAssessment.timeLimitMinutes,
        questions: beginnerTestAssessment.questions,
        isActive: true,
      },
    ]);
  });

  async function signUp(label) {
    counter += 1;
    const email = `a8.${label}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: `Student ${label}`,
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { token: body.data.token, user: body.data.user };
  }

  // =========================================================================
  // 1. End-to-End Pipeline: Assessment -> Evidence -> CareerTwin -> SkillGap
  // =========================================================================
  describe('1. End-to-End Assessment Evidence Pipeline', () => {
    it('promotes claimed skill to verified, triggers staleness, and updates skill gap with zero suggestions', async () => {
      const { token } = await signUp('pipeline');

      // 1. Create a profile claiming Node.js and targeting Backend Developer
      const profileRes = await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [{ name: 'Node.js', level: 'intermediate' }],
          career: { targetRole: 'Backend Developer' },
        },
      });
      assert.equal(profileRes.status, 200);

      // 2. Generate initial CareerTwin
      const initialTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(initialTwinRes.status, 200);
      const initialTwin = initialTwinRes.body.data.careerTwin;
      assert.equal(initialTwin.isStale, false);
      assert.equal(initialTwin.indicators.claimedOnly, 1);
      assert.equal(initialTwin.indicators.verified, 0);

      const nodeSkillInitial = initialTwin.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeSkillInitial);
      assert.equal(nodeSkillInitial.strength, 'claimed');

      // 3. Inspect skill-gap for backend-developer prior to assessment
      const gapBeforeRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/skill-gap',
        token,
      );
      assert.equal(gapBeforeRes.status, 200);
      const gapBefore = gapBeforeRes.body.data.gap;
      const nodeGapBefore = gapBefore.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeGapBefore);
      assert.equal(nodeGapBefore.status, 'claimed');
      assert.equal(gapBefore.summary.required.claimed, 1);
      assert.equal(gapBefore.summary.required.verified, 0);
      assert.ok(nodeGapBefore.suggestedEvidence.length > 0);

      // 4. Student takes and passes intermediate Node.js assessment
      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        { method: 'POST', token, payload: {} },
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      // Small delay to ensure timestamp separation
      await new Promise((r) => setTimeout(r, 25));

      const submitRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        { method: 'POST', token, payload: { answers: correctSubmissionFixture.answers } },
      );
      assert.equal(submitRes.status, 200);
      assert.equal(submitRes.body.data.attempt.status, 'evaluated');
      assert.equal(submitRes.body.data.attempt.passed, true);
      assert.equal(submitRes.body.data.evidenceResult?.eligibleForVerified, true);
      assert.ok(submitRes.body.data.attempt.evidenceCheckId);

      // Verify SkillEvidenceCheck was saved in database
      const checkDoc = await SkillEvidenceCheck.findById(submitRes.body.data.attempt.evidenceCheckId);
      assert.ok(checkDoc);
      assert.equal(checkDoc.skillKey, 'nodejs');
      assert.equal(checkDoc.eligibleForVerified, true);
      assert.equal(checkDoc.outcome, 'pass');

      // 5. Query CareerTwin: MUST detect staleness due to newly recorded assessment evidence!
      const staleTwinRes = await getWithToken(server.baseUrl, '/api/career-twin', token);
      assert.equal(staleTwinRes.status, 200);
      const staleTwin = staleTwinRes.body.data.careerTwin;
      assert.equal(staleTwin.isStale, true, 'CareerTwin must be stale after passing assessment');
      assert.ok(
        staleTwin.staleReasons.some((r) => r.includes('skill evidence')),
        `Expected staleness reason to mention skill evidence, got: ${JSON.stringify(staleTwin.staleReasons)}`,
      );

      // 6. Query Dashboard Summary: CareerTwin section must also report stale
      const summaryRes = await getWithToken(server.baseUrl, '/api/summary', token);
      assert.equal(summaryRes.status, 200);
      assert.equal(summaryRes.body.data.careerTwin.isStale, true);

      // 7. Regenerate CareerTwin
      const freshTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(freshTwinRes.status, 200);
      const freshTwin = freshTwinRes.body.data.careerTwin;
      assert.equal(freshTwin.isStale, false);
      assert.equal(freshTwin.indicators.verified, 1);
      assert.equal(freshTwin.indicators.claimedOnly, 0);

      const nodeSkillFresh = freshTwin.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeSkillFresh);
      assert.equal(nodeSkillFresh.strength, 'verified');
      assert.ok(
        nodeSkillFresh.evidence.some(
          (e) => e.source === 'assessment' && e.strength === 'verified' && e.reference === scoringTestAssessment.id,
        ),
      );

      // 8. Inspect skill-gap for backend-developer: Node.js MUST now be verified!
      const gapAfterRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/skill-gap',
        token,
      );
      assert.equal(gapAfterRes.status, 200);
      const gapAfter = gapAfterRes.body.data.gap;
      const nodeGapAfter = gapAfter.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeGapAfter);
      assert.equal(nodeGapAfter.status, 'verified');
      assert.match(nodeGapAfter.reason, /independently checked/i);
      assert.match(nodeGapAfter.reason, /Passed assessment for Node\.js/i);
      assert.deepEqual(nodeGapAfter.suggestedEvidence, []);
      assert.equal(gapAfter.summary.required.verified, 1);
      assert.equal(gapAfter.summary.required.claimed, 0);

      // 9. Dashboard summary is now clean and fresh
      const summaryAfterRes = await getWithToken(server.baseUrl, '/api/summary', token);
      assert.equal(summaryAfterRes.status, 200);
      assert.equal(summaryAfterRes.body.data.careerTwin.isStale, false);
      assert.equal(summaryAfterRes.body.data.careerTwin.indicators.verified, 1);
    });
  });

  // =========================================================================
  // 2. Direct Staleness Unit & API Rules
  // =========================================================================
  describe('2. Evidence Staleness Rules & Timing', () => {
    it('isCareerTwinStale detects evidence timestamp movement and count changes', () => {
      const generatedAt = new Date('2026-01-10T10:00:00Z');
      const twin = {
        generatedAt,
        sources: {
          profileUpdatedAt: generatedAt,
          analysedResumeIds: ['a'],
          verifiedEvidenceCount: 1,
        },
      };

      // 1. Current when evidence was completed before twin generation
      const current = isCareerTwinStale(twin, {
        profileUpdatedAt: generatedAt,
        analysedResumeIds: ['a'],
        latestAnalysisAt: null,
        latestEvidenceAt: new Date('2026-01-10T09:30:00Z'),
        verifiedEvidenceCount: 1,
      });
      assert.equal(current.isStale, false);
      assert.deepEqual(current.reasons, []);

      // 2. Stale when latest evidence completed AFTER twin generation
      const staleByTime = isCareerTwinStale(twin, {
        profileUpdatedAt: generatedAt,
        analysedResumeIds: ['a'],
        latestAnalysisAt: null,
        latestEvidenceAt: new Date('2026-01-10T10:30:00Z'),
        verifiedEvidenceCount: 2,
      });
      assert.equal(staleByTime.isStale, true);
      assert.deepEqual(staleByTime.reasons, ['New skill evidence has been recorded since this was generated.']);

      // 3. Stale when evidence count changes even if timestamps are equal
      const staleByCount = isCareerTwinStale(twin, {
        profileUpdatedAt: generatedAt,
        analysedResumeIds: ['a'],
        latestAnalysisAt: null,
        latestEvidenceAt: generatedAt,
        verifiedEvidenceCount: 2,
      });
      assert.equal(staleByCount.isStale, true);
      assert.deepEqual(staleByCount.reasons, ['New skill evidence has been recorded since this was generated.']);
    });

    it('stays unstale if no evidence exists and no profile changes occurred', async () => {
      const { token } = await signUp('clean');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: { skills: [{ name: 'Git', level: 'beginner' }] },
      });

      const genRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(genRes.status, 200);

      const readRes = await getWithToken(server.baseUrl, '/api/career-twin', token);
      assert.equal(readRes.status, 200);
      assert.equal(readRes.body.data.careerTwin.isStale, false);
      assert.deepEqual(readRes.body.data.careerTwin.staleReasons, []);
    });
  });

  // =========================================================================
  // 3. Anti-Forgery & Unsupported Payload Regressions
  // =========================================================================
  describe('3. Anti-Forgery & Unsupported Payload Protections', () => {
    it('rejects submissions with forged score/verification fields and creates NO evidence', async () => {
      const { token } = await signUp('tamper');

      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        { method: 'POST', token, payload: {} },
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      // Attempt to forge verification in submit payload
      const forgedSubmit = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token,
          payload: {
            answers: correctSubmissionFixture.answers,
            score: 1.0,
            passed: true,
            eligibleForVerified: true,
            outcome: 'pass',
          },
        },
      );
      assert.equal(forgedSubmit.status, 400);
      assert.equal(forgedSubmit.body.errorCode, 'VALIDATION_ERROR');

      // Verify no evidence checks were created
      const checks = await SkillEvidenceCheck.find();
      assert.equal(checks.length, 0);

      // Verify attempt is still in_progress and not evaluated
      const attemptDoc = await AssessmentAttempt.findById(attemptId);
      assert.equal(attemptDoc.status, 'in_progress');
    });

    it('beginner assessment scoring 100% does NOT create verified evidence or elevate skill', async () => {
      const { token } = await signUp('beginner-hero');

      // Create profile claiming Node.js
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: { skills: [{ name: 'Node.js', level: 'beginner' }] },
      });

      // Generate initial twin
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Start and submit beginner assessment with 100% correct answers
      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${beginnerTestAssessment.id}/attempts`,
        { method: 'POST', token, payload: {} },
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      const submitRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token,
          payload: { answers: beginnerHighScorerSubmissionFixture.answers },
        },
      );
      assert.equal(submitRes.status, 200);
      assert.equal(submitRes.body.data.attempt.score, 1.0);
      assert.equal(submitRes.body.data.attempt.passed, true);
      assert.equal(submitRes.body.data.evidenceResult?.eligibleForVerified, false);
      assert.equal(submitRes.body.data.attempt.evidenceCheckId, null);

      // Zero SkillEvidenceChecks created
      const checkCount = await SkillEvidenceCheck.countDocuments();
      assert.equal(checkCount, 0);

      // CareerTwin should NOT be stale because no verified evidence was recorded
      const twinRes = await getWithToken(server.baseUrl, '/api/career-twin', token);
      assert.equal(twinRes.body.data.careerTwin.isStale, false);

      // Regenerating CareerTwin leaves Node.js at claimed, NOT verified
      const regenerated = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      const nodeSkill = regenerated.body.data.careerTwin.skills.find((s) => s.key === 'nodejs');
      assert.equal(nodeSkill.strength, 'claimed');
      assert.equal(regenerated.body.data.careerTwin.indicators.verified, 0);
    });

    it('failing assessment (< 70%) does NOT create verified evidence check or mark twin stale', async () => {
      const { token } = await signUp('fail-test');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: { skills: [{ name: 'Node.js', level: 'intermediate' }] },
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        { method: 'POST', token, payload: {} },
      );
      const attemptId = startRes.body.data.attempt.id;

      // Submit failing/partial score below 0.70
      const submitRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        { method: 'POST', token, payload: { answers: partialSubmissionFixture.answers } },
      );
      assert.equal(submitRes.status, 200);
      assert.equal(submitRes.body.data.attempt.passed, false);
      assert.equal(submitRes.body.data.evidenceResult?.eligibleForVerified, false);
      assert.equal(submitRes.body.data.attempt.evidenceCheckId, null);

      const checkCount = await SkillEvidenceCheck.countDocuments();
      assert.equal(checkCount, 0);

      const twinRes = await getWithToken(server.baseUrl, '/api/career-twin', token);
      assert.equal(twinRes.body.data.careerTwin.isStale, false);
    });

    it('direct POST to /api/skill-evidence/assessments with low score cannot forge verified status', async () => {
      const { token } = await signUp('direct-forge');

      // Attempt to submit a low score while claiming eligibleForVerified and outcome = pass
      const forgeRes = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/assessments', {
        method: 'POST',
        token,
        payload: {
          skill: 'Docker',
          score: 0.35,
          assessmentId: 'fake-assessment-id',
          eligibleForVerified: true,
          outcome: 'pass',
          evidence: { strength: 'verified' },
        },
      });
      assert.equal(forgeRes.status, 201);
      // The domain logic computes outcome based on score, completely ignoring forged fields!
      assert.equal(forgeRes.body.data.assessment.outcome, 'fail');
      assert.equal(forgeRes.body.data.assessment.eligibleForVerified, false);

      // Verify the check in DB has eligibleForVerified = false
      const checkDoc = await SkillEvidenceCheck.findOne({ reference: 'fake-assessment-id' });
      assert.ok(checkDoc);
      assert.equal(checkDoc.eligibleForVerified, false);

      // Generating CareerTwin: Docker is NOT verified
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: { skills: [{ name: 'Docker', level: 'intermediate' }] },
      });
      const twinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      const dockerSkill = twinRes.body.data.careerTwin.skills.find((s) => s.key === 'docker');
      assert.equal(dockerSkill.strength, 'claimed');
      assert.equal(twinRes.body.data.careerTwin.indicators.verified, 0);
    });

    it('rejects direct evidence creation for unknown canonical skill taxonomy keys', async () => {
      const { token } = await signUp('unknown-skill');

      const res = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/assessments', {
        method: 'POST',
        token,
        payload: {
          skill: 'ImaginaryQuantumTech99',
          score: 1.0,
          assessmentId: 'asm-unknown-1',
        },
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, 'VALIDATION_ERROR');
      assert.match(res.body.message, /Unknown canonical skill/);
    });

    it('cross-tenant attempt submission returns 404 and creates zero evidence for either student', async () => {
      const studentA = await signUp('studentA');
      const studentB = await signUp('studentB');

      // Student A starts an attempt
      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        { method: 'POST', token: studentA.token, payload: {} },
      );
      const attemptId = startRes.body.data.attempt.id;

      // Student B tries to submit Student A's attempt
      const submitRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        { method: 'POST', token: studentB.token, payload: { answers: correctSubmissionFixture.answers } },
      );
      assert.equal(submitRes.status, 404);
      assert.equal(submitRes.body.errorCode, 'NOT_FOUND');

      // Verify zero evidence was created
      const checks = await SkillEvidenceCheck.find();
      assert.equal(checks.length, 0);
    });
  });
});
