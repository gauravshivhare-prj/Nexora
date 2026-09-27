import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ATTEMPT_STATUS,
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  SCORING_STRATEGIES,
  evaluateAssessmentSubmission,
  validateAssessmentDefinition,
} from '../src/domain/assessment/assessmentContract.js';
import { EVIDENCE_STRENGTH } from '../src/domain/evidence/evidence.js';
import {
  CHECK_KINDS,
  CHECK_OUTCOMES,
  buildAssessmentResult,
} from '../src/domain/evidence/skillEvidenceCheck.js';
import { buildCareerTwin } from '../src/domain/careerTwin/buildCareerTwin.js';
import { isCareerTwinStale } from '../src/models/CareerTwin.model.js';
import {
  Assessment,
  toAdminAssessment,
  toPublicAssessment,
} from '../src/models/Assessment.model.js';
import {
  AssessmentAttempt,
  toPublicAssessmentAttempt,
} from '../src/models/AssessmentAttempt.model.js';
import { assertNoForbiddenClientFields } from '../src/services/assessment.service.js';
import {
  beginnerHighScorerSubmissionFixture,
  beginnerTestAssessment,
  correctSubmissionFixture,
  partialSubmissionFixture,
  practiceHighScorerSubmissionFixture,
  practiceTestAssessment,
  scoringTestAssessment,
} from './fixtures/assessmentScoringFixtures.js';

