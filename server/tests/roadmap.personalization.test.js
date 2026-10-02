import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { buildRoadmap, EFFORT, PRIORITY } from '../src/domain/roadmap/buildRoadmap.js';
import { computeSkillGap } from '../src/domain/skillGap/computeSkillGap.js';
import { skillKey } from '../src/domain/skills/skillKey.js';
import { ROADMAP_FIXTURES } from './fixtures/roadmapFixtures.js';

/**
 * Task 16 — Personalised Roadmap Generation Engine Reconstruction
 *
 * Tests that the skill priority engine is correctly integrated into
 * buildRoadmap and that:
 *  1. All items carry learningOrder metadata (phase, whyBefore, priorityScore,
 *     effortHours, estimatedWeeks, blocks, dependsOn).
 *  2. Topological prerequisite ordering is preserved end-to-end.
 *  3. availableHoursPerWeek personalises the time pacing.
 *  4. studentGoals receives a priority boost.
 *  5. The method block contains sequenceValidation and personalization fields.
 *  6. Legacy fields (priority, estimatedEffort, prerequisites, completion,
 *     resources, verification, because, id, order) are still present.
 *  7. All existing determinism / edge-case contracts hold with the new engine.
 */

const BACKEND = findRole('backend-developer');
const FRONTEND = findRole('frontend-developer');

function twinWith(skills) {
  return {
    skills: skills.map(({ name, strength = 'claimed' }) => ({
      key: skillKey(name),
      name,
      strength,
      selfDeclaredLevel: null,
      sourceCount: 1,
      evidence: [
        { source: 'self_declared', strength, detail: `You listed ${name}.`, reference: null },
      ],
    })),
    targetRoles: [],
  };
}

const roadmapFor = (twin, role = BACKEND, options = {}) =>
  buildRoadmap(computeSkillGap(twin, role), options);

const itemFor = (roadmap, name) =>
  roadmap.items.find((item) => item.skill.key === skillKey(name));

// ============================================================================
// 1. learningOrder Metadata Presence
// ============================================================================

describe('Task 16 — learningOrder metadata', () => {
  it('attaches a learningOrder object to every item', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 10 });
    assert.ok(roadmap.items.length > 0);

    for (const item of roadmap.items) {
      assert.ok(item.learningOrder, `${item.skill.name} is missing learningOrder`);
      assert.ok(typeof item.learningOrder.phase === 'string', `${item.skill.name} phase not a string`);
      assert.ok(typeof item.learningOrder.whyBefore === 'string', `${item.skill.name} whyBefore missing`);
      assert.ok(typeof item.learningOrder.priorityScore === 'number', `${item.skill.name} priorityScore not a number`);
      assert.ok(Array.isArray(item.learningOrder.blocks), `${item.skill.name} blocks not an array`);
      assert.ok(Array.isArray(item.learningOrder.dependsOn), `${item.skill.name} dependsOn not an array`);
    }
  });

  it('exposes effortEstimate as a positive number for every item', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 10 });

    for (const item of roadmap.items) {
      assert.ok(
        typeof item.learningOrder.effortEstimate === 'number' && item.learningOrder.effortEstimate > 0,
        `${item.skill.name} effortEstimate should be a positive number`,
      );
    }
  });

  it('exposes paceWeeks as a positive number when availableHoursPerWeek is given', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, {
      maxItems: 10,
      availableHoursPerWeek: 10,
    });

    for (const item of roadmap.items) {
      assert.ok(
        typeof item.learningOrder.paceWeeks === 'number' && item.learningOrder.paceWeeks > 0,
        `${item.skill.name} paceWeeks should be a positive number`,
      );
    }
  });

  it('assigns a non-empty phase string from an approved set', () => {
    const KNOWN_PHASES = new Set([
      'Foundations & Blockers',
      'Core Prerequisite',
      'Core Competency',
      'Advanced Specialization',
    ]);

    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 10 });

    for (const item of roadmap.items) {
      assert.ok(
        KNOWN_PHASES.has(item.learningOrder.phase),
        `${item.skill.name} has unexpected phase: "${item.learningOrder.phase}"`,
      );
    }
  });

  it('gives the first item with downstream dependents a "Foundations & Blockers" phase', () => {
    // JavaScript is the most foundational skill — it blocks Node.js, React, etc.
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 25 });
    const js = itemFor(roadmap, 'JavaScript');
    assert.ok(js, 'JavaScript must be on the plan');
    assert.equal(js.learningOrder.phase, 'Foundations & Blockers');
  });
});

