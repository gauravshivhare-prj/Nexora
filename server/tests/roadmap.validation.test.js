import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { buildRoadmap } from '../src/domain/roadmap/buildRoadmap.js';
import { computeSkillGap } from '../src/domain/skillGap/computeSkillGap.js';
import { ROADMAP_FIXTURES } from './fixtures/roadmapFixtures.js';

const BACKEND = findRole('backend-developer');
const roadmapFor = (twin, options) =>
  buildRoadmap(computeSkillGap(twin, BACKEND), options);

describe('roadmap validation fixtures', () => {
  it('orders a prerequisite before its dependent and keeps item ids unique', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty, { maxItems: 25 });
    const javascript = roadmap.items.findIndex((item) => item.skill.name === 'JavaScript');
    const express = roadmap.items.findIndex((item) => item.skill.name === 'Express.js');

    assert.ok(javascript >= 0);
    assert.ok(express >= 0);
    assert.ok(javascript < express);
    assert.equal(new Set(roadmap.items.map((item) => item.id)).size, roadmap.items.length);

    for (const item of roadmap.items) {
      for (const prerequisite of item.prerequisites) {
        assert.ok(roadmap.items.some((candidate) => candidate.id === prerequisite.itemId));
      }
    }
  });

  it('exposes only unverified resource references', () => {
    const roadmap = roadmapFor(ROADMAP_FIXTURES.empty);

    for (const item of roadmap.items) {
      for (const resource of item.resources) {
        assert.equal(resource.url, null);
        assert.equal(resource.verified, false);
      }
    }
    assert.equal(roadmap.method.resourcesVerified, false);
  });

  it('turns claimed gaps into actions while supported evidence closes them', () => {
    const planned = roadmapFor(ROADMAP_FIXTURES.foundationGaps);
    const closed = roadmapFor(ROADMAP_FIXTURES.supportedEvidence);

    assert.ok(planned.items.some((item) => item.skill.name === 'Node.js'));
    assert.equal(planned.items.find((item) => item.skill.name === 'Node.js').completion.status, 'claimed');
    assert.ok(!closed.items.some((item) => item.skill.name === 'Node.js'));
    assert.ok(closed.summary.actionableGaps < planned.summary.actionableGaps);
  });

  it('uses deterministic ordering and consecutive order numbers', () => {
    const first = roadmapFor(ROADMAP_FIXTURES.empty);
    const second = roadmapFor(ROADMAP_FIXTURES.empty);

    assert.deepEqual(first, second);
    assert.deepEqual(
      first.items.map((item) => item.order),
      first.items.map((_, index) => index + 1),
    );
  });
});