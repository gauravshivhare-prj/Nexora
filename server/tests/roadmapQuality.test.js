import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findRole } from '../src/domain/careers/roleCatalogue.js';
import {
  EFFORT,
  PRIORITY,
  buildRoadmap,
} from '../src/domain/roadmap/buildRoadmap.js';
import { computeSkillGap } from '../src/domain/skillGap/computeSkillGap.js';
import { skillKey } from '../src/domain/skills/skillKey.js';
import { ROADMAP_FIXTURES } from './fixtures/roadmapFixtures.js';

const BACKEND = findRole('backend-developer');
const FRONTEND = findRole('frontend-developer');
const FULLSTACK = findRole('full-stack-developer');

const roadmapFor = (twin, role = BACKEND, options = {}) =>
  buildRoadmap(computeSkillGap(twin, role), options);

const itemFor = (roadmap, name) =>
  roadmap.items.find((item) => item.skill.key === skillKey(name));

describe('TASK A18 — Roadmap Quality Audit Suite', () => {
  // =========================================================================
  // 1. Prerequisites & Prerequisite Ordering
  // =========================================================================
  describe('1. Prerequisites & Prerequisite Ordering', () => {
    it('ensures every prerequisite strictly precedes its dependent on the roadmap', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 25 });

      const jsIndex = roadmap.items.findIndex((i) => i.skill.name === 'JavaScript');
      const nodeIndex = roadmap.items.findIndex((i) => i.skill.name === 'Node.js');
      const expressIndex = roadmap.items.findIndex((i) => i.skill.name === 'Express.js');

      assert.ok(jsIndex !== -1, 'JavaScript must be on plan');
      assert.ok(nodeIndex !== -1, 'Node.js must be on plan');
      assert.ok(expressIndex !== -1, 'Express.js must be on plan');

      // Prerequisite chain: JavaScript -> Node.js -> Express.js
      assert.ok(jsIndex < nodeIndex, 'JavaScript must precede Node.js');
      assert.ok(nodeIndex < expressIndex, 'Node.js must precede Express.js');
      assert.ok(jsIndex < expressIndex, 'JavaScript must precede Express.js');
    });

    it('enforces transitive foundation ordering in frontend roles (JS/HTML/CSS -> React -> Next.js)', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, FRONTEND, { maxItems: 25 });

      const jsIndex = roadmap.items.findIndex((i) => i.skill.name === 'JavaScript');
      const htmlIndex = roadmap.items.findIndex((i) => i.skill.name === 'HTML');
      const cssIndex = roadmap.items.findIndex((i) => i.skill.name === 'CSS');
      const reactIndex = roadmap.items.findIndex((i) => i.skill.name === 'React');
      const nextIndex = roadmap.items.findIndex((i) => i.skill.name === 'Next.js');

      if (reactIndex !== -1 && jsIndex !== -1) {
        assert.ok(jsIndex < reactIndex, 'JavaScript must precede React');
      }
      if (reactIndex !== -1 && htmlIndex !== -1) {
        assert.ok(htmlIndex < reactIndex, 'HTML must precede React');
      }
      if (reactIndex !== -1 && cssIndex !== -1) {
        assert.ok(cssIndex < reactIndex, 'CSS must precede React');
      }
      if (nextIndex !== -1 && reactIndex !== -1) {
        assert.ok(reactIndex < nextIndex, 'React must precede Next.js');
      }
      if (nextIndex !== -1 && jsIndex !== -1) {
        assert.ok(jsIndex < nextIndex, 'JavaScript must transitively precede Next.js');
      }
    });

    it('places foundation prerequisite first even when dependent has higher priority', () => {
      // In this twin, Node.js is claimed (priority HIGH). Express.js is missing (priority MEDIUM).
      // Even if both or either has distinct priorities, foundations must precede dependents.
      const roadmap = roadmapFor(ROADMAP_FIXTURES.mixedPriorityWithPrerequisite, BACKEND, { maxItems: 25 });

      const nodeIndex = roadmap.items.findIndex((i) => i.skill.name === 'Node.js');
      const expressIndex = roadmap.items.findIndex((i) => i.skill.name === 'Express.js');

      assert.ok(nodeIndex !== -1 && expressIndex !== -1);
      assert.ok(nodeIndex < expressIndex, 'Node.js must precede Express.js');
    });

    it('drops prerequisites that the student already has as supported or verified', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.supportedEvidence, BACKEND, { maxItems: 25 });
      const express = itemFor(roadmap, 'Express.js');

      // Both JavaScript and Node.js are supported, so neither remains an unmet prerequisite
      assert.ok(express);
      assert.deepEqual(express.prerequisites, []);
    });

    it('ensures every prerequisite listed in an item actually exists on the generated roadmap', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 25 });

      for (const item of roadmap.items) {
        for (const prereq of item.prerequisites) {
          const target = roadmap.items.find((i) => i.id === prereq.itemId);
          assert.ok(target, `Prerequisite ${prereq.name} on ${item.skill.name} missing from plan`);
        }
      }
    });
  });

  // =========================================================================
  // 2. Priority & Effort Calibration
  // =========================================================================
  describe('2. Priority & Effort Calibration', () => {
    it('assigns CRITICAL priority and SUBSTANTIAL effort to missing required skills', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND);
      const sql = itemFor(roadmap, 'SQL');

      assert.equal(sql.priority, PRIORITY.CRITICAL);
      assert.equal(sql.estimatedEffort, EFFORT.SUBSTANTIAL);
      assert.match(sql.title, /^Learn SQL/);
      assert.match(sql.objective, /Learn enough SQL/);
    });

    it('assigns HIGH priority and MODERATE effort to claimed required skills', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.foundationGaps, BACKEND);
      const node = itemFor(roadmap, 'Node.js');

      assert.equal(node.priority, PRIORITY.HIGH);
      assert.equal(node.estimatedEffort, EFFORT.MODERATE);
      assert.match(node.title, /^Demonstrate Node\.js/);
      assert.match(node.objective, /Turn your Node\.js claim into something Nexora can see/);
    });

    it('assigns MEDIUM priority to preferred skills that are missing or claimed', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 25 });
      const git = itemFor(roadmap, 'Git');

      assert.equal(git.priority, PRIORITY.MEDIUM);
      assert.equal(git.because.importance, 'preferred');
    });

    it('numbers items with consecutive, 1-indexed order property', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 10 });

      assert.equal(roadmap.items.length, 10);
      roadmap.items.forEach((item, index) => {
        assert.equal(item.order, index + 1);
      });
    });
  });

  // =========================================================================
  // 3. Learning Resources & Verification Semantics
  // =========================================================================
  describe('3. Resources & Verification Semantics', () => {
    it('provides three distinct resource types with search hints and no fabricated URLs', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND);

      for (const item of roadmap.items) {
        assert.equal(item.resources.length, 3);

        const doc = item.resources.find((r) => r.type === 'documentation');
        const course = item.resources.find((r) => r.type === 'course');
        const project = item.resources.find((r) => r.type === 'practice_project');

        assert.ok(doc && course && project);
        assert.equal(doc.url, null);
        assert.equal(course.url, null);
        assert.equal(project.url, null);

        assert.equal(doc.verified, false);
        assert.equal(course.verified, false);
        assert.equal(project.verified, false);

        assert.match(doc.searchHint, new RegExp(item.skill.name));
        assert.match(course.searchHint, new RegExp(item.skill.name));
        assert.equal(project.searchHint, null);
      }
    });

    it('includes verification step targeting supported status through projects', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND);

      for (const item of roadmap.items) {
        assert.equal(item.verification.method, 'project');
        assert.equal(item.verification.reaches, 'supported');
        assert.equal(item.verification.available, true);
        assert.match(item.verification.description, new RegExp(item.skill.name));

        assert.equal(item.verification.alternative.method, 'assessment');
        assert.equal(item.verification.alternative.reaches, 'verified');
        assert.equal(item.verification.alternative.available, false);
      }
    });

    it('plainly disclaims that resources are search hints and not curated recommendations', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND);

      assert.equal(roadmap.method.resourcesVerified, false);
      assert.equal(roadmap.method.usesAi, false);
      assert.match(roadmap.method.resourceNote, /structured placeholders with search hints/);
      assert.match(roadmap.method.resourceNote, /inventing links would be worse/);
    });
  });

  // =========================================================================
  // 4. Evidence Closure & Prevention of Fake Completion
  // =========================================================================
  describe('4. Evidence Closure & Fake Completion Guardrails', () => {
    it('never exposes isComplete: true on any roadmap item', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.foundationGaps, BACKEND);

      for (const item of roadmap.items) {
        assert.equal(item.completion.isComplete, false, 'isComplete must always be false on active roadmap');
        assert.ok(item.completion.status === 'missing' || item.completion.status === 'claimed');
        assert.match(item.completion.completesWhen, /reaches "supported"/);
      }
    });

    it('closes items completely when evidence reaches supported status', () => {
      const beforeEvidence = roadmapFor(ROADMAP_FIXTURES.foundationGaps, BACKEND);
      const afterEvidence = roadmapFor(ROADMAP_FIXTURES.supportedEvidence, BACKEND);

      // Node.js was on plan before evidence
      assert.ok(beforeEvidence.items.some((i) => i.skill.name === 'Node.js'));
      // Node.js is completely closed and absent after supported evidence
      assert.ok(!afterEvidence.items.some((i) => i.skill.name === 'Node.js'));

      assert.ok(afterEvidence.summary.actionableGaps < beforeEvidence.summary.actionableGaps);
    });

    it('returns empty items array and zero actionable gaps when all requirements are met', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.allGapsClosed, BACKEND);

      assert.deepEqual(roadmap.items, []);
      assert.equal(roadmap.summary.totalItems, 0);
      assert.equal(roadmap.summary.actionableGaps, 0);
      assert.equal(roadmap.summary.critical, 0);
      assert.equal(roadmap.summary.high, 0);
    });

    it('tracks single gap remaining accurately', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.singleGap, BACKEND);

      assert.equal(roadmap.items.length, 1);
      assert.equal(roadmap.items[0].skill.name, 'JavaScript');
      assert.equal(roadmap.summary.actionableGaps, 1);
      assert.equal(roadmap.summary.high, 1); // JavaScript is claimed -> HIGH
    });
  });

  // =========================================================================
  // 5. Defensive Edge Cases & Determinism
  // =========================================================================
  describe('5. Defensive Edge Cases & Determinism', () => {
    it('safely handles null, undefined, or malformed gap without throwing', () => {
      const roadmapNull = buildRoadmap(null);
      assert.equal(roadmapNull.goal.roleId, null);
      assert.deepEqual(roadmapNull.items, []);
      assert.equal(roadmapNull.summary.totalItems, 0);

      const roadmapUndefined = buildRoadmap(undefined);
      assert.deepEqual(roadmapUndefined.items, []);

      const roadmapEmpty = buildRoadmap({});
      assert.deepEqual(roadmapEmpty.items, []);
    });

    it('produces identical roadmap across multiple executions with identical inputs', () => {
      const first = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND);
      const second = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND);

      assert.deepEqual(first, second);
    });

    it('honors maxItems and accurately reports unshown actionable gaps in summary', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 3 });

      assert.equal(roadmap.items.length, 3);
      assert.equal(roadmap.summary.totalItems, 3);
      assert.ok(roadmap.summary.actionableGaps > 3);
    });

    it('safely handles maxItems = 0 without error', () => {
      const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 0 });

      assert.equal(roadmap.items.length, 0);
      assert.equal(roadmap.summary.totalItems, 0);
      assert.ok(roadmap.summary.actionableGaps > 0);
    });
  });
});
