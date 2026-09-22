import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { GAP_STATUS, computeSkillGap } from '../src/domain/skillGap/computeSkillGap.js';
import { skillKey } from '../src/domain/skills/skillKey.js';
import { SKILL_GAP_FIXTURES } from './fixtures/skillGapFixtures.js';

const BACKEND = findRole('backend-developer');
const find = (gap, name) => gap.skills.find((skill) => skill.key === skillKey(name));

describe('skill gap validation fixtures', () => {
  it('preserves missing, claimed, supported, and verified statuses', () => {
    const gap = computeSkillGap(SKILL_GAP_FIXTURES.statusLevels, BACKEND);

    assert.equal(find(gap, 'JavaScript').status, GAP_STATUS.CLAIMED);
    assert.equal(find(gap, 'Node.js').status, GAP_STATUS.SUPPORTED);
    assert.equal(find(gap, 'REST APIs').status, GAP_STATUS.VERIFIED);
    assert.equal(find(gap, 'SQL').status, GAP_STATUS.MISSING);
  });

  it('normalizes case, spacing, punctuation, and aliases at the gap boundary', () => {
    const gap = computeSkillGap(SKILL_GAP_FIXTURES.normalizationEdges, BACKEND);

    assert.equal(find(gap, 'Node.js').yourSkill, 'NODE JS');
    assert.equal(find(gap, 'Node.js').status, GAP_STATUS.CLAIMED);
    assert.equal(find(gap, 'REST APIs').yourSkill, 'restful-apis');
    assert.equal(find(gap, 'REST APIs').status, GAP_STATUS.SUPPORTED);
  });

  it('keeps required gaps ahead of preferred work and verified skills', () => {
    const gap = computeSkillGap(SKILL_GAP_FIXTURES.statusLevels, BACKEND);
    const firstVerified = gap.skills.findIndex((skill) => skill.status === GAP_STATUS.VERIFIED);
    const firstRequiredMissing = gap.skills.findIndex(
      (skill) => skill.importance === 'required' && skill.status === GAP_STATUS.MISSING,
    );

    assert.ok(firstRequiredMissing >= 0);
    assert.ok(firstRequiredMissing < firstVerified);
  });
});