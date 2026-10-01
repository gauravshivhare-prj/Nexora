import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { GAP_IMPORTANCE, GAP_STATUS } from '../src/domain/skillGap/computeSkillGap.js';
import {
  VIOLATION_TYPES,
  calculatePriorityScore,
  orderLearningSequence,
  validateLearningSequence,
} from '../src/domain/roadmap/skillPriorityEngine.js';

/**
 * Task 12 — Skill Priority, Dependency & Learning-Order Engine Suite
 */

describe('Task 12 — Skill Priority, Dependency & Learning-Order Engine Suite', () => {
  const BACKEND_ROLE = findRole('backend-developer');
  const FRONTEND_ROLE = findRole('frontend-developer');

  // =========================================================================
  // 1. Topological Dependency Order & DAG Sequencing
  // =========================================================================
  describe('1. Topological Dependency Order & DAG Sequencing', () => {
    it('schedules foundational prerequisites strictly before dependent skills', () => {
      // Intentionally scrambled order: Express.js, Node.js, JavaScript, Programming Fundamentals
      const scrambledGaps = [
        { key: 'express', name: 'Express.js', importance: GAP_IMPORTANCE.PREFERRED, status: GAP_STATUS.MISSING },
        { key: 'nodejs', name: 'Node.js', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
        { key: 'javascript', name: 'JavaScript', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
        { key: 'programming_fundamentals', name: 'Programming Fundamentals', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
      ];

      const ordered = orderLearningSequence(scrambledGaps, { role: BACKEND_ROLE });

      const names = ordered.map((s) => s.name);

      const fundIdx = names.indexOf('Programming Fundamentals');
      const jsIdx = names.indexOf('JavaScript');
      const nodeIdx = names.indexOf('Node.js');
      const expressIdx = names.indexOf('Express.js');

      // Assert strictly monotonic topological order:
      // Programming Fundamentals < JavaScript < Node.js < Express.js
      assert.ok(fundIdx < jsIdx, `Fundamentals (${fundIdx}) must precede JavaScript (${jsIdx})`);
      assert.ok(jsIdx < nodeIdx, `JavaScript (${jsIdx}) must precede Node.js (${nodeIdx})`);
      assert.ok(nodeIdx < expressIdx, `Node.js (${nodeIdx}) must precede Express.js (${expressIdx})`);

      // Verify sequence validation passes
      const validation = validateLearningSequence(ordered);
      assert.equal(validation.isValid, true);
      assert.equal(validation.violations.length, 0);
    });

    it('orders frontend skills with HTML/CSS and JavaScript before React', () => {
      const frontendGaps = [
        { key: 'react', name: 'React', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
        { key: 'javascript', name: 'JavaScript', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
        { key: 'html', name: 'HTML', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
      ];

      const ordered = orderLearningSequence(frontendGaps, { role: FRONTEND_ROLE });
      const names = ordered.map((s) => s.name);

      const jsIdx = names.indexOf('JavaScript');
      const reactIdx = names.indexOf('React');

      assert.ok(jsIdx < reactIdx, `JavaScript (${jsIdx}) must precede React (${reactIdx})`);

      const validation = validateLearningSequence(ordered);
      assert.equal(validation.isValid, true);
    });
  });

  // =========================================================================
  // 2. Multi-Factor Priority Scoring
  // =========================================================================
  describe('2. Multi-Factor Priority Scoring', () => {
    it('boosts blocking prerequisites over isolated optional skills', () => {
      const blockingSkill = {
        key: 'javascript',
        name: 'JavaScript',
        importance: GAP_IMPORTANCE.REQUIRED,
        status: GAP_STATUS.MISSING,
      };

      const isolatedSkill = {
        key: 'redis',
        name: 'Redis',
        importance: GAP_IMPORTANCE.PREFERRED,
        status: GAP_STATUS.MISSING,
      };

      const blockingScore = calculatePriorityScore(blockingSkill, {
        downstreamDependenciesCount: 3, // Blocks Node, React, Express
        isGoalAligned: true,
        prerequisitesMet: true,
      });

      const isolatedScore = calculatePriorityScore(isolatedSkill, {
        downstreamDependenciesCount: 0,
        isGoalAligned: false,
        prerequisitesMet: true,
      });

      assert.ok(
        blockingScore > isolatedScore,
        `Blocking core skill score (${blockingScore}) must exceed isolated optional score (${isolatedScore})`,
      );
    });

    it('penalizes skills whose foundational prerequisites are completely missing', () => {
      const readySkill = {
        key: 'javascript',
        name: 'JavaScript',
        importance: GAP_IMPORTANCE.REQUIRED,
        status: GAP_STATUS.MISSING,
      };

      const unreadySkill = {
        key: 'react',
        name: 'React',
        importance: GAP_IMPORTANCE.REQUIRED,
        status: GAP_STATUS.MISSING,
      };

      const readyScore = calculatePriorityScore(readySkill, { prerequisitesMet: true });
      const unreadyScore = calculatePriorityScore(unreadySkill, { prerequisitesMet: false });

      assert.ok(readyScore > unreadyScore);
    });
  });

  // =========================================================================
  // 3. Time Constraint Adaptation & Pacing
  // =========================================================================
  describe('3. Time Constraint Adaptation & Pacing', () => {
    const gaps = [
      { key: 'programming_fundamentals', name: 'Programming Fundamentals', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
      { key: 'javascript', name: 'JavaScript', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
      { key: 'nodejs', name: 'Node.js', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.CLAIMED },
      { key: 'sql', name: 'SQL', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.CLAIMED },
    ];

    it('paces milestones proportionately for a time-constrained student (5 hrs/week)', () => {
      const ordered = orderLearningSequence(gaps, {
        role: BACKEND_ROLE,
        availableHoursPerWeek: 5,
      });

      assert.ok(ordered.length > 0);
      assert.equal(ordered[0].phase, 'Foundations & Blockers');

      // The final item estimated weeks must reflect cumulative effort divided by 5
      const finalItem = ordered[ordered.length - 1];
      assert.ok(finalItem.estimatedWeeks >= 15);
    });

    it('reduces timeline for an intensive student (25 hrs/week)', () => {
      const intensive = orderLearningSequence(gaps, {
        role: BACKEND_ROLE,
        availableHoursPerWeek: 25,
      });

      const constrained = orderLearningSequence(gaps, {
        role: BACKEND_ROLE,
        availableHoursPerWeek: 5,
      });

      const intensiveWeeks = intensive[intensive.length - 1].estimatedWeeks;
      const constrainedWeeks = constrained[constrained.length - 1].estimatedWeeks;

      assert.ok(intensiveWeeks < constrainedWeeks);
    });
  });

  // =========================================================================
  // 4. Detection of Contradictory & Inverted Sequences
  // =========================================================================
  describe('4. Detection of Contradictory & Inverted Sequences', () => {
    it('detects and flags dependency inversion when dependent is scheduled before prerequisite', () => {
      // Inverted sequence: React (step 1) before JavaScript (step 2)
      const invertedSequence = [
        { key: 'react', name: 'React' },
        { key: 'javascript', name: 'JavaScript' },
      ];

      const outcome = validateLearningSequence(invertedSequence);

      assert.equal(outcome.isValid, false);
      assert.equal(outcome.violations.length, 1);
      assert.equal(outcome.violations[0].type, VIOLATION_TYPES.DEPENDENCY_INVERSION);
      assert.match(outcome.violations[0].reason, /Dependency inversion/i);
    });

    it('confirms validity for topologically compliant sequences', () => {
      const compliantSequence = [
        { key: 'javascript', name: 'JavaScript' },
        { key: 'react', name: 'React' },
      ];

      const outcome = validateLearningSequence(compliantSequence);
      assert.equal(outcome.isValid, true);
      assert.equal(outcome.violations.length, 0);
    });
  });

  // =========================================================================
  // 5. Explainable Why-Before Reasoning
  // =========================================================================
  describe('5. Explainable Why-Before Reasoning', () => {
    it('provides clear whyBefore explanations for every item in the ordered sequence', () => {
      const gaps = [
        { key: 'programming_fundamentals', name: 'Programming Fundamentals', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
        { key: 'javascript', name: 'JavaScript', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
        { key: 'nodejs', name: 'Node.js', importance: GAP_IMPORTANCE.REQUIRED, status: GAP_STATUS.MISSING },
      ];

      const ordered = orderLearningSequence(gaps, { role: BACKEND_ROLE });

      for (const item of ordered) {
        assert.ok(item.whyBefore?.length > 0, `Skill ${item.name} missing whyBefore explanation`);
      }

      // First item must explain it is a foundational blocker
      assert.match(ordered[0].whyBefore, /Foundational blocker/i);
    });
  });
});
