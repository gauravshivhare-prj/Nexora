import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  ATTEMPT_STATUS,
  QUESTION_ANSWER_STATUS,
  evaluateAssessmentSubmission,
  scoreQuestion,
} from '../src/domain/assessment/assessmentContract.js';
import {
  beginnerHighScorerSubmissionFixture,
  beginnerTestAssessment,
  correctSubmissionFixture,
  incorrectSubmissionFixture,
  invalidSubmissionFixture,
  partialSubmissionFixture,
  scoringTestAssessment,
  skippedSubmissionFixture,
} from './fixtures/assessmentScoringFixtures.js';
import {
  Assessment,
  AssessmentAttempt,
} from '../src/models/index.js';
import {
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
import { EVIDENCE_STRENGTH } from '../src/domain/evidence/evidence.js';

let server;
let mongoAvailable = true;

describe('A5 — Transparent Deterministic Scoring & Evidence Policy Separation', () => {
  before(async () => {
    try {
      server = await startTestServer();
    } catch {
      mongoAvailable = false;
    }
  });

  after(async () => {
    if (server) {
      await server.close();
    }
  });

  beforeEach(async () => {
    if (mongoAvailable) {
      await clearAssessmentAttempts();
      await clearAssessments();
      await clearSkillEvidenceChecks();
      await clearUsers();
    }
  });

  describe('Explicit Rules & Question-Level Status Breakdown', () => {
    it('accurately scores and tags correct submissions with explicit rule names', () => {
      const result = evaluateAssessmentSubmission({
        assessment: scoringTestAssessment,
        submission: correctSubmissionFixture,
      });

      assert.equal(result.score, 1);
      assert.equal(result.scoringSummary.percentage, 100);
      assert.equal(result.scoringSummary.correctCount, 4);
      assert.equal(result.scoringSummary.incorrectCount, 0);
      assert.equal(result.scoringSummary.partialCount, 0);
      assert.equal(result.scoringSummary.skippedCount, 0);
      assert.equal(result.scoringSummary.invalidCount, 0);

      // Verify explicit rule tagging on each question result
      const singleChoiceQ = result.questionResults.find((q) => q.questionId === 'q_sc_single');
      assert.equal(singleChoiceQ.status, QUESTION_ANSWER_STATUS.CORRECT);
      assert.equal(singleChoiceQ.scoringRule, 'exact_single_choice_match');
      assert.equal(singleChoiceQ.earnedPoints, 1);

      const multipleChoiceQ = result.questionResults.find((q) => q.questionId === 'q_mc_partial');
      assert.equal(multipleChoiceQ.status, QUESTION_ANSWER_STATUS.CORRECT);
      assert.equal(multipleChoiceQ.scoringRule, 'partial_credit_full_match');
      assert.equal(multipleChoiceQ.earnedPoints, 2);

      const codeOutputQ = result.questionResults.find((q) => q.questionId === 'q_code_out');
      assert.equal(codeOutputQ.status, QUESTION_ANSWER_STATUS.CORRECT);
      assert.equal(codeOutputQ.scoringRule, 'code_output_normalized_match');
    });

    it('accurately scores and tags incorrect submissions', () => {
      const result = evaluateAssessmentSubmission({
        assessment: scoringTestAssessment,
        submission: incorrectSubmissionFixture,
      });

      assert.equal(result.score, 0);
      assert.equal(result.scoringSummary.percentage, 0);
      assert.equal(result.scoringSummary.correctCount, 0);
      assert.equal(result.scoringSummary.incorrectCount, 4);
      assert.equal(result.passed, false);
      assert.equal(result.outcome, 'fail');

      for (const q of result.questionResults) {
        assert.equal(q.status, QUESTION_ANSWER_STATUS.INCORRECT);
        assert.equal(q.earnedPoints, 0);
        assert.ok(q.scoringRule && typeof q.scoringRule === 'string');
      }
    });

    it('accurately scores and tags partial credit submissions', () => {
      const result = evaluateAssessmentSubmission({
        assessment: scoringTestAssessment,
        submission: partialSubmissionFixture,
      });

      // Earned: 1 (single) + 1 (partial) + 0 (code) + 1 (bool) = 3 / 5 = 0.60
      assert.equal(result.score, 0.6);
      assert.equal(result.scoringSummary.percentage, 60);
      assert.equal(result.scoringSummary.correctCount, 2);
      assert.equal(result.scoringSummary.partialCount, 1);
      assert.equal(result.scoringSummary.incorrectCount, 1);

      const partialQ = result.questionResults.find((q) => q.questionId === 'q_mc_partial');
      assert.equal(partialQ.status, QUESTION_ANSWER_STATUS.PARTIAL);
      assert.equal(partialQ.scoringRule, 'partial_credit_proportional');
      assert.equal(partialQ.earnedPoints, 1);
      assert.equal(partialQ.maxPoints, 2);
    });

    it('transparently identifies skipped (null/omitted) answers without penalizing format', () => {
      const result = evaluateAssessmentSubmission({
        assessment: scoringTestAssessment,
        submission: skippedSubmissionFixture,
      });

      assert.equal(result.score, 0);
      assert.equal(result.scoringSummary.skippedCount, 4);

      for (const q of result.questionResults) {
        assert.equal(q.status, QUESTION_ANSWER_STATUS.SKIPPED);
        assert.equal(q.earnedPoints, 0);
        assert.ok(q.scoringRule.startsWith('skipped_'));
      }
    });

    it('safely handles invalid answer types and unknown option IDs without crashing', () => {
      const result = evaluateAssessmentSubmission({
        assessment: scoringTestAssessment,
        submission: invalidSubmissionFixture,
      });

      assert.equal(result.score, 0);
      assert.equal(result.scoringSummary.invalidCount, 4);

      const invalidSingleChoice = result.questionResults.find((q) => q.questionId === 'q_sc_single');
      assert.equal(invalidSingleChoice.status, QUESTION_ANSWER_STATUS.INVALID);
      assert.equal(invalidSingleChoice.scoringRule, 'invalid_option_id_not_found');

      const invalidMultiChoice = result.questionResults.find((q) => q.questionId === 'q_mc_partial');
      assert.equal(invalidMultiChoice.status, QUESTION_ANSWER_STATUS.INVALID);
      assert.equal(invalidMultiChoice.scoringRule, 'invalid_multiple_choice_expected_array');

      const invalidCode = result.questionResults.find((q) => q.questionId === 'q_code_out');
      assert.equal(invalidCode.status, QUESTION_ANSWER_STATUS.INVALID);
      assert.equal(invalidCode.scoringRule, 'invalid_code_output_expected_string');

      const invalidBool = result.questionResults.find((q) => q.questionId === 'q_bool_val');
      assert.equal(invalidBool.status, QUESTION_ANSWER_STATUS.INVALID);
      assert.equal(invalidBool.scoringRule, 'invalid_boolean_format');
    });
  });

  describe('Separation of Raw Score from Evidence Policy Status', () => {
    it('does NOT automatically award verified status to a 100% score on a beginner assessment', () => {
      const result = evaluateAssessmentSubmission({
        assessment: beginnerTestAssessment,
        submission: beginnerHighScorerSubmissionFixture,
      });

      // 1. Raw arithmetic score is 100%
      assert.equal(result.score, 1);
      assert.equal(result.scoringSummary.rawScore, 1);
      assert.equal(result.scoringSummary.percentage, 100);
      assert.equal(result.scoringSummary.passedThreshold, true);

      // 2. Evidence status is explicitly separated and capped at supported
      assert.equal(result.evidenceStatus.eligibleForVerified, false);
      assert.equal(result.evidenceStatus.evidenceStrength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(result.evidenceStatus.requiresStrongerProof, true);
      assert.match(result.evidenceStatus.reason, /intermediate threshold required for verified provenance/);

      // 3. Evidence payload does NOT emit verified strength
      assert.equal(result.evidenceResult.eligibleForVerified, false);
      assert.equal(result.evidenceResult.evidence, null);
    });

    it('awards verified status to intermediate assessment scoring above 0.70', () => {
      const result = evaluateAssessmentSubmission({
        assessment: scoringTestAssessment,
        submission: correctSubmissionFixture,
      });

      assert.equal(result.score, 1);
      assert.equal(result.evidenceStatus.eligibleForVerified, true);
      assert.equal(result.evidenceStatus.evidenceStrength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(result.evidenceStatus.requiresStrongerProof, false);
      assert.equal(result.evidenceResult.eligibleForVerified, true);
      assert.equal(result.evidenceResult.evidence.strength, 'verified');
    });

    it('withholds verified status when evaluation is marked advisory AI', () => {
      const result = evaluateAssessmentSubmission({
        assessment: scoringTestAssessment,
        submission: {
          ...correctSubmissionFixture,
          evaluatedBy: 'ai',
        },
      });

      assert.equal(result.score, 1);
      assert.equal(result.evidenceStatus.eligibleForVerified, false);
      assert.equal(result.evidenceStatus.requiresStrongerProof, true);
      assert.match(result.evidenceStatus.reason, /AI Copilot evaluations are advisory/);
      assert.equal(result.evidenceResult.eligibleForVerified, false);
    });

    it('withholds verified status when assessment is marked as practice', () => {
      const result = evaluateAssessmentSubmission({
        assessment: {
          ...scoringTestAssessment,
          isPractice: true,
        },
        submission: correctSubmissionFixture,
      });

      assert.equal(result.score, 1);
      assert.equal(result.evidenceStatus.eligibleForVerified, false);
      assert.equal(result.evidenceStatus.requiresStrongerProof, true);
      assert.match(result.evidenceStatus.reason, /Practice assessments establish supported evidence/);
      assert.equal(result.evidenceResult.eligibleForVerified, false);
    });
  });

  describe('Repeated Attempts Progression', () => {
    it('manages repeated attempts progression: fail -> pass -> verified evidence persistence', async (t) => {
      if (!mongoAvailable) {
        t.skip('MongoDB server not running on localhost:27017');
        return;
      }
      const userId = new mongoose.Types.ObjectId();
      await Assessment.create({
        assessmentId: scoringTestAssessment.id,
        version: scoringTestAssessment.version,
        skillKey: scoringTestAssessment.skillKey,
        skillName: scoringTestAssessment.skillName,
        difficulty: scoringTestAssessment.difficulty,
        title: scoringTestAssessment.title,
        description: scoringTestAssessment.description,
        passMark: scoringTestAssessment.passMark,
        timeLimitMinutes: scoringTestAssessment.timeLimitMinutes,
        questions: scoringTestAssessment.questions,
      });

      // --- Attempt 1: Student fails (submits incorrect answers) ---
      const attempt1 = await startAssessmentAttempt(userId, { assessmentId: scoringTestAssessment.id });
      assert.equal(attempt1.attemptNumber, 1);

      const submit1 = await submitAssessmentAttempt(userId, {
        attemptId: attempt1.id,
        answers: incorrectSubmissionFixture.answers,
      });

      assert.equal(submit1.attempt.status, 'evaluated');
      assert.equal(submit1.attempt.score, 0);
      assert.equal(submit1.attempt.passed, false);
      assert.equal(submit1.attempt.evidenceCheckId, null);

      // Verify no verified check exists in DB yet
      let checks = await SkillEvidenceCheck.find({ user: userId });
      assert.equal(checks.length, 0);

      // --- Attempt 2: Student retakes and passes ---
      const attempt2 = await startAssessmentAttempt(userId, { assessmentId: scoringTestAssessment.id });
      assert.equal(attempt2.attemptNumber, 2);

      const submit2 = await submitAssessmentAttempt(userId, {
        attemptId: attempt2.id,
        answers: correctSubmissionFixture.answers,
      });

      assert.equal(submit2.attempt.status, 'evaluated');
      assert.equal(submit2.attempt.score, 1);
      assert.equal(submit2.attempt.passed, true);
      assert.ok(submit2.attempt.evidenceCheckId);

      // Verify SkillEvidenceCheck document in MongoDB
      checks = await SkillEvidenceCheck.find({ user: userId });
      assert.equal(checks.length, 1);
      assert.equal(checks[0].outcome, 'pass');
      assert.equal(checks[0].eligibleForVerified, true);
      assert.equal(checks[0].reference, scoringTestAssessment.id);

      // Verify both attempts exist in history
      const allAttempts = await AssessmentAttempt.find({ user: userId }).sort({ attemptNumber: 1 });
      assert.equal(allAttempts.length, 2);
      assert.equal(allAttempts[0].passed, false);
      assert.equal(allAttempts[1].passed, true);
    });
  });
});
