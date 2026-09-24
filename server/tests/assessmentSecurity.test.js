import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

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
import { toPublicAssessment } from '../src/models/Assessment.model.js';
import { toPublicAssessmentAttempt } from '../src/models/AssessmentAttempt.model.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { ATTEMPT_STATUS } from '../src/domain/assessment/assessmentContract.js';

const PASSWORD = 'Str0ngPassphrase1!';
let counter = 0;
let server;

describe('A9 — Assessment Security Audit & Regression Suite', () => {
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

  async function registerAndLogin(label) {
    counter += 1;
    const email = `sec.${label}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: `User ${label}`,
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { token: body.data.token, user: body.data.user };
  }

  function post(path, payload, token) {
    return sendJsonWithToken(server.baseUrl, path, {
      method: 'POST',
      token,
      payload,
    });
  }

  function get(path, token) {
    return getWithToken(server.baseUrl, path, token);
  }

  // ===========================================================================
  // 1. Answer-Key & Internal Scoring Metadata Leakage
  // ===========================================================================
  describe('1. Answer-Key & Internal Metadata Leakage', () => {
    it('never exposes expected answers or scoring rules via GET /api/assessments/:assessmentId', async () => {
      const student = await registerAndLogin('sec_leak_detail');
      const res = await get(`/api/assessments/${scoringTestAssessment.id}`, student.token);

      assert.equal(res.status, 200);
      assert.ok(res.body.data.assessment);
      assert.ok(Array.isArray(res.body.data.assessment.questions));
      assert.ok(res.body.data.assessment.questions.length > 0);

      for (const q of res.body.data.assessment.questions) {
        assert.equal(q.expectedAnswer, undefined, 'expectedAnswer must not be present');
        assert.equal(q.expectedOutput, undefined, 'expectedOutput must not be present');
        assert.equal(q.acceptedAnswers, undefined, 'acceptedAnswers must not be present');
        assert.equal(q.scoringRule, undefined, 'scoringRule must not be present');
        assert.equal(q.explanation, undefined, 'explanation must not be present');
      }
    });

    it('never exposes internal metadata in public assessment projection helpers', () => {
      const rawDoc = {
        _id: 'dummy-id',
        assessmentId: 'test-asm',
        version: 1,
        skillKey: 'Node.js',
        skillName: 'Node.js',
        difficulty: 'intermediate',
        title: 'Node Test',
        questions: [
          {
            id: 'q1',
            type: 'single_choice',
            prompt: 'Sample?',
            options: [{ id: 'opt1', text: 'Opt 1' }],
            expectedAnswer: 'opt1',
            acceptedAnswers: ['opt1'],
            scoringRule: 'exact_match',
            explanation: 'Secret explanation',
          },
        ],
      };

      const pub = toPublicAssessment(rawDoc);
      assert.equal(pub.questions[0].expectedAnswer, undefined);
      assert.equal(pub.questions[0].acceptedAnswers, undefined);
      assert.equal(pub.questions[0].scoringRule, undefined);
      assert.equal(pub.questions[0].explanation, undefined);
    });

    it('never exposes explanation or scoringRule in public attempt result projections', async () => {
      const student = await registerAndLogin('sec_leak_attempt');
      const startRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        student.token,
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      const submitRes = await post(
        `/api/assessments/attempts/${attemptId}/submit`,
        { answers: correctSubmissionFixture.answers },
        student.token,
      );
      assert.equal(submitRes.status, 200);

      // Verify submit response
      const questionResults = submitRes.body.data.attempt.questionResults;
      assert.ok(Array.isArray(questionResults));
      for (const qr of questionResults) {
        assert.equal(qr.scoringRule, undefined, 'scoringRule must not be exposed');
        assert.equal(qr.explanation, undefined, 'explanation must not be exposed');
        assert.equal(qr.expectedAnswer, undefined, 'expectedAnswer must not be exposed');
      }

      // Verify get attempt by ID response
      const fetchRes = await get(`/api/assessments/attempts/${attemptId}`, student.token);
      assert.equal(fetchRes.status, 200);
      for (const qr of fetchRes.body.data.attempt.questionResults) {
        assert.equal(qr.scoringRule, undefined);
        assert.equal(qr.explanation, undefined);
        assert.equal(qr.expectedAnswer, undefined);
      }
    });
  });

  // ===========================================================================
  // 2. IDOR & Access Control Isolation
  // ===========================================================================
  describe('2. IDOR & Access Control Isolation', () => {
    it('rejects malformed non-hex attempt IDs with 404 without leaking internal stack traces', async () => {
      const student = await registerAndLogin('sec_idor_format');
      const malformedIds = [
        'not-a-valid-hex-id',
        '12345',
        '6ab41a72147426ad6d1aa2bZ',
        '../../admin',
        '6ab41a72147426ad6d1aa2b6extra',
      ];

      for (const badId of malformedIds) {
        const getRes = await get(`/api/assessments/attempts/${badId}`, student.token);
        assert.equal(getRes.status, 404, `GET with ID ${badId} should return 404`);
        assert.equal(getRes.body.errorCode, ERROR_CODES.NOT_FOUND);

        const subRes = await post(`/api/assessments/attempts/${badId}/submit`, { answers: {} }, student.token);
        assert.equal(subRes.status, 404, `POST with ID ${badId} should return 404`);
        assert.equal(subRes.body.errorCode, ERROR_CODES.NOT_FOUND);
      }
    });

    it('cross-tenant attempt retrieval returns 404 Not Found (no existence leak)', async () => {
      const userA = await registerAndLogin('sec_idor_a');
      const userB = await registerAndLogin('sec_idor_b');

      const startRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        userA.token,
      );
      assert.equal(startRes.status, 201);
      const attemptIdA = startRes.body.data.attempt.id;

      // User B attempts to read User A's attempt
      const getRes = await get(`/api/assessments/attempts/${attemptIdA}`, userB.token);
      assert.equal(getRes.status, 404, 'Must return 404 for attempt owned by another user');
      assert.equal(getRes.body.errorCode, ERROR_CODES.NOT_FOUND);
    });

    it('cross-tenant attempt submission returns 404 Not Found', async () => {
      const userA = await registerAndLogin('sec_idor_sub_a');
      const userB = await registerAndLogin('sec_idor_sub_b');

      const startRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        userA.token,
      );
      assert.equal(startRes.status, 201);
      const attemptIdA = startRes.body.data.attempt.id;

      // User B attempts to submit answers for User A's attempt
      const subRes = await post(
        `/api/assessments/attempts/${attemptIdA}/submit`,
        { answers: correctSubmissionFixture.answers },
        userB.token,
      );
      assert.equal(subRes.status, 404);
      assert.equal(subRes.body.errorCode, ERROR_CODES.NOT_FOUND);

      // Verify User A's attempt remains IN_PROGRESS
      const fetchA = await get(`/api/assessments/attempts/${attemptIdA}`, userA.token);
      assert.equal(fetchA.body.data.attempt.status, ATTEMPT_STATUS.IN_PROGRESS);
    });

    it('listUserAttempts strictly scopes results to the authenticated user', async () => {
      const userA = await registerAndLogin('sec_idor_list_a');
      const userB = await registerAndLogin('sec_idor_list_b');

      await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        userA.token,
      );

      const listB = await get('/api/assessments/attempts', userB.token);
      assert.equal(listB.status, 200);
      assert.equal(listB.body.data.attempts.length, 0, 'User B should not see User A attempts');
    });
  });

  // ===========================================================================
  // 3. Client-Controlled Score / Result & Anti-Tampering
  // ===========================================================================
  describe('3. Client-Controlled Score / Result & Anti-Tampering', () => {
    it('rejects attempt submissions that include client-supplied score, passed, or status', async () => {
      const student = await registerAndLogin('sec_client_score');
      const startRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        student.token,
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      const forbiddenKeys = ['score', 'passed', 'status', 'earnedPoints', 'outcome', 'evidenceCheck'];

      for (const field of forbiddenKeys) {
        const payload = {
          answers: correctSubmissionFixture.answers,
          [field]: field === 'passed' ? true : 100,
        };

        const res = await post(`/api/assessments/attempts/${attemptId}/submit`, payload, student.token);

        assert.equal(res.status, 400, `Supplying "${field}" must return 400`);
        assert.equal(res.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
      }
    });

    it('rejects prototype pollution and mongo operator injection in payloads', async () => {
      const student = await registerAndLogin('sec_proto_inj');
      const startRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        student.token,
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      const maliciousPayloads = [
        JSON.parse('{"__proto__":{"admin":true},"answers":{}}'),
        JSON.parse('{"constructor":{"prototype":{"poll":true}},"answers":{}}'),
        JSON.parse('{"prototype":{"polluted":true},"answers":{}}'),
        JSON.parse('{"$where":"sleep(1000)","answers":{}}'),
        JSON.parse('{"$gt":"","answers":{}}'),
      ];

      for (const payload of maliciousPayloads) {
        const res = await post(`/api/assessments/attempts/${attemptId}/submit`, payload, student.token);

        assert.equal(res.status, 400, 'Prototype/operator payload must return 400');
        assert.equal(res.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
      }
    });
  });

  // ===========================================================================
  // 4. Replay & Concurrency / Race Condition Protections
  // ===========================================================================
  describe('4. Replay & Concurrency Protections', () => {
    it('rejects sequential replay submission on an already evaluated attempt', async () => {
      const student = await registerAndLogin('sec_replay_seq');
      const startRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        student.token,
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      // First submission succeeds
      const firstRes = await post(
        `/api/assessments/attempts/${attemptId}/submit`,
        { answers: correctSubmissionFixture.answers },
        student.token,
      );
      assert.equal(firstRes.status, 200);
      assert.equal(firstRes.body.data.attempt.status, ATTEMPT_STATUS.EVALUATED);

      // Replay attempt fails
      const replayRes = await post(
        `/api/assessments/attempts/${attemptId}/submit`,
        { answers: correctSubmissionFixture.answers },
        student.token,
      );
      assert.equal(replayRes.status, 400);
      assert.ok(replayRes.body.message.includes('already evaluated'));
    });

    it('concurrent submissions on the same attempt result in exactly one evaluation and one failure', async () => {
      const student = await registerAndLogin('sec_replay_race');
      const startRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        student.token,
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      // Fire 2 concurrent submission requests simultaneously
      const [res1, res2] = await Promise.all([
        post(
          `/api/assessments/attempts/${attemptId}/submit`,
          { answers: correctSubmissionFixture.answers },
          student.token,
        ),
        post(
          `/api/assessments/attempts/${attemptId}/submit`,
          { answers: correctSubmissionFixture.answers },
          student.token,
        ),
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.deepEqual(
        statuses,
        [200, 400],
        'Exactly one concurrent submission must succeed (200) and the other must be rejected (400)',
      );

      // Verify that exactly ONE evidence check was created
      const userId = student.user.id ?? student.user._id;
      const evidenceChecks = await SkillEvidenceCheck.find({ user: userId });
      assert.equal(evidenceChecks.length, 1, 'Only one evidence check should be created');
    });
  });

  // ===========================================================================
  // 5. Payload Limits & Malformed Answer Protection
  // ===========================================================================
  describe('5. Payload Limits & Malformed Answers', () => {
    it('rejects answers payload exceeding maximum question count (> 50)', async () => {
      const student = await registerAndLogin('sec_limits_count');
      const startRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        student.token,
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      const oversizedAnswers = {};
      for (let i = 0; i < 55; i++) {
        oversizedAnswers[`q_${i}`] = 'answer';
      }

      const res = await post(
        `/api/assessments/attempts/${attemptId}/submit`,
        { answers: oversizedAnswers },
        student.token,
      );
      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
    });

    it('rejects answers containing text longer than 1000 characters', async () => {
      const student = await registerAndLogin('sec_limits_text');
      const startRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        student.token,
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      const longAnswer = 'a'.repeat(1050);
      const res = await post(
        `/api/assessments/attempts/${attemptId}/submit`,
        { answers: { 'q-node-01': longAnswer } },
        student.token,
      );
      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
    });

    it('rejects non-primitive objects and operator injection nested inside answers', async () => {
      const student = await registerAndLogin('sec_limits_nested');
      const startRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        student.token,
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      const injectionCases = [
        { 'q-node-01': { $gt: '' } },
        { 'q-node-01': { nested: true } },
        { 'q-node-01': [{ invalid: 'object' }] },
      ];

      for (const badAnswers of injectionCases) {
        const res = await post(
          `/api/assessments/attempts/${attemptId}/submit`,
          { answers: badAnswers },
          student.token,
        );
        assert.equal(res.status, 400);
        assert.equal(res.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
      }
    });
  });

  // ===========================================================================
  // 6. Rate Abuse & Limiter Enforcement
  // ===========================================================================
  describe('6. Rate Abuse & Limiter Enforcement', () => {
    it('enforces rate limit of 30 attempt start requests and returns 429 on 31st request', async () => {
      const student = await registerAndLogin('sec_rate_attempt');

      // Send 30 requests sequentially
      for (let i = 0; i < 30; i++) {
        const res = await post(
          `/api/assessments/${scoringTestAssessment.id}/attempts`,
          {},
          student.token,
        );
        // Up to attempt limit (5 per assessment) or bad request if cap reached, but NOT rate limited (429)
        assert.notEqual(res.status, 429, `Request ${i + 1} must not be rate limited`);
      }

      // 31st request must trigger 429
      const rateLimitedRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        student.token,
      );
      assert.equal(rateLimitedRes.status, 429, '31st attempt start request must return 429');
      assert.equal(rateLimitedRes.body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);

      // Verify reset works
      resetRateLimiters();
      const afterResetRes = await post(
        `/api/assessments/${beginnerTestAssessment.id}/attempts`,
        {},
        student.token,
      );
      assert.notEqual(afterResetRes.status, 429, 'After reset, request should not be 429');
    });

    it('enforces rate limit of 30 submission requests and returns 429 on 31st submission', async () => {
      const student = await registerAndLogin('sec_rate_submit');

      // Start an attempt to submit against
      const startRes = await post(
        `/api/assessments/${scoringTestAssessment.id}/attempts`,
        {},
        student.token,
      );
      assert.equal(startRes.status, 201);
      const attemptId = startRes.body.data.attempt.id;

      // Submit 30 times (first succeeds, remaining 29 fail with 400 already evaluated, but still consume submit limit)
      for (let i = 0; i < 30; i++) {
        const res = await post(
          `/api/assessments/attempts/${attemptId}/submit`,
          { answers: {} },
          student.token,
        );
        assert.notEqual(res.status, 429, `Submit request ${i + 1} should not be 429`);
      }

      // 31st request triggers rate limiter
      const rateLimitedRes = await post(
        `/api/assessments/attempts/${attemptId}/submit`,
        { answers: {} },
        student.token,
      );
      assert.equal(rateLimitedRes.status, 429, '31st submission request must return 429');
      assert.equal(rateLimitedRes.body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);
    });
  });

  // ===========================================================================
  // 7. Skill Taxonomy & Query Parameter Hardening
  // ===========================================================================
  describe('7. Skill Taxonomy & Query Parameter Hardening', () => {
    it('rejects catalog listing with unknown skill taxonomy key with 400 VALIDATION_ERROR', async () => {
      const student = await registerAndLogin('sec_query_skill');
      const res = await get('/api/assessments?skill=NotARealSkill123', student.token);
      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
      assert.ok(res.body.message.includes('canonical skill'));
    });

    it('rejects catalog listing with invalid difficulty filter with 400 VALIDATION_ERROR', async () => {
      const student = await registerAndLogin('sec_query_diff');
      const res = await get('/api/assessments?difficulty=insane_mode', student.token);
      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
      assert.ok(res.body.message.includes('Allowed values'));
    });

    it('rejects non-slug assessmentId path parameter with 400 VALIDATION_ERROR', async () => {
      const student = await registerAndLogin('sec_query_slug');
      const invalidSlugs = ['test$inject', 'test/../secret', 'test space'];

      for (const slug of invalidSlugs) {
        const res = await get(`/api/assessments/${encodeURIComponent(slug)}`, student.token);
        assert.equal(res.status, 400, `Slug ${slug} must be rejected with 400`);
        assert.equal(res.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
      }
    });

    it('rejects non-slug assessmentId filter parameter in attempts list with 400 VALIDATION_ERROR', async () => {
      const student = await registerAndLogin('sec_query_filter_slug');
      const res = await get('/api/assessments/attempts?assessmentId=evil$id', student.token);
      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
    });
  });
});
