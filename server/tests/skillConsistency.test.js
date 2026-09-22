import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { catalogueSkillNames, CAREER_ROLES } from '../src/domain/careers/roleCatalogue.js';
import { canonicalSkill, skillKey } from '../src/domain/skills/skillKey.js';

describe('cross-domain canonical skill consistency', () => {
  it('has canonical keys for every role skill and technology', () => {
    for (const name of catalogueSkillNames()) {
      assert.deepEqual(canonicalSkill(name)?.key, skillKey(name), `missing taxonomy entry for ${name}`);
    }
  });

  it('keeps required and preferred role skills distinct after normalization', () => {
    for (const role of CAREER_ROLES) {
      const required = new Set(role.requiredSkills.map(skillKey));
      const preferred = new Set(role.preferredSkills.map(skillKey));
      assert.equal(
        [...required].filter((key) => preferred.has(key)).length,
        0,
        `${role.id} duplicates a skill across required and preferred lists`,
      );
    }
  });
});