describe('TASK A10 — Assessment Evidence Integration & CareerTwin Staleness Policy', () => {
  // =========================================================================
  // 1. Evidence Threshold & Policy Matrix
  // =========================================================================
  describe('1. Evidence Threshold & Policy Matrix', () => {
    it('grants eligibleForVerified: true and strength: verified for passing intermediate assessment', () => {
      const evalDate = new Date('2026-09-24T12:00:00.000Z');
      const evalResult = evaluateAssessmentSubmission({
        assessment: scoringTestAssessment,
        submission: {
          assessmentId: scoringTestAssessment.id,
          studentId: 'student-eligible-1',
          startedAt: new Date(evalDate.getTime() - 600000),
          answers: correctSubmissionFixture.answers,
        },
        evaluatedAt: evalDate,
      });

      assert.equal(evalResult.passed, true);
      assert.equal(evalResult.score, 1.0);
      assert.equal(evalResult.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(evalResult.evidenceStatus.eligibleForVerified, true);
      assert.equal(evalResult.evidenceStatus.evidenceStrength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(evalResult.evidenceStatus.requiresStrongerProof, false);
      assert.match(evalResult.evidenceStatus.reason, /meeting all verified provenance requirements/i);

      assert.ok(evalResult.evidenceResult);
      assert.equal(evalResult.evidenceResult.eligibleForVerified, true);
      assert.equal(evalResult.evidenceResult.kind, CHECK_KINDS.ASSESSMENT);
      assert.equal(evalResult.evidenceResult.skillKey, 'nodejs');
      assert.ok(evalResult.evidenceResult.evidence);
      assert.equal(evalResult.evidenceResult.evidence.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(evalResult.evidenceResult.evidence.source, 'assessment');
    });

    it('enforces exact passMark threshold boundary: score >= passMark passes, score < passMark fails', () => {
      const evalDate = new Date('2026-09-24T12:00:00.000Z');

      // 1. Exactly at passMark (0.70)
      const passingBoundaryAssessment = {
        ...scoringTestAssessment,
        questions: [
          {
            id: 'q_exact_pass',
            type: QUESTION_TYPES.SINGLE_CHOICE,
            prompt: 'Test single choice?',
            weight: 10,
            options: [
              { id: 'opt_1', text: 'Correct' },
              { id: 'opt_2', text: 'Wrong' },
            ],
            expectedAnswer: { correctOptionId: 'opt_1' },
          },
        ],
        passMark: 0.70,
      };

      const boundaryPassResult = evaluateAssessmentSubmission({
        assessment: passingBoundaryAssessment,
        submission: {
          assessmentId: passingBoundaryAssessment.id,
          studentId: 'student-bound-1',
          startedAt: new Date(evalDate.getTime() - 300000),
          answers: { q_exact_pass: 'opt_1' },
        },
        evaluatedAt: evalDate,
      });
      assert.equal(boundaryPassResult.passed, true);
      assert.equal(boundaryPassResult.evidenceStatus.eligibleForVerified, true);
      assert.equal(boundaryPassResult.evidenceStatus.evidenceStrength, EVIDENCE_STRENGTH.VERIFIED);

      // 2. Below passMark (0.60 vs 0.70 passMark)
      const failingPartialResult = evaluateAssessmentSubmission({
        assessment: scoringTestAssessment,
        submission: {
          assessmentId: scoringTestAssessment.id,
          studentId: 'student-fail-1',
          startedAt: new Date(evalDate.getTime() - 300000),
          answers: partialSubmissionFixture.answers,
        },
        evaluatedAt: evalDate,
      });

      assert.equal(failingPartialResult.passed, false);
      assert.equal(failingPartialResult.score, 0.6);
      assert.equal(failingPartialResult.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(failingPartialResult.evidenceStatus.eligibleForVerified, false);
      assert.equal(failingPartialResult.evidenceStatus.evidenceStrength, null);
      assert.match(failingPartialResult.evidenceStatus.reason, /Raw score \(60%\) does not meet passing threshold \(70%\)/);
      assert.equal(failingPartialResult.evidenceResult.eligibleForVerified, false);
      assert.equal(failingPartialResult.evidenceResult.evidence, null);
    });

    it('beginner assessment scoring 100% yields outcome: pass but eligibleForVerified: false and strength: supported', () => {
      const evalDate = new Date('2026-09-24T12:00:00.000Z');
      const evalResult = evaluateAssessmentSubmission({
        assessment: beginnerTestAssessment,
        submission: {
          assessmentId: beginnerTestAssessment.id,
          studentId: 'student-beg-hero',
          startedAt: new Date(evalDate.getTime() - 300000),
          answers: beginnerHighScorerSubmissionFixture.answers,
        },
        evaluatedAt: evalDate,
      });

      assert.equal(evalResult.passed, true);
      assert.equal(evalResult.score, 1.0);
      assert.equal(evalResult.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(evalResult.evidenceStatus.eligibleForVerified, false);
      assert.equal(evalResult.evidenceStatus.evidenceStrength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(evalResult.evidenceStatus.requiresStrongerProof, true);
      assert.match(
        evalResult.evidenceStatus.reason,
        /Beginner assessments provide supported evidence but do not meet the intermediate threshold/i,
      );

      assert.ok(evalResult.evidenceResult);
      assert.equal(evalResult.evidenceResult.eligibleForVerified, false);
      assert.equal(evalResult.evidenceResult.evidence, null);
    });

    it('practice assessment scoring 100% yields outcome: pass but eligibleForVerified: false and strength: supported', () => {
      const evalDate = new Date('2026-09-24T12:00:00.000Z');
      const evalResult = evaluateAssessmentSubmission({
        assessment: practiceTestAssessment,
        submission: {
          assessmentId: practiceTestAssessment.id,
          studentId: 'student-practice-hero',
          startedAt: new Date(evalDate.getTime() - 300000),
          answers: practiceHighScorerSubmissionFixture.answers,
        },
        evaluatedAt: evalDate,
      });

      assert.equal(evalResult.passed, true);
      assert.equal(evalResult.score, 1.0);
      assert.equal(evalResult.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(evalResult.evidenceStatus.eligibleForVerified, false);
      assert.equal(evalResult.evidenceStatus.evidenceStrength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(evalResult.evidenceStatus.requiresStrongerProof, true);
      assert.match(
        evalResult.evidenceStatus.reason,
        /Practice assessments establish supported evidence but cannot produce verified provenance/i,
      );

      assert.ok(evalResult.evidenceResult);
      assert.equal(evalResult.evidenceResult.eligibleForVerified, false);
      assert.equal(evalResult.evidenceResult.evidence, null);
    });

    it('blocks AI-evaluated assessments from creating verified evidence', () => {
      const evalDate = new Date('2026-09-24T12:00:00.000Z');
      const evalResult = evaluateAssessmentSubmission({
        assessment: { ...scoringTestAssessment, evaluatedBy: 'ai' },
        submission: {
          assessmentId: scoringTestAssessment.id,
          studentId: 'student-ai-eval',
          startedAt: new Date(evalDate.getTime() - 300000),
          answers: correctSubmissionFixture.answers,
        },
        evaluatedAt: evalDate,
      });

      assert.equal(evalResult.passed, true);
      assert.equal(evalResult.evidenceStatus.eligibleForVerified, false);
      assert.equal(evalResult.evidenceStatus.evidenceStrength, EVIDENCE_STRENGTH.SUPPORTED);
      assert.equal(evalResult.evidenceStatus.requiresStrongerProof, true);
      assert.match(evalResult.evidenceStatus.reason, /AI Copilot evaluations are advisory/i);
    });

    it('timed out attempt fails with score 0 and eligibleForVerified: false', () => {
      const startTime = new Date('2026-09-24T10:00:00.000Z');
      const evalDate = new Date('2026-09-24T10:35:00.000Z'); // 35 minutes later (limit 20 + 1 min grace = 21m max)

      const evalResult = evaluateAssessmentSubmission({
        assessment: scoringTestAssessment,
        submission: {
          assessmentId: scoringTestAssessment.id,
          studentId: 'student-timeout',
          startedAt: startTime,
          answers: correctSubmissionFixture.answers,
        },
        evaluatedAt: evalDate,
      });

      assert.equal(evalResult.status, ATTEMPT_STATUS.TIMED_OUT);
      assert.equal(evalResult.passed, false);
      assert.equal(evalResult.score, 0);
      assert.equal(evalResult.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(evalResult.evidenceStatus.eligibleForVerified, false);
      assert.equal(evalResult.evidenceStatus.evidenceStrength, null);
      assert.match(evalResult.evidenceStatus.reason, /Assessment attempt timed out/i);
    });
  });

  // =========================================================================
  // 2. CareerTwin Staleness: Eligible vs Practice / Beginner Outcomes
  // =========================================================================
  describe('2. CareerTwin Staleness: Eligible vs Practice / Beginner Outcomes', () => {
    const twinGeneratedAt = new Date('2026-09-24T11:00:00.000Z');
    const baseTwin = {
      generatedAt: twinGeneratedAt,
      sources: {
        profileUpdatedAt: twinGeneratedAt,
        analysedResumeIds: ['resume_01'],
        verifiedEvidenceCount: 0,
      },
    };

    it('marks CareerTwin stale when eligible verified evidence completed AFTER twin generation', () => {
      const evidenceCompletedAt = new Date('2026-09-24T11:30:00.000Z');
      const staleness = isCareerTwinStale(baseTwin, {
        profileUpdatedAt: twinGeneratedAt,
        analysedResumeIds: ['resume_01'],
        latestAnalysisAt: null,
        latestEvidenceAt: evidenceCompletedAt,
        verifiedEvidenceCount: 1,
      });

      assert.equal(staleness.isStale, true);
      assert.deepEqual(staleness.reasons, ['New skill evidence has been recorded since this was generated.']);
    });

    it('marks CareerTwin stale when verifiedEvidenceCount increases even if timestamps align', () => {
      const staleness = isCareerTwinStale(baseTwin, {
        profileUpdatedAt: twinGeneratedAt,
        analysedResumeIds: ['resume_01'],
        latestAnalysisAt: null,
        latestEvidenceAt: twinGeneratedAt,
        verifiedEvidenceCount: 1,
      });

      assert.equal(staleness.isStale, true);
      assert.deepEqual(staleness.reasons, ['New skill evidence has been recorded since this was generated.']);
    });

    it('leaves CareerTwin NOT stale for beginner outcome (0 verified evidence checks)', () => {
      // Beginner outcome does not produce verified evidence, verifiedEvidenceCount remains 0
      const staleness = isCareerTwinStale(baseTwin, {
        profileUpdatedAt: twinGeneratedAt,
        analysedResumeIds: ['resume_01'],
        latestAnalysisAt: null,
        latestEvidenceAt: null,
        verifiedEvidenceCount: 0,
      });

      assert.equal(staleness.isStale, false);
      assert.deepEqual(staleness.reasons, []);
    });

    it('leaves CareerTwin NOT stale for practice outcome (0 verified evidence checks)', () => {
      // Practice outcome does not produce verified evidence, verifiedEvidenceCount remains 0
      const staleness = isCareerTwinStale(baseTwin, {
        profileUpdatedAt: twinGeneratedAt,
        analysedResumeIds: ['resume_01'],
        latestAnalysisAt: null,
        latestEvidenceAt: null,
        verifiedEvidenceCount: 0,
      });

      assert.equal(staleness.isStale, false);
      assert.deepEqual(staleness.reasons, []);
    });

    it('leaves CareerTwin NOT stale for failing assessment outcome', () => {
      const staleness = isCareerTwinStale(baseTwin, {
        profileUpdatedAt: twinGeneratedAt,
        analysedResumeIds: ['resume_01'],
        latestAnalysisAt: null,
        latestEvidenceAt: null,
        verifiedEvidenceCount: 0,
      });

      assert.equal(staleness.isStale, false);
      assert.deepEqual(staleness.reasons, []);
    });

    it('leaves CareerTwin NOT stale when evidence was completed BEFORE twin generation', () => {
      const priorTwin = {
        generatedAt: new Date('2026-09-24T12:00:00.000Z'),
        sources: {
          profileUpdatedAt: twinGeneratedAt,
          analysedResumeIds: ['resume_01'],
          verifiedEvidenceCount: 1,
        },
      };

      const staleness = isCareerTwinStale(priorTwin, {
        profileUpdatedAt: twinGeneratedAt,
        analysedResumeIds: ['resume_01'],
        latestAnalysisAt: null,
        latestEvidenceAt: new Date('2026-09-24T11:30:00.000Z'), // 30 min before generation
        verifiedEvidenceCount: 1, // count identical
      });

      assert.equal(staleness.isStale, false);
      assert.deepEqual(staleness.reasons, []);
    });
  });

  // =========================================================================
  // 3. CareerTwin Pure Function Build & Skill Elevation
  // =========================================================================
  describe('3. CareerTwin Pure Function Build & Skill Elevation', () => {
    it('promotes claimed skill to verified when eligible evidence is supplied to buildCareerTwin', () => {
      const profile = {
        skills: [{ name: 'Node.js', level: 'intermediate' }],
      };

      // 1. Initial twin with claimed-only Node.js
      const initialTwin = buildCareerTwin({ profile, resumes: [], verifiedEvidence: [] });
      assert.equal(initialTwin.indicators.claimedOnly, 1);
      assert.equal(initialTwin.indicators.verified, 0);
      assert.equal(initialTwin.sources.verifiedEvidenceCount, 0);

      const initialNode = initialTwin.skills.find((s) => s.key === 'nodejs');
      assert.ok(initialNode);
      assert.equal(initialNode.strength, 'claimed');

      // 2. Twin rebuilt after eligible assessment passed
      const verifiedEvidence = [
        {
          skill: 'Node.js',
          completedAt: new Date('2026-09-24T12:00:00.000Z'),
          evidence: {
            source: 'assessment',
            strength: 'verified',
            detail: 'Passed assessment for Node.js with score 1.',
            reference: scoringTestAssessment.id,
          },
        },
      ];

      const elevatedTwin = buildCareerTwin({ profile, resumes: [], verifiedEvidence });
      assert.equal(elevatedTwin.indicators.verified, 1);
      assert.equal(elevatedTwin.indicators.claimedOnly, 0);
      assert.equal(elevatedTwin.sources.verifiedEvidenceCount, 1);

      const elevatedNode = elevatedTwin.skills.find((s) => s.key === 'nodejs');
      assert.ok(elevatedNode);
      assert.equal(elevatedNode.strength, 'verified');
      assert.ok(elevatedNode.evidence.some((e) => e.strength === 'verified' && e.source === 'assessment'));
    });

    it('leaves claimed skill as claimed when beginner or practice outcomes produce no verifiedEvidence', () => {
      const profile = {
        skills: [{ name: 'Node.js', level: 'beginner' }],
      };

      // Neither beginner nor practice creates verified evidence entries in verifiedEvidence array
      const twin = buildCareerTwin({ profile, resumes: [], verifiedEvidence: [] });
      assert.equal(twin.indicators.claimedOnly, 1);
      assert.equal(twin.indicators.verified, 0);
      assert.equal(twin.sources.verifiedEvidenceCount, 0);

      const nodeSkill = twin.skills.find((s) => s.key === 'nodejs');
      assert.equal(nodeSkill.strength, 'claimed');
    });
  });

  // =========================================================================
  // 4. Anti-Tampering & Evidence Policy Guardrails
  // =========================================================================
  describe('4. Anti-Tampering & Evidence Policy Guardrails', () => {
    it('assertNoForbiddenClientFields rejects client-submitted practice / policy tampering fields', () => {
      const tamperingFields = [
        'isPractice',
        'evidencePolicy',
        'allowBeginnerVerified',
        'requiresStrongerProof',
        'evidenceStrength',
        'evidenceStatus',
        'eligibleForVerified',
        'score',
        'passed',
        'outcome',
        'scoringRule',
      ];

      for (const field of tamperingFields) {
        assert.throws(
          () => {
            assertNoForbiddenClientFields({
              answers: { q1: 'a' },
              [field]: field === 'isPractice' ? false : true,
            });
          },
          (err) => {
            assert.equal(err.statusCode, 400);
            assert.match(err.message, /forbidden/i);
            return true;
          },
          `Expected assertNoForbiddenClientFields to reject "${field}"`,
        );
      }
    });

    it('buildAssessmentResult invariant cannot be overridden by forcing eligibleForVerified: true', () => {
      const completedAt = new Date('2026-09-24T12:00:00.000Z');

      // 1. Beginner check with forced eligibleForVerified: true
      const forgedBeginner = buildAssessmentResult({
        skill: 'Node.js',
        score: 1.0,
        assessmentId: 'asm-beg-forge',
        difficulty: 'beginner',
        eligibleForVerified: true,
        completedAt,
      });
      assert.equal(
        forgedBeginner.eligibleForVerified,
        false,
        'Beginner check must never be eligibleForVerified even when asserted by caller',
      );
      assert.equal(forgedBeginner.evidence, null);

      // 2. Practice check with forced eligibleForVerified: true
      const forgedPractice = buildAssessmentResult({
        skill: 'Node.js',
        score: 1.0,
        assessmentId: 'asm-prac-forge',
        isPractice: true,
        eligibleForVerified: true,
        completedAt,
      });
      assert.equal(
        forgedPractice.eligibleForVerified,
        false,
        'Practice check must never be eligibleForVerified even when asserted by caller',
      );
      assert.equal(forgedPractice.evidence, null);

      // 3. AI-evaluated check with forced eligibleForVerified: true
      const forgedAi = buildAssessmentResult({
        skill: 'Node.js',
        score: 1.0,
        assessmentId: 'asm-ai-forge',
        evaluatedBy: 'ai',
        eligibleForVerified: true,
        completedAt,
      });
      assert.equal(
        forgedAi.eligibleForVerified,
        false,
        'AI check must never be eligibleForVerified even when asserted by caller',
      );
      assert.equal(forgedAi.evidence, null);

      // 4. Failing score with forced eligibleForVerified: true
      const forgedFail = buildAssessmentResult({
        skill: 'Node.js',
        score: 0.4,
        assessmentId: 'asm-fail-forge',
        eligibleForVerified: true,
        completedAt,
      });
      assert.equal(
        forgedFail.eligibleForVerified,
        false,
        'Failing check must never be eligibleForVerified even when asserted by caller',
      );
      assert.equal(forgedFail.evidence, null);
    });
  });

  // =========================================================================
  // 5. Schema & Model Projection Parity for isPractice
  // =========================================================================
  describe('5. Schema & Model Projection Parity for isPractice', () => {
    it('validateAssessmentDefinition preserves isPractice flag', () => {
      const validatedPractice = validateAssessmentDefinition(practiceTestAssessment);
      assert.equal(validatedPractice.isPractice, true);

      const validatedStandard = validateAssessmentDefinition(scoringTestAssessment);
      assert.equal(validatedStandard.isPractice, false);
    });

    it('toPublicAssessment and toAdminAssessment correctly project isPractice', () => {
      const rawPractice = {
        assessmentId: 'asm_test_practice',
        title: 'Test Practice',
        description: 'Practice test',
        skillKey: 'nodejs',
        difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
        passMark: 0.7,
        timeLimitMinutes: 20,
        isPractice: true,
        questions: scoringTestAssessment.questions,
      };

      const publicAsm = toPublicAssessment(rawPractice);
      assert.equal(publicAsm.isPractice, true);

      const adminAsm = toAdminAssessment(rawPractice);
      assert.equal(adminAsm.isPractice, true);

      const rawStandard = { ...rawPractice, isPractice: false };
      assert.equal(toPublicAssessment(rawStandard).isPractice, false);
      assert.equal(toAdminAssessment(rawStandard).isPractice, false);
    });

    it('toPublicAssessmentAttempt correctly projects isPractice', () => {
      const rawAttempt = {
        _id: '6ab41a72147426ad6d1aa2b6',
        assessmentId: 'asm_test_practice',
        attemptNumber: 1,
        skillKey: 'nodejs',
        difficulty: DIFFICULTY_LEVELS.INTERMEDIATE,
        isPractice: true,
        status: ATTEMPT_STATUS.EVALUATED,
        score: 1.0,
        passMark: 0.7,
        passed: true,
        outcome: CHECK_OUTCOMES.PASS,
      };

      const pubAttempt = toPublicAssessmentAttempt(rawAttempt);
      assert.equal(pubAttempt.isPractice, true);

      const standardAttempt = { ...rawAttempt, isPractice: false };
      assert.equal(toPublicAssessmentAttempt(standardAttempt).isPractice, false);
    });
  });
});