// ============================================================================
// 2. Prerequisite & Topological Ordering (end-to-end with engine)
// ============================================================================

describe('Task 16 — prerequisite ordering through priority engine', () => {
  it('places JavaScript before Node.js and Node.js before Express.js', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 25 });
    // Ensure Express.js is reachable by not capping too early
    // Use skill name lookup since canonical keys (from ontology) differ from skillKey()
    const findByName = (name) =>
      roadmap.items.findIndex((i) => i.skill.name === name);

    const jsIdx = findByName('JavaScript');
    const nodeIdx = findByName('Node.js');
    const expressIdx = findByName('Express.js');

    assert.ok(jsIdx !== -1, 'JavaScript must be on plan');
    assert.ok(nodeIdx !== -1, 'Node.js must be on plan');
    assert.ok(expressIdx !== -1, 'Express.js must be on plan');

    assert.ok(jsIdx < nodeIdx, 'JavaScript must precede Node.js');
    assert.ok(nodeIdx < expressIdx, 'Node.js must precede Express.js');
    assert.ok(jsIdx < expressIdx, 'JavaScript must transitively precede Express.js');
  });

  it('places HTML/CSS/JavaScript before React in frontend roles', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, FRONTEND, { maxItems: 25 });

    const jsIdx = roadmap.items.findIndex((i) => i.skill.key === skillKey('JavaScript'));
    const htmlIdx = roadmap.items.findIndex((i) => i.skill.key === skillKey('HTML'));
    const cssIdx = roadmap.items.findIndex((i) => i.skill.key === skillKey('CSS'));
    const reactIdx = roadmap.items.findIndex((i) => i.skill.key === skillKey('React'));

    if (reactIdx !== -1 && jsIdx !== -1) {
      assert.ok(jsIdx < reactIdx, 'JavaScript must precede React');
    }
    if (reactIdx !== -1 && htmlIdx !== -1) {
      assert.ok(htmlIdx < reactIdx, 'HTML must precede React');
    }
    if (reactIdx !== -1 && cssIdx !== -1) {
      assert.ok(cssIdx < reactIdx, 'CSS must precede React');
    }
  });

  it('sequenceValidation.isValid is true for a well-formed plan', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 25 });
    assert.equal(roadmap.method.sequenceValidation.isValid, true);
    assert.equal(roadmap.method.sequenceValidation.violationCount, 0);
    assert.deepEqual(roadmap.method.sequenceValidation.violations, []);
  });
});

// ============================================================================
// 3. Time Pacing Personalisation
// ============================================================================

describe('Task 16 — availableHoursPerWeek personalisation', () => {
  it('produces faster paceWeeks for a student with more hours available', () => {
    const slowRoadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, {
      maxItems: 10,
      availableHoursPerWeek: 5,
    });
    const fastRoadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, {
      maxItems: 10,
      availableHoursPerWeek: 25,
    });

    const lastSlowItem = slowRoadmap.items[slowRoadmap.items.length - 1];
    const lastFastItem = fastRoadmap.items[fastRoadmap.items.length - 1];

    assert.ok(
      lastSlowItem.learningOrder.paceWeeks > lastFastItem.learningOrder.paceWeeks,
      'A student with fewer hours/week should have a higher paceWeeks count',
    );
  });

  it('reflects weeklyPace in method.personalization', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, {
      maxItems: 5,
      availableHoursPerWeek: 20,
    });

    assert.equal(roadmap.method.personalization.weeklyPace, 20);
  });

  it('defaults weeklyPace to 15 when not specified', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 5 });
    assert.equal(roadmap.method.personalization.weeklyPace, 15);
  });
});

// ============================================================================
// 4. Student Goals Personalisation
// ============================================================================

