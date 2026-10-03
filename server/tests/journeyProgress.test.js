/**
 * Task 27 — Complete Student Career Journey / Closed-Loop Intelligence Tests
 *
 * Verifies:
 * 1. Journey Milestone Schema & Catalog:
 *    - All 10 canonical milestones defined with valid keys, labels, stages, and routes.
 *    - Strict ordering 1 through 10.
 *
 * 2. Individual Milestone Completion Checking (isMilestoneCompleted):
 *    - Accurately checks completion for both canonicalStudent and dashboard summary contexts.
 *    - Validates profile, resumes, CareerTwin, recommendations, skill gap, roadmap,
 *      assessments, interviews, and role fit verification.
 *
 * 3. Closed-Loop Progress Computation (computeJourneyProgress):
 *    - Empty state: 0% complete, Onboarding stage, next milestone is profile_created.
 *    - Progressive states correctly increment completedCount and advance stage.
 *    - 100% state: all milestones completed, isComplete true, nextMilestone null.
 *    - Handles null/undefined/empty input safely and deterministically.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  JOURNEY_MILESTONES,
  JOURNEY_MILESTONE_KEYS,
  JOURNEY_STAGES,
  computeJourneyProgress,
  isMilestoneCompleted,
} from '../src/domain/student/journeyMilestones.js';
import { assembleCanonicalStudentState } from '../src/domain/student/canonicalStudent.js';

describe('Task 27 — Closed-Loop Student Journey Progress Engine', () => {
  // ─── 1. Milestone Catalogue & Schema ──────────────────────────────────────
  describe('1. Journey Milestone Catalogue & Hierarchy', () => {
    it('defines exactly 10 canonical career progression milestones', () => {
      assert.strictEqual(JOURNEY_MILESTONES.length, 10);
      assert.strictEqual(Object.keys(JOURNEY_MILESTONE_KEYS).length, 10);
    });

    it('enforces sequential ordering from 1 to 10 without gaps', () => {
      const orders = JOURNEY_MILESTONES.map((m) => m.order);
      assert.deepStrictEqual(orders, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('ensures each milestone has valid label, stage, description, and actionRoute', () => {
      const validStages = Object.values(JOURNEY_STAGES);

      for (const milestone of JOURNEY_MILESTONES) {
        assert.ok(typeof milestone.key === 'string' && milestone.key.length > 0);
        assert.ok(typeof milestone.label === 'string' && milestone.label.length > 0);
        assert.ok(validStages.includes(milestone.stage), `Invalid stage ${milestone.stage}`);
        assert.ok(typeof milestone.description === 'string' && milestone.description.length >= 10);
        assert.ok(typeof milestone.actionRoute === 'string' && milestone.actionRoute.startsWith('/'));
      }
    });
  });

  // ─── 2. Milestone Evaluation Logic ────────────────────────────────────────
  describe('2. Milestone Completion Evaluation (isMilestoneCompleted)', () => {
    it('detects profile_created when profile has skills or projects', () => {
      assert.strictEqual(isMilestoneCompleted('profile_created', {}), false);
      assert.strictEqual(
        isMilestoneCompleted('profile_created', {
          profile: { exists: true, skillCount: 2, projectCount: 0, hasTargetRole: false },
        }),
        true,
      );
      assert.strictEqual(
        isMilestoneCompleted('profile_created', {
          profile: { exists: true, skillCount: 0, projectCount: 1, hasTargetRole: false },
        }),
        true,
      );
    });

    it('detects resume_uploaded and resume_analyzed milestones', () => {
      assert.strictEqual(
        isMilestoneCompleted('resume_uploaded', { resumes: { total: 0, analysed: 0 } }),
        false,
      );
      assert.strictEqual(
        isMilestoneCompleted('resume_uploaded', { resumes: { total: 1, analysed: 0 } }),
        true,
      );
      assert.strictEqual(
        isMilestoneCompleted('resume_analyzed', { resumes: { total: 1, analysed: 0 } }),
        false,
      );
      assert.strictEqual(
        isMilestoneCompleted('resume_analyzed', { resumes: { total: 1, analysed: 1 } }),
        true,
      );
    });

    it('detects twin_generated when CareerTwin exists', () => {
      assert.strictEqual(
        isMilestoneCompleted('twin_generated', { careerTwin: { exists: false } }),
        false,
      );
      assert.strictEqual(
        isMilestoneCompleted('twin_generated', { careerTwin: { exists: true } }),
        true,
      );
    });

    it('detects recommendations_viewed, gap_analyzed, and roadmap_generated', () => {
      assert.strictEqual(
        isMilestoneCompleted('recommendations_viewed', { matches: { exists: true, top: [{ roleId: 'be-dev' }] } }),
        true,
      );
      assert.strictEqual(
        isMilestoneCompleted('gap_analyzed', { skillGap: { roleId: 'be-dev', summary: {} } }),
        true,
      );
      assert.strictEqual(
        isMilestoneCompleted('roadmap_generated', { roadmap: { roleId: 'be-dev', summary: {} } }),
        true,
      );
    });

    it('detects assessment_attempted and interview_completed counts', () => {
      assert.strictEqual(
        isMilestoneCompleted('assessment_attempted', { assessmentAttemptsCount: 0 }),
        false,
      );
      assert.strictEqual(
        isMilestoneCompleted('assessment_attempted', { assessmentAttemptsCount: 2 }),
        true,
      );
      assert.strictEqual(
        isMilestoneCompleted('interview_completed', { interviewSessionsCount: 0 }),
        false,
      );
      assert.strictEqual(
        isMilestoneCompleted('interview_completed', { interviewSessionsCount: 1 }),
        true,
      );
    });

    it('supports CanonicalStudentState representation from Task 02', () => {
      const user = { _id: '507f1f77bcf86cd799439011', email: 'student@example.com', name: 'Student' };
      const profile = {
        _id: '507f1f77bcf86cd799439012',
        career: { targetRole: 'Backend Developer' },
        skills: [{ name: 'Node.js', level: 'intermediate' }],
        projects: [{ title: 'Nexora' }],
      };
      const resumes = [{ _id: '507f1f77bcf86cd799439013' }];
      const evidenceChecks = [{ skill: 'Node.js', strength: 'verified', sourceType: 'human_interview' }];
      const assessmentAttempts = [{ assessmentId: 'a1', score: 0.85 }];
      const interviewSessions = [{ sessionId: 's1', status: 'completed' }];

      const canonical = assembleCanonicalStudentState({
        user,
        profile,
        resumes,
        evidenceChecks,
        assessmentAttempts,
        interviewSessions,
      });

      assert.strictEqual(isMilestoneCompleted('profile_created', canonical), true);
      assert.strictEqual(isMilestoneCompleted('resume_uploaded', canonical), true);
      assert.strictEqual(isMilestoneCompleted('twin_generated', canonical), true);
      assert.strictEqual(isMilestoneCompleted('assessment_attempted', canonical), true);
      assert.strictEqual(isMilestoneCompleted('interview_completed', canonical), true);
      assert.strictEqual(isMilestoneCompleted('role_fit_verified', canonical), true);
    });
  });

  // ─── 3. Full Journey Progress Computation ─────────────────────────────────
  describe('3. Journey Progress Computation (computeJourneyProgress)', () => {
    it('returns zero progress for completely fresh account and guides to profile', () => {
      const progress = computeJourneyProgress({});

      assert.strictEqual(progress.completedCount, 0);
      assert.strictEqual(progress.totalMilestones, 10);
      assert.strictEqual(progress.progressPercentage, 0);
      assert.strictEqual(progress.currentStage, JOURNEY_STAGES.ONBOARDING);
      assert.strictEqual(progress.isComplete, false);
      assert.strictEqual(progress.nextMilestone.key, 'profile_created');
      assert.strictEqual(progress.nextMilestone.actionRoute, '/profile');
    });

    it('advances stages and calculates progress percentage progressively', () => {
      // 4 milestones completed (Profile, Resume, Analysed, Twin) -> 40% -> Discovery stage
      const discoveryContext = {
        profile: { exists: true, skillCount: 3 },
        resumes: { total: 1, analysed: 1 },
        careerTwin: { exists: true },
        matches: { exists: false, top: [] },
        skillGap: null,
        roadmap: null,
      };

      const progress = computeJourneyProgress(discoveryContext);

      assert.strictEqual(progress.completedCount, 4);
      assert.strictEqual(progress.progressPercentage, 40);
      assert.strictEqual(progress.currentStage, JOURNEY_STAGES.DISCOVERY);
      assert.strictEqual(progress.nextMilestone.key, 'recommendations_viewed');
      assert.strictEqual(progress.nextMilestone.actionRoute, '/careers');
    });

    it('reaches Planning stage when recommendations and gaps are analyzed', () => {
      const planningContext = {
        profile: { exists: true, skillCount: 3 },
        resumes: { total: 1, analysed: 1 },
        careerTwin: { exists: true },
        matches: { exists: true, top: [{ roleId: 'be-dev' }] },
        skillGap: { roleId: 'be-dev' },
        roadmap: null,
      };

      const progress = computeJourneyProgress(planningContext);

      assert.strictEqual(progress.completedCount, 6);
      assert.strictEqual(progress.progressPercentage, 60);
      assert.strictEqual(progress.currentStage, JOURNEY_STAGES.PLANNING);
      assert.strictEqual(progress.nextMilestone.key, 'roadmap_generated');
      assert.strictEqual(progress.nextMilestone.actionRoute, '/roadmap');
    });

    it('reaches Validation stage when assessments or interviews are underway', () => {
      const validationContext = {
        profile: { exists: true, skillCount: 5 },
        resumes: { total: 1, analysed: 1 },
        careerTwin: { exists: true },
        matches: { exists: true, top: [{ roleId: 'be-dev' }] },
        skillGap: { roleId: 'be-dev' },
        roadmap: { roleId: 'be-dev' },
        assessmentAttemptsCount: 1,
        interviewSessionsCount: 0,
      };

      const progress = computeJourneyProgress(validationContext);

      assert.strictEqual(progress.completedCount, 8);
      assert.strictEqual(progress.progressPercentage, 80);
      assert.strictEqual(progress.currentStage, JOURNEY_STAGES.VALIDATION);
      assert.strictEqual(progress.nextMilestone.key, 'interview_completed');
      assert.strictEqual(progress.nextMilestone.actionRoute, '/interviews');
    });

    it('reports 100% completion when all 10 milestones are accomplished', () => {
      const fullContext = {
        profile: { exists: true, skillCount: 5 },
        resumes: { total: 1, analysed: 1 },
        careerTwin: { exists: true },
        matches: { exists: true, top: [{ roleId: 'be-dev' }] },
        focusRole: { roleId: 'be-dev', title: 'Backend Developer' },
        skillGap: { roleId: 'be-dev' },
        roadmap: { roleId: 'be-dev' },
        assessmentAttemptsCount: 3,
        interviewSessionsCount: 2,
      };

      const progress = computeJourneyProgress(fullContext);

      assert.strictEqual(progress.completedCount, 10);
      assert.strictEqual(progress.progressPercentage, 100);
      assert.strictEqual(progress.isComplete, true);
      assert.strictEqual(progress.currentStage, JOURNEY_STAGES.ALIGNMENT);
      assert.strictEqual(progress.nextMilestone, null);
    });

    it('is purely deterministic and handles null/undefined arguments without throwing', () => {
      const r1 = computeJourneyProgress(null);
      const r2 = computeJourneyProgress(undefined);
      const r3 = computeJourneyProgress({});

      assert.deepStrictEqual(r1, r2);
      assert.deepStrictEqual(r2, r3);
      assert.strictEqual(r1.completedCount, 0);
    });
  });
});
