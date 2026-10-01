import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rankRoles, scoreRoleMatch } from '../src/domain/careers/matchRole.js';
import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { computeSkillGap, GAP_STATUS, GAP_IMPORTANCE } from '../src/domain/skillGap/computeSkillGap.js';
import { buildRoadmap, PRIORITY } from '../src/domain/roadmap/buildRoadmap.js';
import { computeReadiness } from '../src/domain/readiness/computeReadiness.js';
import {
  READINESS_EVIDENCE_STATUS,
  READINESS_DATA_STATUS,
} from '../src/domain/readiness/readinessContract.js';
import {
  evaluateAssessmentSubmission,
  QUESTION_TYPES,
  SCORING_STRATEGIES,
  DIFFICULTY_LEVELS,
} from '../src/domain/assessment/assessmentContract.js';
import { getAssessmentById } from '../src/domain/assessment/assessmentCatalog.js';
import { SYNTHETIC_PROFILES } from './fixtures/syntheticProfilesFixtures.js';

describe('TASK A25 — Repeatability & Determinism Validation Suite', () => {
  const backendRole = findRole('backend-developer');
  const frontendRole = findRole('frontend-developer');

  // Helper to clone an object cleanly
  function clone(obj) {
    return structuredClone(obj);
  }

  // =========================================================================
  // 1. Recommendation Repeatability (rankRoles & scoreRoleMatch)
  // =========================================================================
  describe('1. Recommendation & Career Match Repeatability', () => {
    it('produces identical role rankings and scores across 50 consecutive runs', () => {
      const twin = SYNTHETIC_PROFILES.intermediate.twin;
      const baseline = rankRoles(twin);

      for (let i = 0; i < 50; i++) {
        const current = rankRoles(twin);
        assert.deepEqual(current, baseline, `Run ${i + 1} drifted from baseline ranking`);
        assert.equal(
          JSON.stringify(current),
          JSON.stringify(baseline),
          `Run ${i + 1} JSON serialization drifted`,
        );
      }
    });

    it('preserves deterministic tie-breaking for equal scores across all runs', () => {
      // Empty twin generates identical baseline scores across all roles
      const emptyTwin = { skills: [], interests: [], targetRoles: [], academic: null };
      const baseline = rankRoles(emptyTwin, { limit: 10, includeBelowThreshold: true });

      for (let i = 0; i < 50; i++) {
        const current = rankRoles(emptyTwin, { limit: 10, includeBelowThreshold: true });
        assert.deepEqual(current.matches.map((m) => m.roleId), baseline.matches.map((m) => m.roleId));
        assert.deepEqual(current.matches.map((m) => m.score), baseline.matches.map((m) => m.score));
      }
    });

    it('guarantees input twin immutability during role scoring', () => {
      const originalTwin = clone(SYNTHETIC_PROFILES.beginner.twin);
      const twinToRun = clone(originalTwin);

      for (let i = 0; i < 30; i++) {
        rankRoles(twinToRun);
        scoreRoleMatch(twinToRun, backendRole);
      }

      assert.deepEqual(twinToRun, originalTwin, 'Twin object was mutated during role ranking');
    });

    it('produces identical scoring regardless of skill ordering in twin', () => {
      const normalTwin = clone(SYNTHETIC_PROFILES.intermediate.twin);
      const shuffledTwin = clone(normalTwin);
      shuffledTwin.skills.reverse();

      const normalMatch = scoreRoleMatch(normalTwin, backendRole);
      const shuffledMatch = scoreRoleMatch(shuffledTwin, backendRole);

      assert.equal(normalMatch.score, shuffledMatch.score);
      assert.equal(normalMatch.band, shuffledMatch.band);
      assert.deepEqual(normalMatch.dimensions, shuffledMatch.dimensions);
      assert.deepEqual(normalMatch.missingRequired, shuffledMatch.missingRequired);
    });
  });

  // =========================================================================
  // 2. Skill Gap Repeatability (computeSkillGap)
  // =========================================================================
  describe('2. Skill Gap Computation Repeatability', () => {
    it('produces identical skill gap assessments across 50 consecutive runs', () => {
      const twin = SYNTHETIC_PROFILES.intermediate.twin;
      const baseline = computeSkillGap(twin, backendRole);

      for (let i = 0; i < 50; i++) {
        const current = computeSkillGap(twin, backendRole);
        assert.deepEqual(current, baseline, `Run ${i + 1} drifted from baseline skill gap`);
        assert.equal(
          JSON.stringify(current),
          JSON.stringify(baseline),
          `Run ${i + 1} serialization drifted`,
        );
      }
    });

    it('preserves strict priority sorting order identically across 50 runs', () => {
      const twin = SYNTHETIC_PROFILES.beginner.twin;
      const baseline = computeSkillGap(twin, backendRole);

      for (let i = 0; i < 50; i++) {
        const current = computeSkillGap(twin, backendRole);
        const baselineKeys = baseline.skills.map((s) => `${s.key}:${s.status}:${s.importance}`);
        const currentKeys = current.skills.map((s) => `${s.key}:${s.status}:${s.importance}`);
        assert.deepEqual(currentKeys, baselineKeys);
      }
    });

    it('guarantees twin and role immutability during skill gap calculation', () => {
      const originalTwin = clone(SYNTHETIC_PROFILES.intermediate.twin);
      const originalRole = clone(backendRole);

      const runningTwin = clone(originalTwin);
      const runningRole = clone(originalRole);

      for (let i = 0; i < 30; i++) {
        computeSkillGap(runningTwin, runningRole);
      }

      assert.deepEqual(runningTwin, originalTwin, 'Twin was mutated during skill gap analysis');
      assert.deepEqual(runningRole, originalRole, 'Role was mutated during skill gap analysis');
    });

    it('guarantees deterministic deduplication and sorting for additionalSkills', () => {
      const twin = {
        skills: [
          { key: 'figma', name: 'Figma', strength: 'claimed' },
          { key: 'docker', name: 'Docker', strength: 'supported' },
          { key: 'figma', name: 'Figma', strength: 'supported' }, // Duplicate with higher strength
          { key: 'photoshop', name: 'Photoshop', strength: 'claimed' },
        ],
      };

      const baseline = computeSkillGap(twin, backendRole);

      for (let i = 0; i < 30; i++) {
        const current = computeSkillGap(twin, backendRole);
        assert.deepEqual(current.additionalSkills, baseline.additionalSkills);
        // Alphabetical sort: Figma before Photoshop
        assert.deepEqual(
          current.additionalSkills.map((s) => s.name),
          ['Figma', 'Photoshop'],
        );
      }
    });
  });

  // =========================================================================
  // 3. Roadmap Repeatability (buildRoadmap)
  // =========================================================================
  describe('3. Roadmap Generation Repeatability', () => {
    it('produces identical roadmap actions and prerequisite chains across 50 consecutive runs', () => {
      const twin = SYNTHETIC_PROFILES.beginner.twin;
      const gap = computeSkillGap(twin, backendRole);
      const baseline = buildRoadmap(gap);

      for (let i = 0; i < 50; i++) {
        const current = buildRoadmap(gap);
        assert.deepEqual(current, baseline, `Run ${i + 1} drifted from baseline roadmap`);
        assert.equal(
          JSON.stringify(current),
          JSON.stringify(baseline),
          `Run ${i + 1} JSON serialization drifted`,
        );
      }
    });

    it('preserves transitive prerequisite ordering without inversion across runs', () => {
      // Gap where both JavaScript and Express.js / Node.js are missing
      const gap = {
        roleId: 'backend-developer',
        roleTitle: 'Backend Developer',
        skills: [
          { key: 'expressjs', name: 'Express.js', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING, suggestedEvidence: [{ available: true }] },
          { key: 'nodejs', name: 'Node.js', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING, suggestedEvidence: [{ available: true }] },
          { key: 'javascript', name: 'JavaScript', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING, suggestedEvidence: [{ available: true }] },
        ],
      };

      const baseline = buildRoadmap(gap);

      for (let i = 0; i < 50; i++) {
        const current = buildRoadmap(gap);
        const keys = current.items.map((it) => it.skill.key);

        const jsIndex = keys.indexOf('javascript');
        const nodeIndex = keys.indexOf('nodejs');
        const expressIndex = keys.indexOf('expressjs');

        assert.ok(jsIndex < nodeIndex, 'JavaScript must precede Node.js');
        assert.ok(nodeIndex < expressIndex, 'Node.js must precede Express.js');
        assert.deepEqual(current.items, baseline.items);
      }
    });

    it('guarantees skill gap immutability during roadmap generation', () => {
      const twin = SYNTHETIC_PROFILES.intermediate.twin;
      const originalGap = computeSkillGap(twin, backendRole);
      const runningGap = clone(originalGap);

      for (let i = 0; i < 30; i++) {
        buildRoadmap(runningGap);
      }

      assert.deepEqual(runningGap, originalGap, 'Gap object was mutated during roadmap building');
    });
  });

  // =========================================================================
  // 4. Assessment Evaluation Repeatability (evaluateAssessmentSubmission)
  // =========================================================================
  describe('4. Assessment Evaluation Repeatability', () => {
    const jsAssessment = getAssessmentById('asm_javascript_intermediate');
    const frozenEvalDate = new Date('2026-09-27T10:00:00.000Z');

    const perfectSubmission = {
      assessmentId: 'asm_javascript_intermediate',
      studentId: 'std_repeatability_001',
      startedAt: '2026-09-27T09:50:00.000Z',
      answers: {
        q_js_event_loop: '1\n4\n3\n2',
        q_js_closures: 'opt_a',
        q_js_promise_states: ['opt_pending', 'opt_fulfilled', 'opt_rejected'],
        q_js_nan_type: 'opt_number',
        q_js_proto_inheritance: 'true',
      },
    };

    const partialSubmission = {
      assessmentId: 'asm_javascript_intermediate',
      studentId: 'std_repeatability_002',
      startedAt: '2026-09-27T09:50:00.000Z',
      answers: {
        q_js_event_loop: '1\n4\n3\n2', // correct (1 pt)
        q_js_closures: 'opt_b', // wrong (0 pt)
        q_js_promise_states: ['opt_pending', 'opt_fulfilled'], // partial credit
        q_js_nan_type: 'opt_string', // wrong (0 pt)
        q_js_proto_inheritance: 'true', // correct (1 pt)
      },
    };

    it('produces identical evaluation scores and breakdowns across 50 runs for perfect submission', () => {
      const baseline = evaluateAssessmentSubmission({
        assessment: jsAssessment,
        submission: perfectSubmission,
        evaluatedAt: frozenEvalDate,
      });

      for (let i = 0; i < 50; i++) {
        const current = evaluateAssessmentSubmission({
          assessment: jsAssessment,
          submission: perfectSubmission,
          evaluatedAt: frozenEvalDate,
        });

        assert.equal(current.score, baseline.score);
        assert.equal(current.outcome, baseline.outcome);
        assert.equal(current.eligibleForVerified, baseline.eligibleForVerified);
        assert.deepEqual(current.scoringSummary, baseline.scoringSummary);
        assert.deepEqual(current.questionResults, baseline.questionResults);
      }
    });

    it('produces identical partial-credit calculations across 50 runs without float jitter', () => {
      const baseline = evaluateAssessmentSubmission({
        assessment: jsAssessment,
        submission: partialSubmission,
        evaluatedAt: frozenEvalDate,
      });

      for (let i = 0; i < 50; i++) {
        const current = evaluateAssessmentSubmission({
          assessment: jsAssessment,
          submission: partialSubmission,
          evaluatedAt: frozenEvalDate,
        });

        assert.equal(current.score, baseline.score);
        assert.equal(current.scoringSummary.rawScore, baseline.scoringSummary.rawScore);
        assert.equal(current.scoringSummary.totalEarnedPoints, baseline.scoringSummary.totalEarnedPoints);
        assert.deepEqual(current.questionResults, baseline.questionResults);
      }
    });

    it('produces identical evaluation regardless of answer map submission order', () => {
      const reversedSubmission = clone(perfectSubmission);
      reversedSubmission.answers = [
        { questionId: 'q_js_proto_inheritance', answer: 'true' },
        { questionId: 'q_js_nan_type', answer: 'opt_number' },
        { questionId: 'q_js_promise_states', answer: ['opt_pending', 'opt_fulfilled', 'opt_rejected'] },
        { questionId: 'q_js_closures', answer: 'opt_a' },
        { questionId: 'q_js_event_loop', answer: '1\n4\n3\n2' },
      ];

      const baseline = evaluateAssessmentSubmission({
        assessment: jsAssessment,
        submission: perfectSubmission,
        evaluatedAt: frozenEvalDate,
      });

      const current = evaluateAssessmentSubmission({
        assessment: jsAssessment,
        submission: reversedSubmission,
        evaluatedAt: frozenEvalDate,
      });

      assert.equal(current.score, baseline.score);
      assert.equal(current.outcome, baseline.outcome);
      assert.deepEqual(current.scoringSummary, baseline.scoringSummary);
      assert.deepEqual(current.questionResults, baseline.questionResults);
    });

    it('guarantees assessment definition and submission immutability during scoring', () => {
      const originalDef = clone(jsAssessment);
      const originalSub = clone(partialSubmission);

      const runningDef = clone(originalDef);
      const runningSub = clone(originalSub);

      for (let i = 0; i < 30; i++) {
        evaluateAssessmentSubmission({
          assessment: runningDef,
          submission: runningSub,
          evaluatedAt: frozenEvalDate,
        });
      }

      assert.deepEqual(runningDef, originalDef, 'Assessment definition was mutated');
      assert.deepEqual(runningSub, originalSub, 'Submission object was mutated');
    });
  });

  // =========================================================================
  // 5. Readiness Repeatability (computeReadiness)
  // =========================================================================
  describe('5. Readiness Computation Repeatability', () => {
    it('produces identical readiness results across 50 consecutive runs', () => {
      const twin = SYNTHETIC_PROFILES.intermediate.twin;
      const gap = computeSkillGap(twin, backendRole);
      const baseline = computeReadiness(gap);

      for (let i = 0; i < 50; i++) {
        const current = computeReadiness(gap);
        assert.deepEqual(current, baseline, `Run ${i + 1} drifted from baseline readiness`);
        assert.equal(
          JSON.stringify(current),
          JSON.stringify(baseline),
          `Run ${i + 1} JSON serialization drifted`,
        );
      }
    });

    it('preserves contradictory evidence state resolution identically across all runs', () => {
      const contradictoryGap = {
        roleId: 'backend-developer',
        skills: [
          { key: 'nodejs', name: 'Node.js', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.CLAIMED, evidence: ['c1'] },
          { key: 'nodejs', name: 'Node.js', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.SUPPORTED, evidence: ['p1', 'p2'] }, // higher strength
          { key: 'sql', name: 'SQL', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING, evidence: [] },
        ],
        summary: {
          required: { total: 2, missing: 1, claimed: 0, supported: 1, verified: 0 },
          preferred: { total: 0, missing: 0, claimed: 0, supported: 0, verified: 0 },
        },
      };

      const baseline = computeReadiness(contradictoryGap);

      for (let i = 0; i < 50; i++) {
        const current = computeReadiness(contradictoryGap);
        assert.equal(current.evidenceStatus, READINESS_EVIDENCE_STATUS.PARTIAL);
        assert.equal(current.required.supported, 1);
        assert.equal(current.required.missing, 1);
        assert.deepEqual(current.blockingSkills, baseline.blockingSkills);
      }
    });

    it('guarantees skill gap immutability during readiness computation', () => {
      const twin = SYNTHETIC_PROFILES.beginner.twin;
      const originalGap = computeSkillGap(twin, backendRole);
      const runningGap = clone(originalGap);

      for (let i = 0; i < 30; i++) {
        computeReadiness(runningGap);
      }

      assert.deepEqual(runningGap, originalGap, 'Gap object was mutated during readiness calculation');
    });
  });

  // =========================================================================
  // 6. Cross-Feature Full Pipeline Repeatability Matrix
  // =========================================================================
  describe('6. Full Pipeline Repeatability Matrix', () => {
    it('executes full pipeline across 50 full cycles with zero cumulative drift', () => {
      const jsAssessment = getAssessmentById('asm_javascript_intermediate');
      const frozenDate = new Date('2026-09-27T10:00:00.000Z');

      const fullCycle = (twin, targetRole) => {
        const match = rankRoles(twin);
        const gap = computeSkillGap(twin, targetRole);
        const roadmap = buildRoadmap(gap);
        const readiness = computeReadiness(gap);
        const assessmentResult = evaluateAssessmentSubmission({
          assessment: jsAssessment,
          submission: {
            assessmentId: jsAssessment.id,
            studentId: 'pipeline_repeatability_user',
            startedAt: '2026-09-27T09:45:00.000Z',
            answers: {
              q_js_event_loop: '1\n4\n3\n2',
              q_js_closures: 'opt_a',
              q_js_promise_states: ['opt_pending', 'opt_fulfilled', 'opt_rejected'],
              q_js_nan_type: 'opt_number',
              q_js_proto_inheritance: 'true',
            },
          },
          evaluatedAt: frozenDate,
        });

        return {
          topRole: match.matches[0]?.roleId,
          topScore: match.matches[0]?.score,
          gapMissingCount: gap.summary.required.missing,
          gapSupportedCount: gap.summary.required.supported,
          roadmapItemCount: roadmap.items.length,
          readinessStatus: readiness.evidenceStatus,
          readinessBlockers: readiness.blockingSkills.length,
          assessmentScore: assessmentResult.score,
          assessmentOutcome: assessmentResult.outcome,
        };
      };

      const baselineIntermediate = fullCycle(SYNTHETIC_PROFILES.intermediate.twin, backendRole);
      const baselineBeginner = fullCycle(SYNTHETIC_PROFILES.beginner.twin, frontendRole);

      for (let cycle = 0; cycle < 50; cycle++) {
        const currentInt = fullCycle(SYNTHETIC_PROFILES.intermediate.twin, backendRole);
        const currentBeg = fullCycle(SYNTHETIC_PROFILES.beginner.twin, frontendRole);

        assert.deepEqual(currentInt, baselineIntermediate, `Cycle ${cycle + 1} intermediate drifted`);
        assert.deepEqual(currentBeg, baselineBeginner, `Cycle ${cycle + 1} beginner drifted`);
      }
    });
  });
});
