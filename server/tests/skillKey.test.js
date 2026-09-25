import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isSameSkill,
  canonicalSkill,
  knownSkillNames,
  SKILL_TAXONOMY_VERSION,
  skillDisplayName,
  skillKey,
  uniqueSkills,
} from '../src/domain/skills/skillKey.js';

import {
  ALIAS_REGRESSION_FIXTURES,
  DISTINCT_SKILL_PAIRS,
  INVALID_SKILL_INPUTS,
} from './fixtures/skillTaxonomyFixtures.js';
import { CAREER_ROLES } from '../src/domain/careers/roleCatalogue.js';

/**
 * Canonical skill identity.
 *
 * Small module, disproportionate blast radius: every career match, skill gap
 * and roadmap item compares skills through it. A wrong answer here does not
 * fail loudly — it tells a student to learn something they already listed, or
 * hides a gap they really have.
 */

describe('skillKey', () => {
  it('exposes a versioned canonical taxonomy', () => {
    assert.equal(SKILL_TAXONOMY_VERSION, 2);
    assert.ok(knownSkillNames().includes('Docker'));
    assert.deepEqual(canonicalSkill('NODE JS'), { key: 'nodejs', name: 'Node.js' });
  });

  it('ignores case, punctuation and spacing', () => {
    const key = skillKey('Node.js');

    for (const variant of ['node.js', 'NODE JS', 'node-js', 'NodeJS', '  Node.js  ']) {
      assert.equal(skillKey(variant), key, `"${variant}" did not match`);
    }
  });

  it('resolves a curated synonym to the same key', () => {
    assert.equal(skillKey('JS'), skillKey('JavaScript'));
    assert.equal(skillKey('golang'), skillKey('Go'));
    assert.equal(skillKey('k8s'), skillKey('Kubernetes'));
    assert.equal(skillKey('postgres'), skillKey('PostgreSQL'));
    assert.equal(skillKey('DSA'), skillKey('Data Structures and Algorithms'));
  });

  it('keeps + and # so C, C++ and C# stay three skills', () => {
    const keys = new Set([skillKey('C'), skillKey('C++'), skillKey('C#')]);

    assert.equal(keys.size, 3, 'two of C, C++ and C# collapsed together');
  });

  it('keeps genuinely different skills apart', () => {
    for (const [left, right] of DISTINCT_SKILL_PAIRS) {
      assert.notEqual(skillKey(left), skillKey(right), `"${left}" and "${right}" merged`);
      assert.ok(!isSameSkill(left, right), `isSameSkill wrongly true for "${left}" and "${right}"`);
    }
  });

  it('returns an empty key for a name with no usable content', () => {
    for (const value of INVALID_SKILL_INPUTS) {
      assert.equal(skillKey(value), '');
      assert.equal(canonicalSkill(value), null);
    }
  });

  it('resolves all alias regression fixtures to correct key and canonical name', () => {
    for (const fixture of ALIAS_REGRESSION_FIXTURES) {
      const key = skillKey(fixture.input);
      assert.equal(
        key,
        fixture.expectedKey,
        `Expected skillKey("${fixture.input}") to be "${fixture.expectedKey}", got "${key}"`,
      );

      const resolved = canonicalSkill(fixture.input);
      assert.ok(
        resolved !== null,
        `Expected canonicalSkill("${fixture.input}") to resolve, but got null`,
      );
      assert.equal(
        resolved.key,
        fixture.expectedKey,
        `canonicalSkill("${fixture.input}").key expected "${fixture.expectedKey}", got "${resolved.key}"`,
      );
      assert.equal(
        resolved.name,
        fixture.expectedName,
        `canonicalSkill("${fixture.input}").name expected "${fixture.expectedName}", got "${resolved.name}"`,
      );

      const displayName = skillDisplayName(fixture.input);
      assert.equal(
        displayName,
        fixture.expectedName,
        `skillDisplayName("${fixture.input}") expected "${fixture.expectedName}", got "${displayName}"`,
      );
    }
  });

  it('guarantees 100% of skills in role catalogue resolve to known canonical skills', () => {
    for (const role of CAREER_ROLES) {
      const allRoleSkills = [...role.requiredSkills, ...role.preferredSkills];
      for (const skill of allRoleSkills) {
        const canonical = canonicalSkill(skill);
        assert.ok(
          canonical !== null,
          `Role "${role.title}" specifies skill "${skill}" which does not resolve to canonical skill`,
        );
        assert.equal(canonical.name, skill, `Canonical name mismatch for "${skill}"`);
      }
    }
  });
});

describe('isSameSkill', () => {
  it('matches across spelling and synonyms', () => {
    assert.ok(isSameSkill('Node.js', 'NODEJS'));
    assert.ok(isSameSkill('js', 'JavaScript'));
  });

  it('does not match two empty names to each other', () => {
    // "No skill" is not something two sources can agree on.
    assert.ok(!isSameSkill('', ''));
    assert.ok(!isSameSkill(null, undefined));
  });
});

describe('skillDisplayName', () => {
  it('prefers the canonical spelling over the variant', () => {
    assert.equal(skillDisplayName('nodejs'), 'Node.js');
    assert.equal(skillDisplayName('JS'), 'JavaScript');
    assert.equal(skillDisplayName('k8s'), 'Kubernetes');
  });

  it('recognises a canonical name as its own', () => {
    assert.equal(skillDisplayName('Node.js'), 'Node.js');
    assert.equal(skillDisplayName('node.js'), 'Node.js');
  });

  it('keeps the student\'s own words for an unknown skill', () => {
    // Not title-cased: guessing turns "npm" into "Npm" and "iOS" into "Ios".
    assert.equal(skillDisplayName('  Svelte '), 'Svelte');
    assert.equal(skillDisplayName('npm'), 'npm');
    assert.equal(skillDisplayName('iOS'), 'iOS');
  });
});

describe('uniqueSkills', () => {
  it('collapses variants of one skill to a single entry', () => {
    const result = uniqueSkills(['Node.js', 'nodejs', 'NODE', 'React']);

    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'Node.js');
    assert.equal(result[1].name, 'React');
  });

  it('keeps the first occurrence\'s position', () => {
    const result = uniqueSkills(['React', 'JavaScript', 'js']);

    assert.deepEqual(
      result.map((skill) => skill.name),
      ['React', 'JavaScript'],
    );
  });

  it('drops entries with no usable name', () => {
    const result = uniqueSkills(['Node.js', '', '   ', null]);

    assert.equal(result.length, 1);
  });
});
