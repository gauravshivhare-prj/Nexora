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
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import {
  clearAssessmentAttempts,
  clearAssessments,
  clearSkillEvidenceChecks,
  clearUsers,
  startTestServer,
} from './helpers/testServer.js';
import {
  beginnerHighScorerSubmissionFixture,
  beginnerTestAssessment,
  correctSubmissionFixture,
  partialSubmissionFixture,
  scoringTestAssessment,
} from './fixtures/assessmentScoringFixtures.js';
import { ATTEMPT_STATUS } from '../src/domain/assessment/assessmentContract.js';

let server;

describe('A6 — Assessment Service Integration Tests', () => {
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

    // Create the test assessments in MongoDB
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

  // ===========================================================================
  // 1. Ownership & Tenant Isolation
  // ===========================================================================
  describe('1. Ownership & Tenant Isolation', () => {
    const studentAId = new mongoose.Types.ObjectId();
    const studentBId = new mongoose.Types.ObjectId();

    it('allows a student to retrieve their own attempt but denies other students with 404', async () => {
      const attempt = await startAssessmentAttempt(studentAId, {
        assessmentId: scoringTestAssessment.id,
      });
      assert.ok(attempt.id);

      // Student A retrieves their own attempt
      const fetched = await getAttemptById(studentAId, attempt.id);
      assert.equal(fetched.id, attempt.id);
      assert.equal(fetched.assessmentId, scoringTestAssessment.id);

      // Student B attempting to retrieve Student A's attempt receives 404 (does NOT leak existence)
      await assert.rejects(
        () => getAttemptById(studentBId, attempt.id),
        (err) => {
          assert.equal(err.statusCode, 404);
          assert.equal(err.errorCode, 'NOT_FOUND');
          return true;
        },
      );
    });

    it('requires authentication for getAttemptById and handles non-existent IDs', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      await assert.rejects(
        () => getAttemptById(null, nonExistentId),
        (err) => {
          assert.equal(err.statusCode, 401);
          assert.equal(err.errorCode, 'AUTH_TOKEN_MISSING');
          return true;
        },
      );

      await assert.rejects(
        () => getAttemptById(studentAId, nonExistentId),
        (err) => {
          assert.equal(err.statusCode, 404);
          assert.equal(err.errorCode, 'NOT_FOUND');
          return true;
        },
      );
    });

    it('prevents Student B from submitting an attempt started by Student A', async () => {
      const attempt = await startAssessmentAttempt(studentAId, {
        assessmentId: scoringTestAssessment.id,
      });

      // Student B tries to submit Student A's attemptId
      await assert.rejects(
        () =>
          submitAssessmentAttempt(studentBId, {
            attemptId: attempt.id,
            answers: correctSubmissionFixture.answers,
          }),
        (err) => {
          assert.equal(err.statusCode, 404);
          assert.equal(err.errorCode, 'NOT_FOUND');
          return true;
        },
      );

      // Verify the attempt remains in_progress for Student A
      const attemptDoc = await AssessmentAttempt.findById(attempt.id);
      assert.equal(attemptDoc.status, ATTEMPT_STATUS.IN_PROGRESS);
    });

    it('isolates listUserAttempts between different students', async () => {
      await startAssessmentAttempt(studentAId, { assessmentId: scoringTestAssessment.id });
      await startAssessmentAttempt(studentBId, { assessmentId: scoringTestAssessment.id });

      const attemptsA = await listUserAttempts(studentAId);
      const attemptsB = await listUserAttempts(studentBId);

      assert.equal(attemptsA.length, 1);
      assert.equal(attemptsB.length, 1);
      assert.notEqual(attemptsA[0].id, attemptsB[0].id);

      // Anonymous listUserAttempts rejected
      await assert.rejects(
        () => listUserAttempts(null),
        (err) => {
          assert.equal(err.statusCode, 401);
          return true;
        },
      );
    });

    it('isolates getLatestAssessmentResult across students', async () => {
      const attempt = await startAssessmentAttempt(studentAId, {
        assessmentId: scoringTestAssessment.id,
      });
      await submitAssessmentAttempt(studentAId, {
        attemptId: attempt.id,
        answers: correctSubmissionFixture.answers,
      });

      // Student A has a completed latest result
      const latestA = await getLatestAssessmentResult(studentAId, scoringTestAssessment.id);
      assert.ok(latestA);
      assert.equal(latestA.status, ATTEMPT_STATUS.EVALUATED);
      assert.equal(latestA.passed, true);

      // Student B has not completed any attempts for this assessment
      const latestB = await getLatestAssessmentResult(studentBId, scoringTestAssessment.id);
      assert.equal(latestB, null);

      // Unauthenticated call rejected
      await assert.rejects(
        () => getLatestAssessmentResult(null, scoringTestAssessment.id),
        (err) => {
          assert.equal(err.statusCode, 401);
          return true;
        },
      );
    });
  });

  // ===========================================================================
  // 2. Repeated Attempts & Deduplication
  // ===========================================================================
  describe('2. Repeated Attempts & Deduplication', () => {
    const userId = new mongoose.Types.ObjectId();

    it('deduplicates in-progress attempts when starting another attempt for the same assessment', async () => {
      const first = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });
      assert.equal(first.attemptNumber, 1);
      assert.equal(first.status, ATTEMPT_STATUS.IN_PROGRESS);

      // Calling start again while attempt 1 is active returns the existing attempt
      const second = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });
      assert.equal(second.id, first.id);
      assert.equal(second.attemptNumber, 1);
      assert.equal(second.status, ATTEMPT_STATUS.IN_PROGRESS);

      const allAttempts = await AssessmentAttempt.find({
        user: userId,
        assessmentId: scoringTestAssessment.id,
      });
      assert.equal(allAttempts.length, 1);
    });

    it('advances attemptNumber sequentially on subsequent completed attempts', async () => {
      // Attempt 1
      const att1 = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });
      assert.equal(att1.attemptNumber, 1);
      await submitAssessmentAttempt(userId, {
        attemptId: att1.id,
        answers: partialSubmissionFixture.answers,
      });

      // Attempt 2
      const att2 = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });
      assert.equal(att2.attemptNumber, 2);
      await submitAssessmentAttempt(userId, {
        attemptId: att2.id,
        answers: correctSubmissionFixture.answers,
      });

      // Attempt 3
      const att3 = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });
      assert.equal(att3.attemptNumber, 3);

      const attempts = await listUserAttempts(userId, { assessmentId: scoringTestAssessment.id });
      assert.equal(attempts.length, 3);
    });

    it('strictly caps attempts at maximum of 5 and rejects 6th attempt', async () => {
      for (let i = 1; i <= 5; i++) {
        const attempt = await startAssessmentAttempt(userId, {
          assessmentId: scoringTestAssessment.id,
        });
        assert.equal(attempt.attemptNumber, i);
        await submitAssessmentAttempt(userId, {
          attemptId: attempt.id,
          answers: correctSubmissionFixture.answers,
        });
      }

      // 6th attempt must be rejected
      await assert.rejects(
        () =>
          startAssessmentAttempt(userId, {
            assessmentId: scoringTestAssessment.id,
          }),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /Maximum number of attempts \(5\) reached/);
          return true;
        },
      );
    });

    it('marks timed-out active attempt and creates the next attempt when startAssessmentAttempt is called after expiry', async () => {
      const attempt = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });

      // Simulate that the attempt started 30 minutes ago (timeLimitMinutes is 20 + 1 min grace = 21 mins)
      const pastDate = new Date(Date.now() - 30 * 60 * 1000);
      await AssessmentAttempt.updateOne({ _id: attempt.id }, { $set: { startedAt: pastDate } });

      // Calling startAssessmentAttempt now should detect timeout on attempt 1 and create attempt 2
      const nextAttempt = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });

      assert.equal(nextAttempt.attemptNumber, 2);
      assert.equal(nextAttempt.status, ATTEMPT_STATUS.IN_PROGRESS);

      const prevDoc = await AssessmentAttempt.findById(attempt.id);
      assert.equal(prevDoc.status, ATTEMPT_STATUS.TIMED_OUT);
      assert.equal(prevDoc.score, 0);
      assert.equal(prevDoc.passed, false);
    });
  });

  // ===========================================================================
  // 3. Malformed Answers & Anti-Tampering
  // ===========================================================================
  describe('3. Malformed Answers & Anti-Tampering', () => {
    const userId = new mongoose.Types.ObjectId();

    it('rejects client submission supplying forbidden scoring fields at root', async () => {
      const attempt = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });

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
        'evidenceCheckId',
        'status',
        'earnedPoints',
        'maxPoints',
        'isCorrect',
        'ratio',
        'scoringRule',
        'durationSeconds',
      ];

      for (const field of forbiddenFields) {
        await assert.rejects(
          () =>
            submitAssessmentAttempt(userId, {
              attemptId: attempt.id,
              answers: correctSubmissionFixture.answers,
              [field]: field === 'passed' ? true : 100,
            }),
          (err) => {
            assert.equal(err.statusCode, 400);
            assert.equal(err.errorCode, 'VALIDATION_ERROR');
            assert.match(err.message, new RegExp(`Client is forbidden from supplying scoring/verification field: "${field}"`));
            return true;
          },
          `Expected rejection for forbidden field: ${field}`,
        );
      }
    });

    it('rejects client submission supplying forbidden answer key fields at root', async () => {
      const attempt = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });

      const forbiddenAnswerKeyFields = [
        'expectedAnswer',
        'expectedOutput',
        'acceptedAnswers',
        'correctOptionId',
        'correctOptionIds',
        'answerKeys',
        'answerKey',
      ];

      for (const field of forbiddenAnswerKeyFields) {
        await assert.rejects(
          () =>
            submitAssessmentAttempt(userId, {
              attemptId: attempt.id,
              answers: correctSubmissionFixture.answers,
              [field]: { some: 'key' },
            }),
          (err) => {
            assert.equal(err.statusCode, 400);
            assert.equal(err.errorCode, 'VALIDATION_ERROR');
            assert.match(err.message, new RegExp(`Client is forbidden from supplying scoring/verification field: "${field}"`));
            return true;
          },
          `Expected rejection for forbidden answer key field: ${field}`,
        );
      }
    });

    it('rejects client submission attempting nested forbidden field injection inside answers', async () => {
      const attempt = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });

      // Injection inside answer object
      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            answers: {
              q_sc_single: {
                answer: 'opt_pipe',
                correctOptionId: 'opt_pipe',
              },
            },
          }),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.errorCode, 'VALIDATION_ERROR');
          return true;
        },
      );

      // Score injection inside answers array
      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            answers: [
              {
                questionId: 'q_sc_single',
                answer: 'opt_pipe',
                score: 1.0,
              },
            ],
          }),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.errorCode, 'VALIDATION_ERROR');
          return true;
        },
      );

      // Expected answer injection inside answers array
      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            answers: [
              {
                questionId: 'q_sc_single',
                answer: 'opt_pipe',
                expectedAnswer: 'opt_pipe',
              },
            ],
          }),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.errorCode, 'VALIDATION_ERROR');
          return true;
        },
      );
    });

    it('rejects malformed payloads, oversized answer strings, and oversized answers list', async () => {
      const attempt = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });

      // Non-object payload
      await assert.rejects(
        () => submitAssessmentAttempt(userId, 'string_payload'),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        },
      );

      // Answers is non-object
      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            answers: 12345,
          }),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /answers must be an object or array/);
          return true;
        },
      );

      // Answer text exceeds 1000 characters
      const oversizedText = 'a'.repeat(1001);
      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            answers: { q_code_out: oversizedText },
          }),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /exceeds maximum length of 1000 characters/);
          return true;
        },
      );

      // Answers payload with > 50 answers
      const oversizedAnswers = {};
      for (let i = 0; i < 51; i++) {
        oversizedAnswers[`q_${i}`] = 'ans';
      }
      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            answers: oversizedAnswers,
          }),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /exceeds limit of 50 answers/);
          return true;
        },
      );
    });

    it('rejects submitting answers for an already-completed attempt', async () => {
      const attempt = await startAssessmentAttempt(userId, {
        assessmentId: scoringTestAssessment.id,
      });

      // Submit once
      await submitAssessmentAttempt(userId, {
        attemptId: attempt.id,
        answers: correctSubmissionFixture.answers,
      });

      // Submit second time
      await assert.rejects(
        () =>
          submitAssessmentAttempt(userId, {
            attemptId: attempt.id,
            answers: correctSubmissionFixture.answers,
          }),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /cannot be submitted again/);
          return true;
        },
      );
    });
  });

  // ===========================================================================
  // 4. Deterministic Results & Evidence-Compatible Output
  // ===========================================================================
  describe('4. Deterministic Results & Evidence-Compatible Output', () => {
    const student1Id = new mongoose.Types.ObjectId();
    const student2Id = new mongoose.Types.ObjectId();

    it('fetches sanitized assessment that never exposes answer keys or explanations to students', async () => {
      const publicAssessment = await getAssessment(scoringTestAssessment.id);

      assert.equal(publicAssessment.id, scoringTestAssessment.id);
      assert.equal(publicAssessment.questions.length, scoringTestAssessment.questions.length);

      for (const question of publicAssessment.questions) {
        assert.ok(question.id);
        assert.ok(question.prompt);
        assert.ok(question.type);
        assert.ok(question.weight > 0);

        // Crucial: Secret fields must NOT exist
        assert.equal(question.expectedAnswer, undefined);
        assert.equal(question.explanation, undefined);

        if (question.options) {
          for (const opt of question.options) {
            assert.ok(opt.id);
            assert.ok(opt.text);
            assert.equal(opt.isCorrect, undefined);
          }
        }
      }
    });

    it('produces bit-for-bit identical results for identical submissions across different students', async () => {
      const att1 = await startAssessmentAttempt(student1Id, {
        assessmentId: scoringTestAssessment.id,
      });
      const att2 = await startAssessmentAttempt(student2Id, {
        assessmentId: scoringTestAssessment.id,
      });

      const res1 = await submitAssessmentAttempt(student1Id, {
        attemptId: att1.id,
        answers: partialSubmissionFixture.answers,
      });
      const res2 = await submitAssessmentAttempt(student2Id, {
        attemptId: att2.id,
        answers: partialSubmissionFixture.answers,
      });

      assert.equal(res1.attempt.score, res2.attempt.score);
      assert.equal(res1.attempt.earnedPoints, res2.attempt.earnedPoints);
      assert.equal(res1.attempt.maxPoints, res2.attempt.maxPoints);
      assert.equal(res1.attempt.passed, res2.attempt.passed);
      assert.equal(res1.attempt.outcome, res2.attempt.outcome);
      assert.equal(res1.attempt.correctQuestionsCount, res2.attempt.correctQuestionsCount);
      assert.deepEqual(res1.attempt.questionResults, res2.attempt.questionResults);
      assert.equal(res1.evidenceResult.eligibleForVerified, res2.evidenceResult.eligibleForVerified);
      assert.equal(res1.evidenceResult.outcome, res2.evidenceResult.outcome);
      assert.equal(res1.evidenceResult.score, res2.evidenceResult.score);
      assert.equal(res1.evidenceResult.kind, res2.evidenceResult.kind);
      assert.equal(res1.evidenceResult.skillKey, res2.evidenceResult.skillKey);
      assert.deepEqual(res1.evidenceResult.evidence, res2.evidenceResult.evidence);
    });

    it('produces verified evidence and links SkillEvidenceCheck when passing an intermediate assessment', async () => {
      const attempt = await startAssessmentAttempt(student1Id, {
        assessmentId: scoringTestAssessment.id,
      });

      const { attempt: completed, evidenceResult } = await submitAssessmentAttempt(student1Id, {
        attemptId: attempt.id,
        answers: correctSubmissionFixture.answers,
      });

      assert.equal(completed.status, ATTEMPT_STATUS.EVALUATED);
      assert.equal(completed.passed, true);
      assert.equal(completed.score, 1.0);
      assert.ok(completed.evidenceCheckId, 'Expected evidenceCheckId to be populated on attempt');

      // Check evidenceResult structure
      assert.equal(evidenceResult.eligibleForVerified, true);
      assert.equal(evidenceResult.outcome, 'pass');
      assert.equal(evidenceResult.evidence.source, 'assessment');
      assert.equal(evidenceResult.evidence.strength, 'verified');

      // Verify SkillEvidenceCheck document in MongoDB
      const checkDoc = await SkillEvidenceCheck.findById(completed.evidenceCheckId);
      assert.ok(checkDoc);
      assert.equal(String(checkDoc.user), String(student1Id));
      assert.equal(checkDoc.kind, 'assessment');
      assert.equal(checkDoc.skillKey, 'nodejs');
      assert.equal(checkDoc.score, 1.0);
      assert.equal(checkDoc.eligibleForVerified, true);
    });

    it('does NOT grant verified evidence or create SkillEvidenceCheck for beginner passes', async () => {
      const attempt = await startAssessmentAttempt(student1Id, {
        assessmentId: beginnerTestAssessment.id,
      });

      const { attempt: completed, evidenceResult, evidenceStatus } = await submitAssessmentAttempt(student1Id, {
        attemptId: attempt.id,
        answers: beginnerHighScorerSubmissionFixture.answers,
      });

      assert.equal(completed.status, ATTEMPT_STATUS.EVALUATED);
      assert.equal(completed.passed, true);
      assert.equal(completed.score, 1.0);
      assert.equal(completed.evidenceCheckId, null, 'Beginner pass must not link a verified evidence check');

      // Evidence policy separation: raw score is 100%, but evidenceResult is not verified
      assert.equal(evidenceResult.eligibleForVerified, false);
      assert.equal(evidenceResult.evidence, null);
      assert.equal(evidenceStatus.eligibleForVerified, false);
      assert.equal(evidenceStatus.evidenceStrength, 'supported');
      assert.equal(evidenceStatus.requiresStrongerProof, true);

      // Verify no SkillEvidenceCheck document was created
      const count = await SkillEvidenceCheck.countDocuments({ user: student1Id });
      assert.equal(count, 0);
    });

    it('does NOT grant evidence or create SkillEvidenceCheck on failed attempts', async () => {
      const attempt = await startAssessmentAttempt(student1Id, {
        assessmentId: scoringTestAssessment.id,
      });

      const { attempt: completed, evidenceResult } = await submitAssessmentAttempt(student1Id, {
        attemptId: attempt.id,
        answers: {
          q_sc_single: 'opt_write', // incorrect
          q_mc_partial: ['opt_sync'], // incorrect
          q_code_out: 'WRONG', // incorrect
          q_bool_val: false, // incorrect
        },
      });

      assert.equal(completed.status, ATTEMPT_STATUS.EVALUATED);
      assert.equal(completed.passed, false);
      assert.equal(completed.score, 0);
      assert.equal(completed.outcome, 'fail');
      assert.equal(completed.evidenceCheckId, null);

      assert.equal(evidenceResult.eligibleForVerified, false);
      assert.equal(evidenceResult.outcome, 'fail');
      assert.equal(evidenceResult.evidence, null);

      const count = await SkillEvidenceCheck.countDocuments({ user: student1Id });
      assert.equal(count, 0);
    });
  });
});
