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
  beginnerHighScorerSubmissionFixture,
  beginnerTestAssessment,
  correctSubmissionFixture,
  partialSubmissionFixture,
  scoringTestAssessment,
} from './fixtures/assessmentScoringFixtures.js';

const PASSWORD = 'Str0ngPassphrase1!';
let counter = 0;
let server;

describe('A7 — Assessment REST API Integration Tests', () => {
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
      difficulty: scoringTestAssessment.difficulty,
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
      difficulty: beginnerTestAssessment.difficulty,
      title: beginnerTestAssessment.title,
      description: beginnerTestAssessment.description,
      passMark: beginnerTestAssessment.passMark,
      timeLimitMinutes: beginnerTestAssessment.timeLimitMinutes,
      questions: beginnerTestAssessment.questions,
      isActive: true,
    });
  });

  async function signUp(label) {
    counter += 1;
    const email = `assessment.${label}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: label,
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return body.data.token;
  }

  // ===========================================================================
  // 1. Authentication Protection on All Endpoints
  // ===========================================================================
  describe('1. Authentication Protection on All Endpoints', () => {
    it('refuses unauthenticated requests on every assessment endpoint with 401', async () => {
      const dummyId = new mongoose.Types.ObjectId();

      const endpoints = [
        { method: 'GET', path: '/api/assessments' },
        { method: 'GET', path: `/api/assessments/${scoringTestAssessment.id}` },
        { method: 'POST', path: `/api/assessments/${scoringTestAssessment.id}/attempts`, payload: {} },
        { method: 'POST', path: `/api/assessments/attempts/${dummyId}/submit`, payload: { answers: {} } },
        { method: 'GET', path: `/api/assessments/attempts/${dummyId}` },
        { method: 'GET', path: '/api/assessments/attempts' },
        { method: 'GET', path: `/api/assessments/${scoringTestAssessment.id}/latest` },
      ];

      for (const ep of endpoints) {
        const res = await sendJsonWithToken(server.baseUrl, ep.path, {
          method: ep.method,
          token: null,
          payload: ep.payload,
        });

        assert.equal(
          res.status,
          401,
          `Expected 401 on anonymous ${ep.method} ${ep.path}, got ${res.status}`,
        );
        assert.equal(res.body.errorCode, 'AUTH_TOKEN_MISSING');
      }
    });

    it('refuses forged or corrupted tokens with 401 AUTH_TOKEN_INVALID', async () => {
      const res = await getWithToken(server.baseUrl, '/api/assessments', 'garbage.bearer.token');
      assert.equal(res.status, 401);
      assert.equal(res.body.errorCode, 'AUTH_TOKEN_INVALID');
    });
  });

  // ===========================================================================
  // 2. Content Sanitization & Secret Protection
  // ===========================================================================
  describe('2. Content Sanitization & Secret Protection', () => {
    it('GET /api/assessments returns sanitized list that never exposes answer keys or explanations', async () => {
      const token = await signUp('student_view');
      const res = await getWithToken(server.baseUrl, '/api/assessments', token);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.assessments));
      assert.ok(res.body.data.assessments.length >= 2);

      for (const assessment of res.body.data.assessments) {
        assert.ok(assessment.id);
        assert.ok(assessment.title);
        assert.ok(assessment.difficulty);
        assert.ok(assessment.passMark);

        for (const question of assessment.questions) {
          assert.ok(question.id);
          assert.ok(question.prompt);
          assert.ok(question.type);

          // Secret fields must be strictly absent
          assert.equal(question.expectedAnswer, undefined);
          assert.equal(question.expectedOutput, undefined);
          assert.equal(question.acceptedAnswers, undefined);
          assert.equal(question.correctOptionId, undefined);
          assert.equal(question.correctOptionIds, undefined);
          assert.equal(question.explanation, undefined);
          assert.equal(question.scoringRule, undefined);

          if (question.options) {
            for (const opt of question.options) {
              assert.ok(opt.id);
              assert.ok(opt.text);
              assert.equal(opt.isCorrect, undefined);
            }
          }
        }
      }
    });

    it('GET /api/assessments/:assessmentId never leaks answer keys or internal metadata', async () => {
      const token = await signUp('student_single_view');
      const res = await getWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}`,
        token,
      );

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const assessment = res.body.data.assessment;
      assert.equal(assessment.id, scoringTestAssessment.id);

      for (const question of assessment.questions) {
        assert.equal(question.expectedAnswer, undefined);
        assert.equal(question.explanation, undefined);
      }
    });
  });

  // ===========================================================================
  // 3. Validation & Controlled Not-Found Behavior
  // ===========================================================================
  describe('3. Validation & Controlled Not-Found Behavior', () => {
    it('returns 400 VALIDATION_ERROR on unknown canonical skill query filter', async () => {
      const token = await signUp('validator_student');
      const res = await getWithToken(
        server.baseUrl,
        '/api/assessments?skill=CompletelyFictionalSkill',
        token,
      );

      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, 'VALIDATION_ERROR');
      assert.match(res.body.message, /Unknown canonical skill/);
    });

    it('returns 404 NOT_FOUND for non-existent assessment ID', async () => {
      const token = await signUp('notFound_student');
      const res = await getWithToken(
        server.baseUrl,
        '/api/assessments/asm_does_not_exist_404',
        token,
      );

      assert.equal(res.status, 404);
      assert.equal(res.body.errorCode, 'NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when attempting to start an unknown assessment', async () => {
      const token = await signUp('starter_student');
      const res = await sendJsonWithToken(
        server.baseUrl,
        '/api/assessments/asm_does_not_exist_404/attempts',
        {
          method: 'POST',
          token,
          payload: {},
        },
      );

      assert.equal(res.status, 404);
      assert.equal(res.body.errorCode, 'NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR when answers exceed string length or max answer count', async () => {
      const token = await signUp('oversized_student');

      // Start attempt
      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token,
          payload: {},
        },
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      // Oversized answer string (> 1000 chars)
      const oversizedTextRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token,
          payload: {
            answers: {
              q_code_out: 'x'.repeat(1001),
            },
          },
        },
      );
      assert.equal(oversizedTextRes.status, 400);
      assert.equal(oversizedTextRes.body.errorCode, 'VALIDATION_ERROR');
      assert.match(oversizedTextRes.body.message, /exceeds maximum length of 1000 characters/);

      // Oversized answers map (> 50 answers)
      const bigMap = {};
      for (let i = 0; i < 51; i++) bigMap[`q_${i}`] = 'ans';

      const oversizedMapRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token,
          payload: { answers: bigMap },
        },
      );
      assert.equal(oversizedMapRes.status, 400);
      assert.equal(oversizedMapRes.body.errorCode, 'VALIDATION_ERROR');
      assert.match(oversizedMapRes.body.message, /exceeds limit of 50 answers/);
    });
  });

  // ===========================================================================
  // 4. Ownership & Tenant Isolation
  // ===========================================================================
  describe('4. Ownership & Tenant Isolation', () => {
    it('returns 404 NOT_FOUND when Student B tries to view or submit Student A attempt', async () => {
      const studentA = await signUp('student_a');
      const studentB = await signUp('student_b');

      // Student A starts an attempt
      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token: studentA,
          payload: {},
        },
      );
      assert.equal(startRes.status, 201);
      const attemptAId = startRes.body.data.attempt.id;

      // Student A can view their attempt
      const viewARes = await getWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptAId}`,
        studentA,
      );
      assert.equal(viewARes.status, 200);
      assert.equal(viewARes.body.data.attempt.id, attemptAId);

      // Student B trying to GET Student A's attempt receives 404 (does NOT leak existence)
      const viewBRes = await getWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptAId}`,
        studentB,
      );
      assert.equal(viewBRes.status, 404);
      assert.equal(viewBRes.body.errorCode, 'NOT_FOUND');

      // Student B trying to submit Student A's attempt receives 404
      const submitBRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptAId}/submit`,
        {
          method: 'POST',
          token: studentB,
          payload: {
            answers: correctSubmissionFixture.answers,
          },
        },
      );
      assert.equal(submitBRes.status, 404);
      assert.equal(submitBRes.body.errorCode, 'NOT_FOUND');
    });

    it('keeps listAttempts and latestResult strictly scoped per student', async () => {
      const studentA = await signUp('isolated_a');
      const studentB = await signUp('isolated_b');

      // Student A starts & submits attempt
      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token: studentA,
          payload: {},
        },
      );
      const attemptId = startRes.body.data.attempt.id;

      await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token: studentA,
          payload: { answers: correctSubmissionFixture.answers },
        },
      );

      // Student A latest result exists
      const latestA = await getWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/latest`,
        studentA,
      );
      assert.equal(latestA.status, 200);
      assert.ok(latestA.body.data.attempt);
      assert.equal(latestA.body.data.attempt.id, attemptId);

      // Student B latest result is null
      const latestB = await getWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/latest`,
        studentB,
      );
      assert.equal(latestB.status, 200);
      assert.equal(latestB.body.data.attempt, null);

      // Student B list of attempts is empty
      const listB = await getWithToken(server.baseUrl, '/api/assessments/attempts', studentB);
      assert.equal(listB.status, 200);
      assert.deepEqual(listB.body.data.attempts, []);
    });
  });

  // ===========================================================================
  // 5. Anti-Tampering Enforcement
  // ===========================================================================
  describe('5. Anti-Tampering Enforcement', () => {
    it('rejects submissions supplying forbidden score or verification fields with 400', async () => {
      const token = await signUp('tamper_student_1');

      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token,
          payload: {},
        },
      );
      const attemptId = startRes.body.data.attempt.id;

      const forbiddenFields = [
        'score',
        'rawScore',
        'percentage',
        'passed',
        'outcome',
        'eligibleForVerified',
        'evidence',
        'evidenceResult',
        'evidenceCheck',
        'status',
        'earnedPoints',
        'maxPoints',
        'isCorrect',
        'ratio',
        'expectedAnswer',
        'correctOptionId',
      ];

      for (const field of forbiddenFields) {
        const tamperRes = await sendJsonWithToken(
          server.baseUrl,
          `/api/assessments/attempts/${attemptId}/submit`,
          {
            method: 'POST',
            token,
            payload: {
              answers: correctSubmissionFixture.answers,
              [field]: field === 'passed' ? true : 1.0,
            },
          },
        );

        assert.equal(
          tamperRes.status,
          400,
          `Expected 400 for tampered field: ${field}, got ${tamperRes.status}`,
        );
        assert.equal(tamperRes.body.errorCode, 'VALIDATION_ERROR');
        assert.match(
          tamperRes.body.message,
          new RegExp(`Client is forbidden from supplying scoring/verification field: "${field}"`),
        );
      }
    });

    it('rejects nested forbidden fields inside answers payload with 400', async () => {
      const token = await signUp('tamper_student_2');

      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token,
          payload: {},
        },
      );
      const attemptId = startRes.body.data.attempt.id;

      // Nested inside answers object
      const nestedObjRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token,
          payload: {
            answers: {
              q_sc_single: {
                answer: 'opt_pipe',
                correctOptionId: 'opt_pipe',
              },
            },
          },
        },
      );
      assert.equal(nestedObjRes.status, 400);
      assert.equal(nestedObjRes.body.errorCode, 'VALIDATION_ERROR');

      // Nested inside answers array
      const nestedArrRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token,
          payload: {
            answers: [
              {
                questionId: 'q_sc_single',
                score: 1.0,
              },
            ],
          },
        },
      );
      assert.equal(nestedArrRes.status, 400);
      assert.equal(nestedArrRes.body.errorCode, 'VALIDATION_ERROR');
    });

    it('rejects attempt start payload with forbidden fields', async () => {
      const token = await signUp('tamper_starter');

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token,
          payload: {
            score: 1.0,
            status: 'evaluated',
          },
        },
      );

      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, 'VALIDATION_ERROR');
    });
  });

  // ===========================================================================
  // 6. Attempt Lifecycle, Deduplication & Caps
  // ===========================================================================
  describe('6. Attempt Lifecycle, Deduplication & Caps', () => {
    it('deduplicates in-progress attempts on repeated start requests', async () => {
      const token = await signUp('dedup_student');

      const res1 = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token,
          payload: {},
        },
      );
      assert.equal(res1.status, 201);
      const attempt1Id = res1.body.data.attempt.id;

      // Start attempt again while in progress
      const res2 = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token,
          payload: {},
        },
      );
      assert.equal(res2.status, 201);
      assert.equal(res2.body.data.attempt.id, attempt1Id);
      assert.equal(res2.body.data.attempt.attemptNumber, 1);
    });

    it('rejects double-submission of an already evaluated attempt', async () => {
      const token = await signUp('double_submit_student');

      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token,
          payload: {},
        },
      );
      const attemptId = startRes.body.data.attempt.id;

      // First submit
      const submit1 = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token,
          payload: { answers: correctSubmissionFixture.answers },
        },
      );
      assert.equal(submit1.status, 200);

      // Second submit
      const submit2 = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token,
          payload: { answers: correctSubmissionFixture.answers },
        },
      );
      assert.equal(submit2.status, 400);
      assert.equal(submit2.body.errorCode, 'BAD_REQUEST');
      assert.match(submit2.body.message, /cannot be submitted again/);
    });

    it('enforces maximum 5 attempts per assessment and rejects 6th attempt start', async () => {
      const token = await signUp('max_attempts_student');

      for (let i = 1; i <= 5; i++) {
        const startRes = await sendJsonWithToken(
          server.baseUrl,
          `/api/assessments/${scoringTestAssessment.id}/attempts`,
          {
            method: 'POST',
            token,
            payload: {},
          },
        );
        assert.equal(startRes.status, 201);
        assert.equal(startRes.body.data.attempt.attemptNumber, i);

        await sendJsonWithToken(
          server.baseUrl,
          `/api/assessments/attempts/${startRes.body.data.attempt.id}/submit`,
          {
            method: 'POST',
            token,
            payload: { answers: correctSubmissionFixture.answers },
          },
        );
      }

      // 6th attempt must be rejected
      const sixthRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token,
          payload: {},
        },
      );
      assert.equal(sixthRes.status, 400);
      assert.equal(sixthRes.body.errorCode, 'BAD_REQUEST');
      assert.match(sixthRes.body.message, /Maximum number of attempts \(5\) reached/);
    });
  });

  // ===========================================================================
  // 7. Deterministic Evaluation & Evidence Integration
  // ===========================================================================
  describe('7. Deterministic Evaluation & Evidence Integration', () => {
    it('creates verified SkillEvidenceCheck when passing an intermediate assessment', async () => {
      const token = await signUp('passing_student');

      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token,
          payload: {},
        },
      );
      const attemptId = startRes.body.data.attempt.id;

      const submitRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token,
          payload: { answers: correctSubmissionFixture.answers },
        },
      );

      assert.equal(submitRes.status, 200);
      assert.equal(submitRes.body.success, true);
      const { attempt, evidenceResult, evidenceStatus } = submitRes.body.data;

      assert.equal(attempt.status, 'evaluated');
      assert.equal(attempt.passed, true);
      assert.equal(attempt.score, 1.0);
      assert.ok(attempt.evidenceCheckId);

      assert.equal(evidenceResult.eligibleForVerified, true);
      assert.equal(evidenceResult.evidence.strength, 'verified');
      assert.equal(evidenceStatus.eligibleForVerified, true);
      assert.equal(evidenceStatus.evidenceStrength, 'verified');

      // Verify SkillEvidenceCheck in DB
      const checkDoc = await SkillEvidenceCheck.findById(attempt.evidenceCheckId);
      assert.ok(checkDoc);
      assert.equal(checkDoc.eligibleForVerified, true);
      assert.equal(checkDoc.score, 1.0);
    });

    it('does NOT create SkillEvidenceCheck for beginner passes (evidence policy separation)', async () => {
      const token = await signUp('beginner_student');

      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${beginnerTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token,
          payload: {},
        },
      );
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
      const { attempt, evidenceResult, evidenceStatus } = submitRes.body.data;

      assert.equal(attempt.status, 'evaluated');
      assert.equal(attempt.passed, true);
      assert.equal(attempt.score, 1.0);
      assert.equal(attempt.evidenceCheckId, null);

      assert.equal(evidenceResult.eligibleForVerified, false);
      assert.equal(evidenceStatus.eligibleForVerified, false);
      assert.equal(evidenceStatus.evidenceStrength, 'supported');
      assert.equal(evidenceStatus.requiresStrongerProof, true);

      // Verify no check in DB
      const count = await SkillEvidenceCheck.countDocuments({});
      assert.equal(count, 0);
    });

    it('does NOT create SkillEvidenceCheck on failed attempts', async () => {
      const token = await signUp('failing_student');

      const startRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {
          method: 'POST',
          token,
          payload: {},
        },
      );
      const attemptId = startRes.body.data.attempt.id;

      const submitRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/assessments/attempts/${attemptId}/submit`,
        {
          method: 'POST',
          token,
          payload: {
            answers: {
              q_sc_single: 'opt_write',
              q_mc_partial: ['opt_sync'],
              q_code_out: 'WRONG',
              q_bool_val: false,
            },
          },
        },
      );

      assert.equal(submitRes.status, 200);
      const { attempt, evidenceResult, evidenceStatus } = submitRes.body.data;

      assert.equal(attempt.passed, false);
      assert.equal(attempt.outcome, 'fail');
      assert.equal(attempt.evidenceCheckId, null);
      assert.equal(evidenceResult.eligibleForVerified, false);
      assert.equal(evidenceStatus.outcome, 'fail');

      const count = await SkillEvidenceCheck.countDocuments({});
      assert.equal(count, 0);
    });
  });
});
