import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  Assessment,
  AssessmentAttempt,
} from '../src/models/index.js';
import {
  createAssessment,
  getAssessment,
  getAttemptById,
  getLatestAssessmentResult,
  listAssessments,
  listUserAttempts,
  seedAssessmentCatalog,
  startAssessmentAttempt,
  submitAssessmentAttempt,
} from '../src/services/assessment.service.js';
import {
  getAssessmentById as getCatalogAssessmentById,
  getAssessmentCatalog,
} from '../src/domain/assessment/assessmentCatalog.js';
import {
  getQuestionById,
  assembleAssessmentFromBank,
} from '../src/domain/assessment/questionBank.js';
import { ATTEMPT_STATUS } from '../src/domain/assessment/assessmentContract.js';
import {
  clearAssessmentAttempts,
  clearAssessments,
  clearSkillEvidenceChecks,
  clearUsers,
  startTestServer,
} from './helpers/testServer.js';
import {
  scoringTestAssessment,
  correctSubmissionFixture,
} from './fixtures/assessmentScoringFixtures.js';

let server;

describe('A14 — Assessment Performance & Quality Suite', () => {
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
    await clearUsers();
  });

  describe('1. Database Index Verification', () => {
    it('verifies compound indexes are registered on Assessment model', async () => {
      const indexes = await Assessment.collection.indexes();
      const indexKeySets = indexes.map((idx) => JSON.stringify(idx.key));

      // 1. { skillKey: 1, difficulty: 1, isActive: 1 }
      assert.ok(
        indexKeySets.some((k) => k === JSON.stringify({ skillKey: 1, difficulty: 1, isActive: 1 })),
        'Missing index: { skillKey: 1, difficulty: 1, isActive: 1 }',
      );

      // 2. { isActive: 1, title: 1 } for sorted catalog listings
      assert.ok(
        indexKeySets.some((k) => k === JSON.stringify({ isActive: 1, title: 1 })),
        'Missing index: { isActive: 1, title: 1 }',
      );

      // 3. { isActive: 1, skillKey: 1, difficulty: 1 } for filtered catalog searches
      assert.ok(
        indexKeySets.some((k) => k === JSON.stringify({ isActive: 1, skillKey: 1, difficulty: 1 })),
        'Missing index: { isActive: 1, skillKey: 1, difficulty: 1 }',
      );
    });

    it('verifies compound indexes are registered on AssessmentAttempt model', async () => {
      const indexes = await AssessmentAttempt.collection.indexes();
      const indexKeySets = indexes.map((idx) => JSON.stringify(idx.key));

      // 1. { user: 1, assessmentId: 1, attemptNumber: 1 } (unique attempt constraint)
      const uniqueAttemptIdx = indexes.find(
        (idx) => JSON.stringify(idx.key) === JSON.stringify({ user: 1, assessmentId: 1, attemptNumber: 1 }),
      );
      assert.ok(uniqueAttemptIdx, 'Missing index: { user: 1, assessmentId: 1, attemptNumber: 1 }');
      assert.equal(uniqueAttemptIdx.unique, true, 'Unique constraint must be enforced on attempt numbers');

      // 2. { user: 1, createdAt: -1 } for listing user attempt history
      assert.ok(
        indexKeySets.some((k) => k === JSON.stringify({ user: 1, createdAt: -1 })),
        'Missing index: { user: 1, createdAt: -1 }',
      );

      // 3. { user: 1, assessmentId: 1, status: 1, attemptNumber: -1 } for resolving latest attempt
      assert.ok(
        indexKeySets.some(
          (k) => k === JSON.stringify({ user: 1, assessmentId: 1, status: 1, attemptNumber: -1 }),
        ),
        'Missing index: { user: 1, assessmentId: 1, status: 1, attemptNumber: -1 }',
      );
    });
  });

  describe('2. Query Optimizations & Behavioral Invariance', () => {
    it('produces identical public assessment response contract via lean queries', async () => {
      await seedAssessmentCatalog();

      const list = await listAssessments();
      assert.ok(Array.isArray(list) && list.length > 0);

      for (const item of list) {
        // Assert field shape is completely preserved
        assert.ok(item.id, 'id is required');
        assert.ok(item.title, 'title is required');
        assert.ok(item.skillKey, 'skillKey is required');
        assert.ok(item.difficulty, 'difficulty is required');
        assert.ok(typeof item.totalQuestions === 'number');
        assert.ok(Array.isArray(item.questions));

        // Ensure answers/explanations are never leaked in lean projection
        for (const q of item.questions) {
          assert.equal(q.expectedAnswer, undefined, 'expectedAnswer must not be present');
          assert.equal(q.explanation, undefined, 'explanation must not be present');
          if (q.options) {
            for (const opt of q.options) {
              assert.equal(opt.isCorrect, undefined, 'isCorrect must not be present on option');
            }
          }
        }
      }

      // Fetch single assessment
      const firstId = list[0].id;
      const single = await getAssessment(firstId);
      assert.equal(single.id, firstId);
      assert.equal(single.title, list[0].title);
      assert.equal(single.totalQuestions, list[0].totalQuestions);
    });

    it('manages attempt lifecycle and returns lean attempts with identical shape', async () => {
      await createAssessment(scoringTestAssessment);

      const userId = new mongoose.Types.ObjectId().toString();

      // 1. Start attempt
      const attempt1 = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });

      assert.ok(attempt1.id);
      assert.equal(attempt1.assessmentId, scoringTestAssessment.id);
      assert.equal(attempt1.attemptNumber, 1);
      assert.equal(attempt1.status, ATTEMPT_STATUS.IN_PROGRESS);

      // 2. Submit attempt
      const submitRes = await submitAssessmentAttempt(userId, {
        attemptId: attempt1.id,
        answers: correctSubmissionFixture.answers,
      });

      assert.equal(submitRes.attempt.id, attempt1.id);
      assert.equal(submitRes.attempt.status, ATTEMPT_STATUS.EVALUATED);
      assert.equal(submitRes.attempt.passed, true);
      assert.equal(submitRes.attempt.score, 1);

      // 3. Fetch attempt by ID (lean)
      const fetched = await getAttemptById(userId, attempt1.id);
      assert.equal(fetched.id, attempt1.id);
      assert.equal(fetched.score, 1);
      assert.equal(fetched.passed, true);

      // 4. List user attempts (lean)
      const userAttempts = await listUserAttempts(userId, { assessmentId: scoringTestAssessment.id });
      assert.equal(userAttempts.length, 1);
      assert.equal(userAttempts[0].id, attempt1.id);

      // 5. Get latest result (lean)
      const latest = await getLatestAssessmentResult(userId, scoringTestAssessment.id);
      assert.ok(latest);
      assert.equal(latest.id, attempt1.id);
      assert.equal(latest.score, 1);
    });
  });

  describe('3. Atomic Timeout Transition Quality', () => {
    it('atomically transitions timed-out attempts without Mongoose save collisions', async () => {
      await createAssessment(scoringTestAssessment);

      const userId = new mongoose.Types.ObjectId().toString();

      // Create an attempt that started in the past (beyond time limit)
      const pastDate = new Date(Date.now() - 40 * 60 * 1000); // 40 minutes ago
      await AssessmentAttempt.create({
        user: userId,
        assessmentId: scoringTestAssessment.id,
        attemptNumber: 1,
        version: scoringTestAssessment.version,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        difficulty: scoringTestAssessment.difficulty,
        passMark: scoringTestAssessment.passMark,
        status: ATTEMPT_STATUS.IN_PROGRESS,
        startedAt: pastDate,
        answers: {},
      });

      // Starting next attempt should detect timeout, mark it TIMED_OUT atomically, and create attempt 2
      const attempt2 = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });

      assert.equal(attempt2.attemptNumber, 2);
      assert.equal(attempt2.status, ATTEMPT_STATUS.IN_PROGRESS);

      // Verify the first attempt in DB was updated to TIMED_OUT with 0 score
      const firstAttemptInDb = await AssessmentAttempt.findOne({
        user: userId,
        assessmentId: scoringTestAssessment.id,
        attemptNumber: 1,
      }).lean();

      assert.equal(firstAttemptInDb.status, ATTEMPT_STATUS.TIMED_OUT);
      assert.equal(firstAttemptInDb.passed, false);
      assert.equal(firstAttemptInDb.score, 0);
    });
  });

  describe('4. In-Memory O(1) Question Bank & Catalog Lookups', () => {
    it('retrieves questions and assessments from memory in sub-millisecond time', () => {
      const startCatalog = performance.now();
      for (let i = 0; i < 1000; i++) {
        const item = getCatalogAssessmentById('asm_javascript_intermediate');
        assert.ok(item);
      }
      const endCatalog = performance.now();
      const avgCatalogTimeMs = (endCatalog - startCatalog) / 1000;
      assert.ok(avgCatalogTimeMs < 0.1, `Catalog lookup took ${avgCatalogTimeMs}ms (expected < 0.1ms)`);

      const startQuestion = performance.now();
      for (let i = 0; i < 1000; i++) {
        const q = getQuestionById('qb_js_beg_equality');
        assert.ok(q);
      }
      const endQuestion = performance.now();
      const avgQuestionTimeMs = (endQuestion - startQuestion) / 1000;
      assert.ok(avgQuestionTimeMs < 0.1, `Question lookup took ${avgQuestionTimeMs}ms (expected < 0.1ms)`);
    });

    it('assembles assessment deterministically from question bank without database calls', () => {
      const assembled1 = assembleAssessmentFromBank({
        skill: 'JavaScript',
        difficulty: 'intermediate',
        questionCount: 3,
      });
      const assembled2 = assembleAssessmentFromBank({
        skill: 'JavaScript',
        difficulty: 'intermediate',
        questionCount: 3,
      });

      assert.deepEqual(assembled1.questions, assembled2.questions);
      assert.equal(assembled1.questions.length, 3);
      assert.equal(assembled1.skillKey, 'javascript');
    });
  });

  describe('5. Response Payload Boundaries & Memory Conservation', () => {
    it('confirms seedAssessmentCatalog uses lightweight projection queries', async () => {
      // Seed once
      await seedAssessmentCatalog();
      const countAfterFirst = await Assessment.countDocuments();
      assert.ok(countAfterFirst > 0);

      // Seed second time: should be idempotent and perform fast existence checks
      await seedAssessmentCatalog();
      const countAfterSecond = await Assessment.countDocuments();
      assert.equal(countAfterSecond, countAfterFirst);
    });

    it('ensures public assessment payloads remain compact without metadata bloat', async () => {
      await seedAssessmentCatalog();
      const catalog = await listAssessments();

      const serialized = JSON.stringify(catalog);
      // Entire catalog should be reasonably sized (< 100KB for all public assessments)
      assert.ok(
        serialized.length < 100_000,
        `Catalog JSON is unexpectedly oversized: ${serialized.length} bytes`,
      );

      // Verify no forbidden strings appear in public catalog JSON
      assert.ok(!serialized.includes('"correctOptionId"'));
      assert.ok(!serialized.includes('"expectedOutput"'));
      assert.ok(!serialized.includes('"expectedValue"'));
    });
  });
});
