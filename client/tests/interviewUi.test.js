import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_PRESENTATION,
  INTERVIEW_ERROR_CODES,
  INTERVIEW_EVIDENCE_STATUS,
  INTERVIEW_LIMITS,
  INTERVIEW_PASS_MARK,
  SESSION_STATUS,
  canAnswerSession,
  canCompleteSession,
  canStartSession,
  canTransitionSession,
  isSessionActive,
  isSessionExpired,
  isSessionPassed,
  resolveInterviewError,
  resolveInterviewEvidenceStatus,
} from '../src/constants/interviewOptions.js';

import {
  toInterviewEvaluation,
  toInterviewEvidenceCheck,
  toInterviewEvidenceResult,
  toInterviewQuestion,
  toInterviewSession,
} from '../src/services/interview.service.js';

describe('TASK R20 — Client Interview UI Integration & State Flow', () => {
  describe('1. Setup & Start Flow Verification', () => {
    it('validates target skills boundaries during setup (1 to 5 skills)', () => {
      assert.equal(INTERVIEW_LIMITS.maxTargetSkills, 5);
      assert.equal(INTERVIEW_LIMITS.minQuestions, 1);
      assert.equal(INTERVIEW_LIMITS.maxQuestions, 10);

      const validSkills = ['Node.js', 'SQL', 'REST APIs'];
      assert.ok(validSkills.length <= INTERVIEW_LIMITS.maxTargetSkills);

      const tooManySkills = ['Node.js', 'SQL', 'REST APIs', 'Docker', 'Redis', 'GraphQL'];
      assert.ok(tooManySkills.length > INTERVIEW_LIMITS.maxTargetSkills);
    });

    it('provides rich UI presentation tokens for all difficulty tiers', () => {
      for (const diff of Object.values(INTERVIEW_DIFFICULTY)) {
        const presentation = INTERVIEW_DIFFICULTY_PRESENTATION[diff];
        assert.ok(presentation, `Missing presentation for difficulty ${diff}`);
        assert.ok(presentation.label);
        assert.ok(presentation.badgeClass);
        assert.ok(presentation.description);
      }
    });

    it('canStartSession enables starting only for initialized sessions', () => {
      assert.equal(canStartSession({ status: SESSION_STATUS.INITIALIZED }), true);
      assert.equal(canStartSession({ status: SESSION_STATUS.IN_PROGRESS }), false);
      assert.equal(canStartSession({ status: SESSION_STATUS.COMPLETED }), false);
      assert.equal(canStartSession(null), false);
    });
  });

  describe('2. Active Question Flow & Answer Input Validation', () => {
    it('enforces character constraints on candidate answers (10 to 5000 chars)', () => {
      const min = INTERVIEW_LIMITS.studentAnswer.min;
      const max = INTERVIEW_LIMITS.studentAnswer.max;
      assert.equal(min, 10);
      assert.equal(max, 5000);

      const tooShort = 'short';
      assert.ok(tooShort.length < min);

      const validAnswer = 'A thorough technical explanation describing Node.js event loop and worker threads.';
      assert.ok(validAnswer.length >= min && validAnswer.length <= max);

      const oversized = 'a'.repeat(5001);
      assert.ok(oversized.length > max);
    });

    it('canAnswerSession gates submission when attempts or expiration limits are met', () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      const pastDate = new Date(Date.now() - 60000).toISOString();

      const activeSession = {
        status: SESSION_STATUS.IN_PROGRESS,
        expiresAt: futureDate,
        attemptCount: 0,
        maxAttemptsTotal: 10,
        attemptLimitPerQuestion: 1,
        questions: [{ id: 'q1', answer: null }],
      };
      assert.equal(canAnswerSession(activeSession, 'q1'), true);

      // Question already answered with max attempts
      const answeredSession = {
        ...activeSession,
        attemptCount: 1,
        questions: [{ id: 'q1', answer: { attemptNumber: 1 } }],
      };
      assert.equal(canAnswerSession(answeredSession, 'q1'), false);

      // Expired session cannot be answered
      const expiredSession = {
        ...activeSession,
        expiresAt: pastDate,
      };
      assert.equal(canAnswerSession(expiredSession, 'q1'), false);
    });
  });

  describe('3. Loading, Error Semantics and Retry Resolution', () => {
    it('resolves retryable AI provider and network errors for UI banner and button', () => {
      const providerError = {
        errorCode: INTERVIEW_ERROR_CODES.AI_PROVIDER_FAILED,
        message: 'The AI model timed out while analyzing rubric criteria.',
        status: 502,
      };

      const resolved = resolveInterviewError(providerError);
      assert.equal(resolved.code, INTERVIEW_ERROR_CODES.AI_PROVIDER_FAILED);
      assert.equal(resolved.title, 'Service Interruption');
      assert.equal(resolved.retryable, true);
      assert.ok(resolved.userAction.includes('retry'));

      const evaluationError = {
        errorCode: INTERVIEW_ERROR_CODES.INTERVIEW_EVALUATION_FAILED,
        status: 500,
      };
      const resolvedEval = resolveInterviewError(evaluationError);
      assert.equal(resolvedEval.retryable, true);
    });

    it('marks non-retryable terminal errors correctly', () => {
      const expiredError = {
        errorCode: INTERVIEW_ERROR_CODES.INTERVIEW_SESSION_EXPIRED,
        status: 400,
      };
      const resolved = resolveInterviewError(expiredError);
      assert.equal(resolved.code, INTERVIEW_ERROR_CODES.INTERVIEW_SESSION_EXPIRED);
      assert.equal(resolved.retryable, false);

      const notFoundError = {
        errorCode: INTERVIEW_ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND,
        status: 404,
      };
      assert.equal(resolveInterviewError(notFoundError).retryable, false);
    });
  });

  describe('4. Question Evaluation Presentation & Dimension Breakdown', () => {
    it('normalizes rubric dimensions and composite scores cleanly', () => {
      const rawEval = {
        dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.8, relevance: 0.95 },
        compositeScore: 0.875,
        feedback: 'Excellent breakdown of asynchronous microtask execution.',
        strengths: ['Accurate event loop phase description', 'Mentioned process.nextTick'],
        growthAreas: ['Could elaborate on worker_threads communication overhead'],
        groundedSkills: ['Node.js'],
      };

      const normalized = toInterviewEvaluation(rawEval);
      assert.equal(normalized.compositeScore, 0.875);
      assert.equal(normalized.dimensions.accuracy, 0.9);
      assert.equal(normalized.dimensions.depth, 0.85);
      assert.equal(normalized.strengths.length, 2);
      assert.equal(normalized.growthAreas.length, 1);
      assert.deepEqual(normalized.groundedSkills, ['Node.js']);
    });
  });

  describe('5. Results & Institutional Evidence Status Verification', () => {
    it('resolves Advisory Supported badge for AI passing evaluation (≥75%)', () => {
      const result = resolveInterviewEvidenceStatus({
        overallScore: 0.84,
        evaluatorType: 'ai',
        eligibleForVerified: false,
        status: SESSION_STATUS.COMPLETED,
      });

      assert.equal(result.statusKey, INTERVIEW_EVIDENCE_STATUS.ADVISORY_SUPPORTED);
      assert.equal(result.isVerified, false);
      assert.equal(result.isSupported, true);
      assert.equal(result.isPassing, true);
      assert.ok(result.badgeClass.includes('amber'));
      assert.ok(result.description.includes('CareerTwin readiness guidance'));
    });

    it('resolves Institutionally Verified badge for Human passing evaluation (≥75%)', () => {
      const result = resolveInterviewEvidenceStatus({
        overallScore: 0.90,
        evaluatorType: 'human',
        eligibleForVerified: true,
        status: SESSION_STATUS.COMPLETED,
      });

      assert.equal(result.statusKey, INTERVIEW_EVIDENCE_STATUS.VERIFIED);
      assert.equal(result.isVerified, true);
      assert.equal(result.isSupported, true);
      assert.equal(result.isPassing, true);
      assert.ok(result.badgeClass.includes('emerald'));
    });

    it('resolves Below Passing Threshold badge for evaluation under 75%', () => {
      const result = resolveInterviewEvidenceStatus({
        overallScore: 0.62,
        evaluatorType: 'ai',
        eligibleForVerified: false,
        status: SESSION_STATUS.COMPLETED,
      });

      assert.equal(result.statusKey, INTERVIEW_EVIDENCE_STATUS.UNVERIFIED_BELOW_PASS);
      assert.equal(result.isVerified, false);
      assert.equal(result.isSupported, false);
      assert.equal(result.isPassing, false);
      assert.ok(result.badgeClass.includes('rose'));
    });

    it('isSessionPassed returns true only on completed passing session', () => {
      assert.equal(
        isSessionPassed({ status: SESSION_STATUS.COMPLETED, overallScore: 0.75 }),
        true,
      );
      assert.equal(
        isSessionPassed({ status: SESSION_STATUS.COMPLETED, overallScore: 0.749 }),
        false,
      );
      assert.equal(
        isSessionPassed({ status: SESSION_STATUS.IN_PROGRESS, overallScore: 0.95 }),
        false,
      );
    });
  });
});
