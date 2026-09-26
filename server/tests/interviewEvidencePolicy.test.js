import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CHECK_KINDS,
  CHECK_OUTCOMES,
  INTERVIEW_PASS_MARK,
  SkillEvidenceInputError,
  buildInterviewResult,
} from '../src/domain/evidence/skillEvidenceCheck.js';
import {
  EVIDENCE_SOURCES,
  EVIDENCE_STRENGTH,
} from '../src/domain/evidence/evidence.js';
import {
  EVALUATOR_TYPES,
  INTERVIEW_DIFFICULTY,
  INTERVIEW_LIMITS,
  evaluateInterviewSession,
} from '../src/domain/interview/interviewContract.js';
import { buildCareerTwin } from '../src/domain/careerTwin/buildCareerTwin.js';
import { isCareerTwinStale } from '../src/models/CareerTwin.model.js';
import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { computeSkillGap, GAP_STATUS } from '../src/domain/skillGap/computeSkillGap.js';

describe('TASK A14 — Interview Evidence Integration & CareerTwin Staleness Policy', () => {
  const completedAt = new Date('2026-09-24T12:00:00.000Z');

  // =========================================================================
  // 1. Evidence Threshold & Evaluator Policy Matrix
  // =========================================================================
  describe('1. Evidence Threshold & Evaluator Policy Matrix', () => {
    it('grants eligibleForVerified: true and strength: verified for passing human-evaluated interview (>= 0.75)', () => {
      const result = buildInterviewResult({
        skill: 'Node.js',
        score: 0.85,
        interviewId: 'interview_session_101',
        evaluatedBy: 'human',
        completedAt,
      });

      assert.equal(result.kind, CHECK_KINDS.INTERVIEW);
      assert.equal(result.skillKey, 'nodejs');
      assert.equal(result.skillName, 'Node.js');
      assert.equal(result.score, 0.85);
      assert.equal(result.passMark, INTERVIEW_PASS_MARK);
      assert.equal(result.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(result.eligibleForVerified, true);
      assert.equal(result.evaluatedBy, 'human');
      assert.equal(result.reference, 'interview_session_101');
      assert.ok(result.evidence);
      assert.equal(result.evidence.source, 'interview');
      assert.equal(result.evidence.strength, 'verified');
      assert.match(result.evidence.detail, /Passed interview for Node.js with score 0.85/);
    });

    it('enforces exact boundary at 0.75: score >= 0.75 passes, score < 0.75 fails', () => {
      // 1. Exactly at threshold (0.7500)
      const exactPass = buildInterviewResult({
        skill: 'Python',
        score: 0.75,
        interviewId: 'interview_exact_pass',
        evaluatedBy: 'human',
        completedAt,
      });
      assert.equal(exactPass.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(exactPass.eligibleForVerified, true);
      assert.ok(exactPass.evidence);
      assert.equal(exactPass.evidence.strength, 'verified');

      // 2. Just below threshold (0.7499)
      const justBelowFail = buildInterviewResult({
        skill: 'Python',
        score: 0.7499,
        interviewId: 'interview_just_below',
        evaluatedBy: 'human',
        completedAt,
      });
      assert.equal(justBelowFail.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(justBelowFail.eligibleForVerified, false);
      assert.equal(justBelowFail.evidence, null);

      // 3. Perfect score (1.0000)
      const perfectPass = buildInterviewResult({
        skill: 'Python',
        score: 1.0,
        interviewId: 'interview_perfect',
        evaluatedBy: 'human',
        completedAt,
      });
      assert.equal(perfectPass.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(perfectPass.eligibleForVerified, true);

      // 4. Zero score (0.0000)
      const zeroFail = buildInterviewResult({
        skill: 'Python',
        score: 0.0,
        interviewId: 'interview_zero',
        evaluatedBy: 'human',
        completedAt,
      });
      assert.equal(zeroFail.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(zeroFail.eligibleForVerified, false);
      assert.equal(zeroFail.evidence, null);
    });

    it('forces AI interview evaluations to outcome: uncertain and eligibleForVerified: false regardless of score', () => {
      const scores = [1.0, 0.95, 0.85, 0.75, 0.50, 0.0];

      for (const score of scores) {
        const aiResult = buildInterviewResult({
          skill: 'React',
          score,
          interviewId: `interview_ai_${score}`,
          evaluatedBy: 'ai',
          completedAt,
        });

        assert.equal(
          aiResult.outcome,
          CHECK_OUTCOMES.UNCERTAIN,
          `AI evaluation with score ${score} must produce outcome: uncertain`,
        );
        assert.equal(
          aiResult.eligibleForVerified,
          false,
          `AI evaluation with score ${score} must produce eligibleForVerified: false`,
        );
        assert.equal(
          aiResult.evidence,
          null,
          `AI evaluation with score ${score} must produce evidence: null`,
        );
      }
    });

    it('supports custom passMark and validates passMark threshold correctly', () => {
      // Custom higher passMark 0.85
      const higherPass = buildInterviewResult({
        skill: 'Docker',
        score: 0.85,
        interviewId: 'interview_high_passmark',
        evaluatedBy: 'human',
        passMark: 0.85,
        completedAt,
      });
      assert.equal(higherPass.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(higherPass.eligibleForVerified, true);

      const higherFail = buildInterviewResult({
        skill: 'Docker',
        score: 0.80,
        interviewId: 'interview_high_passmark_fail',
        evaluatedBy: 'human',
        passMark: 0.85,
        completedAt,
      });
      assert.equal(higherFail.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(higherFail.eligibleForVerified, false);

      // Custom lower passMark 0.60
      const lowerPass = buildInterviewResult({
        skill: 'Docker',
        score: 0.65,
        interviewId: 'interview_low_passmark',
        evaluatedBy: 'human',
        passMark: 0.60,
        completedAt,
      });
      assert.equal(lowerPass.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(lowerPass.eligibleForVerified, true);
    });

    it('rejects unsupported evaluator types and invalid inputs with SkillEvidenceInputError', () => {
      // Invalid evaluator
      assert.throws(
        () =>
          buildInterviewResult({
            skill: 'Node.js',
            score: 0.9,
            interviewId: 'inv_1',
            evaluatedBy: 'automated-proctor',
          }),
        (err) => err instanceof SkillEvidenceInputError && /evaluatedBy must be "human" or "ai"/i.test(err.message),
      );

      // Non-canonical skill
      assert.throws(
        () =>
          buildInterviewResult({
            skill: 'Super-Hacker-Vibe-Coding',
            score: 0.9,
            interviewId: 'inv_2',
            evaluatedBy: 'human',
          }),
        (err) => err instanceof SkillEvidenceInputError && /Unknown canonical skill/i.test(err.message),
      );

      // Out of bounds scores
      assert.throws(
        () =>
          buildInterviewResult({
            skill: 'Node.js',
            score: -0.1,
            interviewId: 'inv_3',
            evaluatedBy: 'human',
          }),
        (err) => err instanceof SkillEvidenceInputError && /between 0 and 1/i.test(err.message),
      );
      assert.throws(
        () =>
          buildInterviewResult({
            skill: 'Node.js',
            score: 1.05,
            interviewId: 'inv_4',
            evaluatedBy: 'human',
          }),
        (err) => err instanceof SkillEvidenceInputError && /between 0 and 1/i.test(err.message),
      );
      assert.throws(
        () =>
          buildInterviewResult({
            skill: 'Node.js',
            score: NaN,
            interviewId: 'inv_5',
            evaluatedBy: 'human',
          }),
        (err) => err instanceof SkillEvidenceInputError && /between 0 and 1/i.test(err.message),
      );

      // Invalid passMarks
      assert.throws(
        () =>
          buildInterviewResult({
            skill: 'Node.js',
            score: 0.8,
            interviewId: 'inv_6',
            evaluatedBy: 'human',
            passMark: 0,
          }),
        (err) => err instanceof SkillEvidenceInputError && /greater than 0 and at most 1/i.test(err.message),
      );
      assert.throws(
        () =>
          buildInterviewResult({
            skill: 'Node.js',
            score: 0.8,
            interviewId: 'inv_7',
            evaluatedBy: 'human',
            passMark: 1.5,
          }),
        (err) => err instanceof SkillEvidenceInputError && /greater than 0 and at most 1/i.test(err.message),
      );

      // Invalid reference or date
      assert.throws(
        () =>
          buildInterviewResult({
            skill: 'Node.js',
            score: 0.8,
            interviewId: '   ',
            evaluatedBy: 'human',
          }),
        (err) => err instanceof SkillEvidenceInputError && /interviewId is required/i.test(err.message),
      );
      assert.throws(
        () =>
          buildInterviewResult({
            skill: 'Node.js',
            score: 0.8,
            interviewId: 'inv_8',
            evaluatedBy: 'human',
            completedAt: 'invalid-timestamp-string',
          }),
        (err) => err instanceof SkillEvidenceInputError && /must be a valid date/i.test(err.message),
      );
    });
  });

  // =========================================================================
  // 2. Session-Level Evaluation & Question-to-Skill Weighting
  // =========================================================================
  describe('2. Session-Level Evaluation & Question-to-Skill Weighting', () => {
    it('evaluates multi-skill interview session: grants verified status only to passing skills', () => {
      const session = {
        sessionId: 'multi_skill_session_1',
        studentId: 'student_multi_1',
        roleTitle: 'Backend Developer',
        roleSlug: 'backend-developer',
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        targetSkills: ['Node.js', 'PostgreSQL'],
        questions: [
          {
            id: 'q1',
            targetSkillKey: 'nodejs',
            targetSkillName: 'Node.js',
            weight: 2,
          },
          {
            id: 'q2',
            targetSkillKey: 'postgresql',
            targetSkillName: 'PostgreSQL',
            weight: 2,
          },
        ],
        evaluations: {
          q1: { score: 0.90, dimensions: { accuracy: 0.9, depth: 0.9, clarity: 0.9, relevance: 0.9 }, feedback: 'Superb Node.js answer' },
          q2: { score: 0.60, dimensions: { accuracy: 0.6, depth: 0.6, clarity: 0.6, relevance: 0.6 }, feedback: 'Incomplete SQL indexing answer' },
        },
      };

      const result = evaluateInterviewSession(session, {
        evaluatedBy: EVALUATOR_TYPES.HUMAN,
      });

      // Overall score: (0.90 * 2 + 0.60 * 2) / 4 = 0.75
      assert.equal(result.overallScore, 0.75);
      assert.equal(result.passed, true);
      assert.equal(result.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(result.eligibleForVerified, true);
      assert.equal(result.evidenceStrength, EVIDENCE_STRENGTH.VERIFIED);

      // Check per-skill evidence results
      assert.equal(result.skillEvidenceResults.length, 2);

      const nodeResult = result.skillEvidenceResults.find((s) => s.skillKey === 'nodejs');
      assert.ok(nodeResult);
      assert.equal(nodeResult.score, 0.90);
      assert.equal(nodeResult.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(nodeResult.eligibleForVerified, true);
      assert.ok(nodeResult.evidence);
      assert.equal(nodeResult.evidence.strength, 'verified');

      const pgResult = result.skillEvidenceResults.find((s) => s.skillKey === 'postgresql');
      assert.ok(pgResult);
      assert.equal(pgResult.score, 0.60);
      assert.equal(pgResult.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(pgResult.eligibleForVerified, false);
      assert.equal(pgResult.evidence, null);
    });

    it('falls back gracefully to overallScore when target skill has no specific matching questions', () => {
      const session = {
        sessionId: 'session_fallback_1',
        studentId: 'student_fb_1',
        roleTitle: 'Backend Developer',
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        targetSkills: ['Docker'], // Target skill Docker has general questions
        questions: [
          {
            id: 'q1',
            targetSkillKey: 'general-systems',
            targetSkillName: 'General Systems',
            weight: 1,
          },
        ],
        evaluations: {
          q1: { score: 0.80 },
        },
      };

      const result = evaluateInterviewSession(session, {
        evaluatedBy: EVALUATOR_TYPES.HUMAN,
      });

      assert.equal(result.overallScore, 0.80);
      assert.equal(result.skillEvidenceResults.length, 1);
      assert.equal(result.skillEvidenceResults[0].skillKey, 'docker');
      assert.equal(result.skillEvidenceResults[0].score, 0.80);
      assert.equal(result.skillEvidenceResults[0].outcome, CHECK_OUTCOMES.PASS);
      assert.equal(result.skillEvidenceResults[0].eligibleForVerified, true);
    });

    it('handles both string array targetSkills and object array targetSkills cleanly', () => {
      // 1. Strings
      const stringSession = {
        sessionId: 'session_str',
        studentId: 'student_1',
        targetSkills: ['Node.js', 'React'],
        questions: [{ id: 'q1', weight: 1 }],
        evaluations: { q1: { score: 0.85 } },
      };
      const stringRes = evaluateInterviewSession(stringSession, { evaluatedBy: EVALUATOR_TYPES.HUMAN });
      assert.equal(stringRes.skillEvidenceResults.length, 2);
      assert.equal(stringRes.skillEvidenceResults[0].skillKey, 'nodejs');
      assert.equal(stringRes.skillEvidenceResults[1].skillKey, 'react');

      // 2. Objects
      const objectSession = {
        sessionId: 'session_obj',
        studentId: 'student_2',
        targetSkills: [{ key: 'nodejs', name: 'Node.js' }, { key: 'react', name: 'React' }],
        questions: [{ id: 'q1', weight: 1 }],
        evaluations: { q1: { score: 0.85 } },
      };
      const objectRes = evaluateInterviewSession(objectSession, { evaluatedBy: EVALUATOR_TYPES.HUMAN });
      assert.equal(objectRes.skillEvidenceResults.length, 2);
      assert.equal(objectRes.skillEvidenceResults[0].skillKey, 'nodejs');
      assert.equal(objectRes.skillEvidenceResults[1].skillKey, 'react');
    });

    it('rejects evaluation when session contains no questions or invalid session object', () => {
      assert.throws(
        () => evaluateInterviewSession(null),
        /session must be an object/i,
      );
      assert.throws(
        () => evaluateInterviewSession({ questions: [] }),
        /Session must contain at least one question/i,
      );
      assert.throws(
        () => evaluateInterviewSession({ questions: [{ id: 'q1' }] }, { passMark: 1.5 }),
        /passMark must be a number greater than 0 and at most 1/i,
      );
    });
  });

  // =========================================================================
  // 3. CareerTwin Staleness Tracking After Interview Evidence
  // =========================================================================
  describe('3. CareerTwin Staleness Tracking After Interview Evidence', () => {
    const twinGeneratedAt = new Date('2026-09-24T10:00:00.000Z');
    const baseTwin = {
      generatedAt: twinGeneratedAt,
      sources: {
        hasProfile: true,
        profileUpdatedAt: twinGeneratedAt,
        resumeCount: 1,
        analysedResumeIds: ['resume_01'],
        verifiedEvidenceCount: 0,
      },
    };

    it('marks CareerTwin stale when eligible verified interview evidence completed AFTER twin generation', () => {
      const evidenceCompletedAt = new Date('2026-09-24T11:00:00.000Z');
      const staleness = isCareerTwinStale(baseTwin, {
        profileUpdatedAt: twinGeneratedAt,
        analysedResumeIds: ['resume_01'],
        latestAnalysisAt: null,
        latestEvidenceAt: evidenceCompletedAt,
        verifiedEvidenceCount: 1,
      });

      assert.equal(staleness.isStale, true);
      assert.deepEqual(staleness.reasons, [
        'New skill evidence has been recorded since this was generated.',
      ]);
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
      assert.deepEqual(staleness.reasons, [
        'New skill evidence has been recorded since this was generated.',
      ]);
    });

    it('leaves CareerTwin NOT stale for AI interview completion (0 verified evidence checks)', () => {
      // AI interviews do not produce verified evidence; verifiedEvidenceCount remains 0, latestEvidenceAt is null
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

    it('leaves CareerTwin NOT stale for failing human interview completion (0 verified evidence checks)', () => {
      // Failing human interview does not produce verified evidence
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

    it('leaves CareerTwin NOT stale when interview evidence was completed BEFORE twin generation and count matches', () => {
      const priorEvidenceTwin = {
        generatedAt: new Date('2026-09-24T12:00:00.000Z'),
        sources: {
          hasProfile: true,
          profileUpdatedAt: twinGeneratedAt,
          resumeCount: 1,
          analysedResumeIds: ['resume_01'],
          verifiedEvidenceCount: 1,
        },
      };

      const staleness = isCareerTwinStale(priorEvidenceTwin, {
        profileUpdatedAt: twinGeneratedAt,
        analysedResumeIds: ['resume_01'],
        latestAnalysisAt: null,
        latestEvidenceAt: new Date('2026-09-24T11:00:00.000Z'), // 1 hour before twin generation
        verifiedEvidenceCount: 1,
      });

      assert.equal(staleness.isStale, false);
      assert.deepEqual(staleness.reasons, []);
    });

    it('safely handles legacy twin documents where sources.verifiedEvidenceCount was undefined', () => {
      const legacyTwin = {
        generatedAt: twinGeneratedAt,
        sources: {
          profileUpdatedAt: twinGeneratedAt,
          analysedResumeIds: ['resume_01'],
          // verifiedEvidenceCount is omitted
        },
      };

      // 1. With 0 verified evidence: not stale
      const cleanCheck = isCareerTwinStale(legacyTwin, {
        profileUpdatedAt: twinGeneratedAt,
        analysedResumeIds: ['resume_01'],
        latestAnalysisAt: null,
        latestEvidenceAt: null,
        verifiedEvidenceCount: 0,
      });
      assert.equal(cleanCheck.isStale, false);

      // 2. With 1 verified evidence: stale
      const newEvidenceCheck = isCareerTwinStale(legacyTwin, {
        profileUpdatedAt: twinGeneratedAt,
        analysedResumeIds: ['resume_01'],
        latestAnalysisAt: null,
        latestEvidenceAt: new Date('2026-09-24T11:00:00.000Z'),
        verifiedEvidenceCount: 1,
      });
      assert.equal(newEvidenceCheck.isStale, true);
    });
  });

  // =========================================================================
  // 4. CareerTwin Pure Function Build & Skill Elevation
  // =========================================================================
  describe('4. CareerTwin Pure Function Build & Skill Elevation', () => {
    const studentProfile = {
      skills: [
        { name: 'Node.js', level: 'intermediate' },
        { name: 'PostgreSQL', level: 'beginner' },
      ],
      career: { targetRole: 'Backend Developer' },
    };

    it('elevates claimed skill to verified when eligible interview evidence is supplied to buildCareerTwin', () => {
      const verifiedEvidence = [
        {
          skill: 'Node.js',
          completedAt: new Date('2026-09-24T11:00:00.000Z'),
          evidence: {
            source: 'interview',
            strength: 'verified',
            detail: 'Passed interview for Node.js with score 0.88.',
            reference: 'interview_sess_pass_1',
          },
        },
      ];

      const twin = buildCareerTwin({
        profile: studentProfile,
        resumes: [],
        verifiedEvidence,
      });

      // Node.js is elevated to verified
      const nodeSkill = twin.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeSkill);
      assert.equal(nodeSkill.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(nodeSkill.evidence[0].source, 'interview');
      assert.equal(nodeSkill.evidence[0].strength, 'verified');
      assert.match(nodeSkill.evidence[0].detail, /Passed interview for Node.js/);

      // PostgreSQL remains claimed
      const pgSkill = twin.skills.find((s) => s.key === 'postgresql');
      assert.ok(pgSkill);
      assert.equal(pgSkill.strength, EVIDENCE_STRENGTH.CLAIMED);

      // Indicators track verified skills count accurately
      assert.equal(twin.indicators.verified, 1);
      assert.equal(twin.indicators.claimedOnly, 1);
      assert.equal(twin.sources.verifiedEvidenceCount, 1);
    });

    it('leaves skills as claimed/supported when interview is advisory AI or failing human evaluation', () => {
      // AI or failing interviews produce empty verifiedEvidence array
      const twin = buildCareerTwin({
        profile: studentProfile,
        resumes: [],
        verifiedEvidence: [],
      });

      const nodeSkill = twin.skills.find((s) => s.key === 'nodejs');
      assert.equal(nodeSkill.strength, EVIDENCE_STRENGTH.CLAIMED);
      assert.equal(twin.indicators.verified, 0);
      assert.equal(twin.indicators.claimedOnly, 2);
      assert.equal(twin.sources.verifiedEvidenceCount, 0);
    });

    it('correctly handles corroborating evidence from both assessment and interview for the same skill', () => {
      const dualEvidence = [
        {
          skill: 'Node.js',
          completedAt: new Date('2026-09-24T10:00:00.000Z'),
          evidence: {
            source: 'assessment',
            strength: 'verified',
            detail: 'Passed assessment for Node.js with score 0.90.',
            reference: 'asm_node_1',
          },
        },
        {
          skill: 'Node.js',
          completedAt: new Date('2026-09-24T11:00:00.000Z'),
          evidence: {
            source: 'interview',
            strength: 'verified',
            detail: 'Passed interview for Node.js with score 0.85.',
            reference: 'interview_node_1',
          },
        },
      ];

      const twin = buildCareerTwin({
        profile: studentProfile,
        resumes: [],
        verifiedEvidence: dualEvidence,
      });

      const nodeSkill = twin.skills.find((s) => s.key === 'nodejs');
      assert.equal(nodeSkill.strength, EVIDENCE_STRENGTH.VERIFIED);
      // Contains evidence from both assessment and interview
      assert.ok(nodeSkill.evidence.some((e) => e.source === 'assessment'));
      assert.ok(nodeSkill.evidence.some((e) => e.source === 'interview'));
      assert.equal(twin.indicators.verified, 1);
      assert.equal(twin.sources.verifiedEvidenceCount, 2);
    });
  });

  // =========================================================================
  // 5. Skill Gap Analysis Integration
  // =========================================================================
  describe('5. Skill Gap Analysis Integration', () => {
    it('verifies that human interview pass satisfies role requirements in computeSkillGap', () => {
      const role = findRole('backend-developer');
      assert.ok(role);

      // 1. Initial twin with claimed Node.js only
      const initialTwin = buildCareerTwin({
        profile: {
          skills: [{ name: 'Node.js', level: 'intermediate' }],
          career: { targetRole: 'Backend Developer' },
        },
        resumes: [],
        verifiedEvidence: [],
      });

      const initialGap = computeSkillGap(initialTwin, role);
      const initialNodeGap = initialGap.skills.find((s) => s.key === 'nodejs');
      assert.ok(initialNodeGap);
      assert.equal(initialNodeGap.status, GAP_STATUS.CLAIMED);
      assert.ok(initialNodeGap.suggestedEvidence.length > 0);
      assert.equal(initialGap.summary.required.verified, 0);

      // 2. Updated twin with verified interview evidence
      const verifiedTwin = buildCareerTwin({
        profile: {
          skills: [{ name: 'Node.js', level: 'intermediate' }],
          career: { targetRole: 'Backend Developer' },
        },
        resumes: [],
        verifiedEvidence: [
          {
            skill: 'Node.js',
            completedAt: new Date('2026-09-24T12:00:00.000Z'),
            evidence: {
              source: 'interview',
              strength: 'verified',
              detail: 'Passed interview for Node.js with score 0.85.',
              reference: 'interview_pass_role_1',
            },
          },
        ],
      });

      const verifiedGap = computeSkillGap(verifiedTwin, role);
      const verifiedNodeGap = verifiedGap.skills.find((s) => s.key === 'nodejs');
      assert.ok(verifiedNodeGap);
      assert.equal(verifiedNodeGap.status, GAP_STATUS.VERIFIED);
      assert.deepEqual(verifiedNodeGap.suggestedEvidence, []);
      assert.equal(verifiedGap.summary.required.verified, 1);
      assert.match(verifiedNodeGap.reason, /Passed interview for Node.js/);
    });
  });

  // =========================================================================
  // 6. Anti-Tampering & Security Guardrails
  // =========================================================================
  describe('6. Anti-Tampering & Security Guardrails', () => {
    it('ignores client attempts to inject eligibleForVerified: true or outcome: pass into buildInterviewResult', () => {
      const maliciousPayload = {
        skill: 'Node.js',
        score: 0.95,
        interviewId: 'hacked_interview',
        evaluatedBy: 'ai',
        outcome: 'pass',
        eligibleForVerified: true,
        evidence: {
          source: 'interview',
          strength: 'verified',
          detail: 'Injected verified badge',
        },
      };

      const result = buildInterviewResult(maliciousPayload);

      // Forced to AI advisory invariants
      assert.equal(result.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(result.eligibleForVerified, false);
      assert.equal(result.evidence, null);
    });

    it('ignores client attempts to force verified status on a failing human interview', () => {
      const failingMaliciousPayload = {
        skill: 'Node.js',
        score: 0.50, // Below 0.75
        interviewId: 'failing_tamper_interview',
        evaluatedBy: 'human',
        outcome: 'pass',
        eligibleForVerified: true,
      };

      const result = buildInterviewResult(failingMaliciousPayload);

      assert.equal(result.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(result.eligibleForVerified, false);
      assert.equal(result.evidence, null);
    });
  });
});
