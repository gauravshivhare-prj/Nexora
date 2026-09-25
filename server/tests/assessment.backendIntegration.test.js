import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { Assessment, AssessmentAttempt } from '../src/models/index.js';
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
  startTestServer,
} from './helpers/testServer.js';
import {
  beginnerTestAssessment,
  correctSubmissionFixture,
  scoringTestAssessment,
} from './fixtures/assessmentScoringFixtures.js';

const PASSWORD = 'Str0ngPassphrase1!';
let counter = 0;
let server;

describe('G11 — Assessment Backend Integration & Security Tests', () => {
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
    resetRateLimiters();

    // Seed test assessments
    await Assessment.create({
      assessmentId: scoringTestAssessment.id,
      version: scoringTestAssessment.version,
      skillKey: scoringTestAssessment.skillKey,
      skillName: scoringTestAssessment.skillKey,
      difficulty: scoringTestAssessment.difficulty, // intermediate
      title: scoringTestAssessment.title,
      description: scoringTestAssessment.description,
      passMark: scoringTestAssessment.passMark,
      timeLimitMinutes: scoringTestAssessment.timeLimitMinutes,
      questions: scoringTestAssessment.questions,
      isActive: true,
    });

    await Assessment.create({
      assessmentId: beginnerTestAssessment.id,
      version: beginnerTestAssessment.version,
      skillKey: beginnerTestAssessment.skillKey,
      skillName: beginnerTestAssessment.skillKey,
      difficulty: beginnerTestAssessment.difficulty, // beginner
      title: beginnerTestAssessment.title,
      description: beginnerTestAssessment.description,
      passMark: beginnerTestAssessment.passMark,
      timeLimitMinutes: beginnerTestAssessment.timeLimitMinutes,
      questions: beginnerTestAssessment.questions,
      isActive: true,
    });
  });

  async function registerAndLogin(label) {
    counter += 1;
    const email = `g11.${label}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: label,
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { token: body.data.token, user: body.data.user };
  }

  // ===========================================================================
  // 1. Public DTO Leakage Protection
  // ===========================================================================
  describe('1. Public DTO Leakage Protection', () => {
    it('never leaks expectedAnswer or explanation in GET /api/assessments or /:assessmentId', async () => {
      const { token } = await registerAndLogin('dto_student');

      // List assessments
      const { status: listStatus, body: listBody } = await getWithToken(
        server.baseUrl,
        '/api/assessments',
        token,
      );
      assert.equal(listStatus, 200);
      assert.ok(listBody.data.assessments.length >= 2);

      for (const assessment of listBody.data.assessments) {
        assert.equal(assessment.expectedAnswer, undefined);
        for (const q of assessment.questions) {
          assert.equal(q.expectedAnswer, undefined);
          assert.equal(q.explanation, undefined);
        }
      }

      // Single assessment
      const { status: singleStatus, body: singleBody } = await getWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}`,
        token,
      );
      assert.equal(singleStatus, 200);
      const assessment = singleBody.data.assessment;
      assert.equal(assessment.expectedAnswer, undefined);
      for (const q of assessment.questions) {
        assert.equal(q.expectedAnswer, undefined);
        assert.equal(q.explanation, undefined);
        assert.ok(q.id);
        assert.ok(q.prompt);
      }
    });

    it('never leaks expectedAnswer or explanation in attempt evaluation DTO', async () => {
      const { token } = await registerAndLogin('dto_attempt_student');

      // Start attempt
      const { status: startStatus, body: startBody } = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        { method: 'POST', token, payload: {} },
      );
      assert.equal(startStatus, 201);
      const attemptId = startBody.data.attempt.id;

      // Submit attempt
      const { status: submitStatus, body: submitBody } = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        { method: 'POST', token, payload: { answers: correctSubmissionFixture.answers } },
      );
      assert.equal(submitStatus, 200);

      const attemptDto = submitBody.data.attempt;
      assert.equal(attemptDto.expectedAnswer, undefined);
      for (const qr of attemptDto.questionResults) {
        assert.equal(qr.expectedAnswer, undefined);
        assert.equal(qr.explanation, undefined);
      }
    });
  });

  // ===========================================================================
  // 2. Strict IDOR and Scoping Protection
  // ===========================================================================
  describe('2. IDOR & Ownership Boundary Protection', () => {
    it('prevents User B from accessing or submitting User A attempt (returns 404)', async () => {
      const userA = await registerAndLogin('userA');
      const userB = await registerAndLogin('userB');

      // User A starts attempt
      const { status: startStatus, body: startBody } = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        { method: 'POST', token: userA.token, payload: {} },
      );
      assert.equal(startStatus, 201);
      const attemptId = startBody.data.attempt.id;
      assert.ok(attemptId);

      // User B attempts to read User A attempt -> 404
      const { status: getStatus } = await getWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}`,
        userB.token,
      );
      assert.equal(getStatus, 404);

      // User B attempts to submit User A attempt -> 404
      const { status: submitStatus } = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        { method: 'POST', token: userB.token, payload: { answers: correctSubmissionFixture.answers } },
      );
      assert.equal(submitStatus, 404);

      // Verify User A attempt is still IN_PROGRESS
      const storedAttempt = await AssessmentAttempt.findById(attemptId);
      assert.equal(storedAttempt.status, 'in_progress');
    });

    it('isolates user attempt lists completely', async () => {
      const userA = await registerAndLogin('listUserA');
      const userB = await registerAndLogin('listUserB');

      await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        { method: 'POST', token: userA.token, payload: {} },
      );

      const { body: listA } = await getWithToken(
        server.baseUrl,
        '/api/assessments/attempts',
        userA.token,
      );
      assert.equal(listA.data.attempts.length, 1);

      const { body: listB } = await getWithToken(
        server.baseUrl,
        '/api/assessments/attempts',
        userB.token,
      );
      assert.equal(listB.data.attempts.length, 0);
    });
  });

  // ===========================================================================
  // 3. Evidence & CareerTwin Integration
  // ===========================================================================
  describe('3. Evidence & CareerTwin Integration', () => {
    it('creates verified SkillEvidenceCheck when passing an intermediate assessment', async () => {
      const user = await registerAndLogin('passing_user');

      // Start attempt
      const { status: startStatus, body: startBody } = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        { method: 'POST', token: user.token, payload: {} },
      );
      assert.equal(startStatus, 201);
      const attemptId = startBody.data.attempt.id;

      // Submit with all correct answers
      const { status: submitStatus, body: submitBody } = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        { method: 'POST', token: user.token, payload: { answers: correctSubmissionFixture.answers } },
      );

      assert.equal(submitStatus, 200);
      assert.equal(submitBody.data.attempt.passed, true);
      assert.equal(submitBody.data.evidenceResult.eligibleForVerified, true);
      assert.ok(submitBody.data.attempt.evidenceCheckId);

      // Verify SkillEvidenceCheck document in MongoDB
      const checkDoc = await SkillEvidenceCheck.findById(
        submitBody.data.attempt.evidenceCheckId,
      );
      assert.ok(checkDoc);
      assert.equal(checkDoc.eligibleForVerified, true);
      assert.equal(checkDoc.outcome, 'pass');
      assert.equal(checkDoc.kind, 'assessment');

      // Verify skill-evidence API returns the recorded check
      const { status: evStatus, body: evBody } = await getWithToken(
        server.baseUrl,
        '/api/skill-evidence',
        user.token,
      );
      assert.equal(evStatus, 200);
      assert.equal(evBody.data.checks.length, 1);
      assert.equal(evBody.data.checks[0].eligibleForVerified, true);
      assert.equal(evBody.data.checks[0].kind, 'assessment');

      // Generate CareerTwin to verify verifiedSkills integration
      const { status: twinGenStatus, body: twinGenBody } = await sendJsonWithToken(
        server.baseUrl,
        '/api/career-twin',
        { method: 'POST', token: user.token, payload: {} },
      );
      assert.equal(twinGenStatus, 200);
      const twin = twinGenBody.data.careerTwin;
      assert.ok(twin);

      // The verified skill should be present in twin.skills with strength === 'verified'
      const foundVerified = (twin.skills || []).find(
        (s) =>
          (s.key === scoringTestAssessment.skillKey.toLowerCase() ||
           s.name.toLowerCase() === scoringTestAssessment.skillKey.toLowerCase()) &&
          s.strength === 'verified',
      );
      assert.ok(foundVerified, 'Expected verified skill to appear in CareerTwin');
      assert.ok(twin.indicators.verified >= 1);
    });

    it('rejects client tamper attempts supplying outcome or eligibleForVerified', async () => {
      const user = await registerAndLogin('tamper_user');

      const { status: startStatus, body: startBody } = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        { method: 'POST', token: user.token, payload: {} },
      );
      assert.equal(startStatus, 201);
      const attemptId = startBody.data.attempt.id;

      // Attempt injection of forbidden verification fields
      const { status: tamperStatus } = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token: user.token,
          payload: {
            answers: correctSubmissionFixture.answers,
            eligibleForVerified: true,
            score: 1.0,
            passed: true,
          },
        },
      );

      assert.equal(tamperStatus, 400);
    });
  });
});