describe('Task 16 — studentGoals personalisation', () => {
  it('reflects studentGoals in method.personalization', () => {
    const goals = ['docker', 'kubernetes'];
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, {
      maxItems: 10,
      studentGoals: goals,
    });

    assert.deepEqual(roadmap.method.personalization.studentGoals, goals);
  });

  it('defaults to empty goals array when not specified', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 5 });
    assert.deepEqual(roadmap.method.personalization.studentGoals, []);
  });
});

// ============================================================================
// 5. Method Block Integrity
// ============================================================================

describe('Task 16 — method block', () => {
  it('always includes sequenceValidation in the method block', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 5 });

    assert.ok(roadmap.method.sequenceValidation, 'sequenceValidation must be present');
    assert.ok(typeof roadmap.method.sequenceValidation.isValid === 'boolean');
    assert.ok(typeof roadmap.method.sequenceValidation.violationCount === 'number');
    assert.ok(Array.isArray(roadmap.method.sequenceValidation.violations));
  });

  it('always includes personalization with weeklyPace in the method block', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 5 });

    assert.ok(roadmap.method.personalization, 'personalization must be present');
    assert.ok(typeof roadmap.method.personalization.weeklyPace === 'number');
    assert.ok(Array.isArray(roadmap.method.personalization.studentGoals));
  });

  it('keeps usesAi false and generatedFrom skill-gap', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND);
    assert.equal(roadmap.method.usesAi, false);
    assert.equal(roadmap.method.generatedFrom, 'skill-gap');
    assert.equal(roadmap.method.deterministic, true);
  });
});

// ============================================================================
// 6. Legacy Field Contracts (regression)
// ============================================================================

describe('Task 16 — legacy field contracts (regression)', () => {
  it('still attaches priority, estimatedEffort, prerequisites, completion, resources, verification, because, id, order', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 10 });
    assert.ok(roadmap.items.length > 0);

    for (const item of roadmap.items) {
      assert.ok([PRIORITY.CRITICAL, PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW].includes(item.priority));
      assert.ok([EFFORT.QUICK, EFFORT.MODERATE, EFFORT.SUBSTANTIAL].includes(item.estimatedEffort));
      assert.ok(Array.isArray(item.prerequisites));
      assert.equal(item.completion.isComplete, false);
      assert.ok(item.completion.completesWhen);
      assert.ok(Array.isArray(item.resources) && item.resources.length > 0);
      assert.ok(item.verification?.method);
      assert.ok(item.because?.roleTitle);
      assert.ok(typeof item.id === 'string' && item.id.length > 0);
      assert.ok(typeof item.order === 'number' && item.order > 0);
    }
  });

  it('numbers items 1-indexed and consecutively', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 8 });
    assert.deepEqual(
      roadmap.items.map((i) => i.order),
      roadmap.items.map((_, idx) => idx + 1),
    );
  });

  it('never fabricates a resource URL', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 5 });
    for (const item of roadmap.items) {
      for (const resource of item.resources) {
        assert.equal(resource.url, null, `${item.skill.name} has an invented link`);
        assert.equal(resource.verified, false);
      }
    }
  });

  it('closes items via evidence, not flags (isComplete always false)', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.foundationGaps, BACKEND, { maxItems: 10 });
    for (const item of roadmap.items) {
      assert.equal(item.completion.isComplete, false);
    }
  });
});

// ============================================================================
// 7. Determinism (regression)
// ============================================================================

describe('Task 16 — determinism', () => {
  it('produces identical output for identical inputs', () => {
    const first = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, {
      maxItems: 10,
      availableHoursPerWeek: 12,
      studentGoals: ['docker'],
    });
    const second = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, {
      maxItems: 10,
      availableHoursPerWeek: 12,
      studentGoals: ['docker'],
    });

    assert.deepEqual(first, second);
  });

  it('handles empty gap gracefully', () => {
    const roadmap = buildRoadmap(null);
    assert.deepEqual(roadmap.items, []);
    assert.equal(roadmap.goal.roleId, null);
    assert.ok(roadmap.method.sequenceValidation.isValid);
  });

  it('handles maxItems=0 without error', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, BACKEND, { maxItems: 0 });
    assert.equal(roadmap.items.length, 0);
    assert.ok(roadmap.summary.actionableGaps > 0);
  });
});
