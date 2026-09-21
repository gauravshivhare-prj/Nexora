import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isSameSkill,
  skillDisplayName,
  skillKey,
  uniqueSkills,
} from '../src/domain/skills/skillKey.js';

/**
 * Canonical skill identity.
 *
 * Small module, disproportionate blast radius: every career match, skill gap
 * and roadmap item compares skills through it. A wrong answer here does not
 * fail loudly — it tells a student to learn something they already listed, or
 * hides a gap they really have.
 */

describe('skillKey', () => {
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
    // Every pair here is a near-miss that a looser rule would merge, and each
    // merge would erase a real gap.
    const distinct = [
      ['React', 'React Native'],
      ['SQL', 'PostgreSQL'],
      ['Java', 'JavaScript'],
      ['Machine Learning', 'Deep Learning'],
      ['AWS', 'Azure'],
    ];

    for (const [left, right] of distinct) {
      assert.notEqual(skillKey(left), skillKey(right), `"${left}" and "${right}" merged`);
    }
  });

  it('returns an empty key for a name with no usable content', () => {
    for (const value of ['', '   ', '---', null, undefined]) {
      assert.equal(skillKey(value), '');
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
