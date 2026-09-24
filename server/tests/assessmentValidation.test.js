import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  Assessment,
  AssessmentAttempt,
  toPublicAssessment,
  toPublicAssessmentAttempt,
} from '../src/models/index.js';
import {
  createAssessment,
  getAssessment,
  listAssessments,
  listUserAttempts,
  seedAssessmentCatalog,
  startAssessmentAttempt,
  submitAssessmentAttempt,
} from '../src/services/assessment.service.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import {
  clearAssessmentAttempts,
  clearAssessments,
  clearSkillEvidenceChecks,
  clearUsers,
  startTestServer,
} from './helpers/testServer.js';
import { ASSESSMENT_LIMITS } from '../src/constants/assessmentPolicy.js';
import { DIFFICULTY_LEVELS, QUESTION_TYPES } from '../src/domain/assessment/assessmentContract.js';

let server;

describe('A3 — Assessment Models & Validation', () => {
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

  const validQuestion = {
    id: 'q1',
    type: QUESTION_TYPES.SINGLE_CHOICE,
    prompt: 'What is Node.js?',
    weight: 1,
    options: [
      { id: 'opt_1', text: 'JavaScript runtime built on V8' },
      { id: 'opt_2', text: 'A database system' },
    ],
    expectedAnswer: { correctOptionId: 'opt_1' },
    explanation: 'Node.js is a runtime.',
  };

  const validAssessmentPayload = {
    assessmentId: 'asm_test_nodejs',
    version: 1,
    skillKey: 'Node.js',
    skillName: 'Node.js',
    difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
    title: 'Node.js Core Evaluation',
    description: 'Measures runtime fundamentals and asynchronous programming.',
    passMark: 0.7,
    timeLimitMinutes: 30,
    questions: [validQuestion],
  };

  describe('Model Schema Validation', () => {
    it('accepts a valid assessment document and saves to database', async () => {
      const doc = await Assessment.create(validAssessmentPayload);
      assert.equal(doc.assessmentId, 'asm_test_nodejs');
      assert.equal(doc.skillKey, 'Node.js');
      assert.equal(doc.questions.length, 1);

      const pub = toPublicAssessment(doc);
      assert.equal(pub.id, 'asm_test_nodejs');
      assert.equal(pub.questions[0].expectedAnswer, undefined);
      assert.equal(pub.questions[0].explanation, undefined);
    });

    it('rejects unknown skill keys not in Nexora taxonomy', async () => {
      const invalidSkill = {
        ...validAssessmentPayload,
        assessmentId: 'asm_unknown_skill',
        skillKey: 'NonExistentSkill_999',
      };

      await assert.rejects(
        () => Assessment.create(invalidSkill),
        /Unknown canonical skill: "NonExistentSkill_999"/,
      );
    });

    it('rejects invalid difficulty values', async () => {
      const invalidDifficulty = {
        ...validAssessmentPayload,
        assessmentId: 'asm_invalid_diff',
        difficulty: 'expert_ninja',
      };

      await assert.rejects(
        () => Assessment.create(invalidDifficulty),
        /`expert_ninja` is not a valid enum value/,
      );
    });

    it('rejects invalid question types', async () => {
      const invalidType = {
        ...validAssessmentPayload,
        assessmentId: 'asm_invalid_type',
        questions: [
          {
            ...validQuestion,
            type: 'essay_freestyle',
          },
        ],
      };

      await assert.rejects(
        () => Assessment.create(invalidType),
        /`essay_freestyle` is not a valid enum value/,
      );
    });

    it('rejects impossible scores on AssessmentAttempt', async () => {
      const userId = new mongoose.Types.ObjectId();

      // Negative score
      await assert.rejects(
        () =>
          AssessmentAttempt.create({
            user: userId,
            assessmentId: 'asm_test_nodejs',
            attemptNumber: 1,
            skillKey: 'nodejs',
            skillName: 'Node.js',
            difficulty: 'intermediate',
            passMark: 0.7,
            score: -0.1,
          }),
        /less than minimum allowed value|Score must be a finite number between 0 and 1/,
      );

      // Score > 1
      await assert.rejects(
        () =>
          AssessmentAttempt.create({
            user: userId,
            assessmentId: 'asm_test_nodejs',
            attemptNumber: 1,
            skillKey: 'nodejs',
            skillName: 'Node.js',
            difficulty: 'intermediate',
            passMark: 0.7,
            score: 1.05,
          }),
        /more than maximum allowed value|Score must be a finite number between 0 and 1/,
      );

      // NaN or string score
      await assert.rejects(
        () =>
          AssessmentAttempt.create({
            user: userId,
            assessmentId: 'asm_test_nodejs',
            attemptNumber: 1,
            skillKey: 'nodejs',
            skillName: 'Node.js',
            difficulty: 'intermediate',
            passMark: 0.7,
            score: 'perfect_100',
          }),
        /Cast to Number failed/,
      );
    });

    it('enforces unique compound index on { user, assessmentId, attemptNumber }', async () => {
      const userId = new mongoose.Types.ObjectId();
      await AssessmentAttempt.create({
        user: userId,
        assessmentId: 'asm_test_nodejs',
        attemptNumber: 1,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        difficulty: 'intermediate',
        passMark: 0.7,
      });

      await assert.rejects(
        () =>
          AssessmentAttempt.create({
            user: userId,
            assessmentId: 'asm_test_nodejs',
            attemptNumber: 1,
            skillKey: 'nodejs',
            skillName: 'Node.js',
            difficulty: 'intermediate',
            passMark: 0.7,
          }),
        /E11000 duplicate key error/,
      );
    });
  });

  describe('Oversized Payload Protections', () => {
    it('rejects oversized prompt strings (> 1000 chars)', async () => {
      const oversizedPrompt = {
        ...validAssessmentPayload,
        assessmentId: 'asm_oversized_prompt',
        questions: [
          {
            ...validQuestion,
            prompt: 'A'.repeat(ASSESSMENT_LIMITS.prompt.max + 1),
          },
        ],
      };

      await assert.rejects(
        () => Assessment.create(oversizedPrompt),
        /longer than the maximum allowed length/,
      );
    });

    it('rejects oversized code snippets (> 4000 chars)', async () => {
      const oversizedSnippet = {
        ...validAssessmentPayload,
        assessmentId: 'asm_oversized_snippet',
        questions: [
          {
            ...validQuestion,
            codeSnippet: 'X'.repeat(ASSESSMENT_LIMITS.codeSnippet.max + 1),
          },
        ],
      };

      await assert.rejects(
        () => Assessment.create(oversizedSnippet),
        /longer than the maximum allowed length/,
      );
    });

    it('rejects assessments with too many questions (> 50)', async () => {
      const tooManyQuestions = {
        ...validAssessmentPayload,
        assessmentId: 'asm_too_many_q',
        questions: Array.from({ length: 51 }, (_, i) => ({
          ...validQuestion,
          id: `q_${i}`,
        })),
      };

      await assert.rejects(
        () => Assessment.create(tooManyQuestions),
        /between 1 and 50 questions/,
      );
    });

    it('rejects choice questions with too many options (> 10)', async () => {
      const tooManyOptions = {
        ...validAssessmentPayload,
        assessmentId: 'asm_too_many_opts',
        questions: [
          {
            ...validQuestion,
            options: Array.from({ length: 11 }, (_, i) => ({
              id: `opt_${i}`,
              text: `Option ${i}`,
            })),
          },
        ],
      };

      await assert.rejects(
        () => Assessment.create(tooManyOptions),
        /between 2 and 10 items/,
      );
    });

    it('rejects submission answer strings that exceed maximum length (1000 chars)', async () => {
      const userId = new mongoose.Types.ObjectId();
      await Assessment.create(validAssessmentPayload);

      const attempt = await startAssessmentAttempt(userId, { assessmentId: 'asm_test_nodejs' });

      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            answers: {
              q1: 'Z'.repeat(1001),
            },
          }),
        /exceeds maximum length of 1000 characters/,
      );
    });
  });

  describe('Anti-Tampering: Client-Controlled Verification Fields', () => {
    it('rejects submissions attempting to supply eligibleForVerified', async () => {
      const userId = new mongoose.Types.ObjectId();
      await Assessment.create(validAssessmentPayload);
      const attempt = await startAssessmentAttempt(userId, { assessmentId: 'asm_test_nodejs' });

      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            eligibleForVerified: true,
            answers: { q1: 'opt_1' },
          }),
        /Client is forbidden from supplying scoring\/verification field: "eligibleForVerified"/,
      );
    });

    it('rejects submissions attempting to supply score or outcome', async () => {
      const userId = new mongoose.Types.ObjectId();
      await Assessment.create(validAssessmentPayload);
      const attempt = await startAssessmentAttempt(userId, { assessmentId: 'asm_test_nodejs' });

      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            score: 1.0,
            answers: { q1: 'opt_1' },
          }),
        /Client is forbidden from supplying scoring\/verification field: "score"/,
      );

      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            outcome: 'pass',
            answers: { q1: 'opt_1' },
          }),
        /Client is forbidden from supplying scoring\/verification field: "outcome"/,
      );
    });

    it('rejects submissions attempting to forge evidence or passed status', async () => {
      const userId = new mongoose.Types.ObjectId();
      await Assessment.create(validAssessmentPayload);
      const attempt = await startAssessmentAttempt(userId, { assessmentId: 'asm_test_nodejs' });

      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            passed: true,
            answers: { q1: 'opt_1' },
          }),
        /Client is forbidden from supplying scoring\/verification field: "passed"/,
      );

      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            evidence: { strength: 'verified', source: 'assessment' },
            answers: { q1: 'opt_1' },
          }),
        /Client is forbidden from supplying scoring\/verification field: "evidence"/,
      );
    });
  });

  describe('Service Layer: Attempt Lifecycle & Evidence Recording', () => {
    it('manages attempt start, deterministic evaluation, and creates verified evidence on passing', async () => {
      const userId = new mongoose.Types.ObjectId();
      await Assessment.create(validAssessmentPayload);

      // 1. Start attempt
      const started = await startAssessmentAttempt(userId, { assessmentId: 'asm_test_nodejs' });
      assert.equal(started.status, 'in_progress');
      assert.equal(started.attemptNumber, 1);

      // 2. Submit correct answer
      const { attempt, evidenceResult } = await submitAssessmentAttempt(userId, {
        attemptId: started.id,
        answers: { q1: 'opt_1' },
      });

      assert.equal(attempt.status, 'evaluated');
      assert.equal(attempt.score, 1);
      assert.equal(attempt.passed, true);
      assert.equal(attempt.outcome, 'pass');
      assert.ok(attempt.evidenceCheckId, 'Passing attempt must link an evidenceCheck');

      // 3. Verify SkillEvidenceCheck document in MongoDB
      const checkDoc = await SkillEvidenceCheck.findById(attempt.evidenceCheckId);
      assert.ok(checkDoc);
      assert.equal(checkDoc.skillKey, 'nodejs');
      assert.equal(checkDoc.outcome, 'pass');
      assert.equal(checkDoc.eligibleForVerified, true);
      assert.equal(checkDoc.reference, 'asm_test_nodejs');

      // 4. Verify user attempt history
      const history = await listUserAttempts(userId, { assessmentId: 'asm_test_nodejs' });
      assert.equal(history.length, 1);
      assert.equal(history[0].id, attempt.id);
    });

    it('does not create verified evidence on failing score', async () => {
      const userId = new mongoose.Types.ObjectId();
      await Assessment.create(validAssessmentPayload);

      const started = await startAssessmentAttempt(userId, { assessmentId: 'asm_test_nodejs' });

      // Submit incorrect answer
      const { attempt, evidenceResult } = await submitAssessmentAttempt(userId, {
        attemptId: started.id,
        answers: { q1: 'opt_2' }, // wrong option
      });

      assert.equal(attempt.status, 'evaluated');
      assert.equal(attempt.score, 0);
      assert.equal(attempt.passed, false);
      assert.equal(attempt.outcome, 'fail');
      assert.equal(attempt.evidenceCheckId, null);

      // No SkillEvidenceCheck should have been created
      const checks = await SkillEvidenceCheck.find({ user: userId });
      assert.equal(checks.length, 0);
    });

    it('rejects double submission for an already evaluated attempt', async () => {
      const userId = new mongoose.Types.ObjectId();
      await Assessment.create(validAssessmentPayload);

      const started = await startAssessmentAttempt(userId, { assessmentId: 'asm_test_nodejs' });
      await submitAssessmentAttempt(userId, {
        attemptId: started.id,
        answers: { q1: 'opt_1' },
      });

      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: started.id,
            answers: { q1: 'opt_1' },
          }),
        /Attempt is already evaluated and cannot be submitted again/,
      );
    });

    it('prevents submitting an attempt belonging to another student', async () => {
      const ownerId = new mongoose.Types.ObjectId();
      const strangerId = new mongoose.Types.ObjectId();
      await Assessment.create(validAssessmentPayload);

      const started = await startAssessmentAttempt(ownerId, { assessmentId: 'asm_test_nodejs' });

      await assert.rejects(
        () =>
          submitAssessmentAttempt(strangerId, {
            attemptId: started.id,
            answers: { q1: 'opt_1' },
          }),
        /Active assessment attempt not found/,
      );
    });

    it('enforces max attempts limit (5)', async () => {
      const userId = new mongoose.Types.ObjectId();
      await Assessment.create(validAssessmentPayload);

      for (let i = 1; i <= ASSESSMENT_LIMITS.maxAttemptsPerAssessment; i++) {
        const attempt = await startAssessmentAttempt(userId, { assessmentId: 'asm_test_nodejs' });
        await submitAssessmentAttempt(userId, {
          attemptId: attempt.id,
          answers: { q1: 'opt_2' },
        });
      }

      await assert.rejects(
        () => startAssessmentAttempt(userId, { assessmentId: 'asm_test_nodejs' }),
        /Maximum number of attempts \(5\) reached/,
      );
    });
  });

  describe('Catalog Seeding & Filtering', () => {
    it('seeds the canonical catalog into MongoDB and lists sanitized assessments', async () => {
      await seedAssessmentCatalog();

      const all = await listAssessments();
      assert.ok(all.length >= 4);

      const jsOnly = await listAssessments({ skill: 'JavaScript' });
      assert.ok(jsOnly.length >= 1);
      assert.equal(jsOnly[0].skillKey, 'javascript');

      // Test alias resolution in filter
      const nodeAlias = await listAssessments({ skill: 'nodejs' });
      assert.ok(nodeAlias.length >= 1);
      assert.equal(nodeAlias[0].skillKey, 'nodejs');
    });

    it('rejects listing with an unknown skill filter', async () => {
      await assert.rejects(
        () => listAssessments({ skill: 'Fake_Skill_XYZ' }),
        /Unknown canonical skill/,
      );
    });
  });
});
