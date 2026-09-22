import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rankRoles, scoreRoleMatch } from '../src/domain/careers/matchRole.js';
import {
  CAREER_ROLES,
  CATALOGUE_SOURCE,
  CATALOGUE_VERSION,
  ROLE_CATEGORIES,
  findRole,
} from '../src/domain/careers/roleCatalogue.js';
import {
  DIMENSION_WEIGHTS,
  MINIMUM_RECOMMENDABLE_SCORE,
  STRENGTH_CREDIT,
  bandFor,
} from '../src/domain/careers/scoring.js';
import { skillKey } from '../src/domain/skills/skillKey.js';

/**
 * Career matching, as a pure function.
 *
 * A student is going to make a decision on these numbers, so the tests that
 * matter are about restraint and explainability: that the score is
 * reproducible, that nothing is claimed without a reason attached, and that
 * no dimension can exclude someone for the wrong reasons.
 */

/**
 * Builds a CareerTwin-shaped object with the given skills.
 *
 * Keys come from the real `skillKey`, as the CareerTwin builder's do — a
 * hand-rolled key here would test the matcher against data no twin produces.
 */
function twinWith(skills, extras = {}) {
  return {
    skills: skills.map(({ name, key, strength = 'claimed', sources = 1 }) => ({
      key: key ?? skillKey(name),
      name,
      strength,
      sourceCount: sources,
      evidence: [{ source: 'self_declared', strength, detail: `You listed ${name}.`, reference: null }],
    })),
    interests: [],
    targetRoles: [],
    academic: null,
    ...extras,
  };
}

const BACKEND = findRole('backend-developer');

// ------------------------------------------------------------- the weights

describe('scoring configuration', () => {
  it('has weights that sum to 1', () => {
    const total = Object.values(DIMENSION_WEIGHTS).reduce((sum, weight) => sum + weight, 0);

    // Asserted at import time too — a typo here would silently rescale every
    // recommendation in the product without looking like a bug.
    assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`);
  });

  it('weights skill coverage above interest and background', () => {
    const skills = DIMENSION_WEIGHTS.requiredSkills + DIMENSION_WEIGHTS.preferredSkills;
    const soft = DIMENSION_WEIGHTS.interestAlignment + DIMENSION_WEIGHTS.backgroundAlignment;

    // A motivated student from an unrelated degree must not be scored out of
    // a career by the two weakest signals.
    assert.ok(skills > soft * 3, 'soft signals carry too much weight');
  });

  it('rewards evidence above assertion, but does not score assertion at zero', () => {
    assert.ok(STRENGTH_CREDIT.supported > STRENGTH_CREDIT.claimed);
    assert.ok(STRENGTH_CREDIT.verified > STRENGTH_CREDIT.supported);
    assert.ok(STRENGTH_CREDIT.claimed > 0, 'a claimed skill counts for nothing');
  });

  it('bands every possible score', () => {
    for (const score of [0, 1, 24, 25, 49, 50, 74, 75, 100]) {
      assert.ok(bandFor(score)?.label, `no band for ${score}`);
    }
  });
});

// ------------------------------------------------------------- the catalogue

describe('role catalogue', () => {
  it('states its source and makes no market claims', () => {
    assert.equal(CATALOGUE_SOURCE.type, 'curated');

    // No salary, demand or hiring numbers anywhere: Nexora has no verified
    // source for them, and a student deciding on an invented figure is the
    // most damaging kind of fabrication.
    const serialised = JSON.stringify(CAREER_ROLES).toLowerCase();
    for (const forbidden of ['salary', 'lpa', 'openings', 'demand', 'growthrate', 'hiringrate']) {
      assert.ok(!serialised.includes(forbidden), `catalogue mentions "${forbidden}"`);
    }
  });

  it('gives every role unique ids and non-empty skill lists', () => {
    const ids = CAREER_ROLES.map((role) => role.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate role id');

    for (const role of CAREER_ROLES) {
      assert.ok(role.requiredSkills.length > 0, `${role.id} has no required skills`);
      assert.ok(role.summary?.length > 0, `${role.id} has no summary`);
      // A long required list makes every student look unqualified for
      // everything, which is a scoring failure rather than a strictness.
      assert.ok(role.requiredSkills.length <= 5, `${role.id} requires too much`);
    }
  });

  it('keeps role contracts internally consistent and versioned', () => {
    const categories = new Set(Object.values(ROLE_CATEGORIES));

    assert.equal(CATALOGUE_SOURCE.version, CATALOGUE_VERSION);

    for (const role of CAREER_ROLES) {
      assert.ok(categories.has(role.category), `${role.id} has an unknown category`);

      const required = new Set(role.requiredSkills.map(skillKey));
      const preferred = new Set(role.preferredSkills.map(skillKey));
      const related = new Set(role.relatedTechnologies.map(skillKey));

      assert.equal(required.size, role.requiredSkills.length, `${role.id} repeats a required skill`);
      assert.equal(preferred.size, role.preferredSkills.length, `${role.id} repeats a preferred skill`);
      assert.equal(related.size, role.relatedTechnologies.length, `${role.id} repeats a related technology`);

      for (const key of required) {
        assert.ok(!preferred.has(key), `${role.id} scores ${key} as required and preferred`);
        assert.ok(!related.has(key), `${role.id} scores ${key} as required and related`);
      }
      for (const key of preferred) {
        assert.ok(!related.has(key), `${role.id} scores ${key} as preferred and related`);
      }
    }
  });
});

// ---------------------------------------------------------------- matching

describe('scoreRoleMatch', () => {
  it('scores a well-matched student highly and explains why', () => {
    const twin = twinWith(
      [
        { name: 'JavaScript', strength: 'supported' },
        { name: 'Node.js', strength: 'supported' },
        { name: 'REST APIs', strength: 'claimed' },
        { name: 'SQL', strength: 'claimed' },
        { name: 'Express.js', strength: 'supported' },
        { name: 'MongoDB', strength: 'supported' },
      ],
      { targetRoles: [{ title: 'Backend Developer', origin: 'student' }] },
    );

    const match = scoreRoleMatch(twin, BACKEND);

    assert.ok(match.score >= 75, `expected a strong match, got ${match.score}`);
    assert.equal(match.band, 'strong');
    assert.deepEqual(match.missingRequired, []);
    assert.equal(match.matchedRequired.length, 4);
    assert.ok(match.explanation.length > 0);
  });

  it('scores a student with none of the skills at the bottom', () => {
    const twin = twinWith([{ name: 'Figma' }, { name: 'UI Design' }]);

    const match = scoreRoleMatch(twin, BACKEND);

    assert.ok(match.score < MINIMUM_RECOMMENDABLE_SCORE, `got ${match.score}`);
    assert.deepEqual(match.matchedRequired, []);
    assert.equal(match.missingRequired.length, 4);
  });

  it('names both what matched and what is missing', () => {
    const twin = twinWith([{ name: 'JavaScript' }, { name: 'Node.js' }]);

    const match = scoreRoleMatch(twin, BACKEND);

    // "71% match" is worthless unless a student can see which skills they
    // have and which they do not.
    assert.deepEqual(
      match.matchedRequired.map((skill) => skill.name),
      ['JavaScript', 'Node.js'],
    );
    assert.deepEqual(match.missingRequired, ['REST APIs', 'SQL']);
  });

  it('matches a skill across a difference in spelling', () => {
    const twin = twinWith([{ name: 'NodeJS' }, { name: 'js' }]);

    const match = scoreRoleMatch(twin, BACKEND);

    // The catalogue says "Node.js" and "JavaScript"; the student said
    // otherwise. Neither list should have to be spelled a particular way.
    const matched = match.matchedRequired.map((skill) => skill.name);
    assert.ok(matched.includes('Node.js'));
    assert.ok(matched.includes('JavaScript'));
  });

  it('scores evidenced skills above merely claimed ones', () => {
    const skills = [{ name: 'JavaScript' }, { name: 'Node.js' }, { name: 'REST APIs' }, { name: 'SQL' }];

    const claimed = scoreRoleMatch(twinWith(skills), BACKEND);
    const supported = scoreRoleMatch(
      twinWith(skills.map((skill) => ({ ...skill, strength: 'supported' }))),
      BACKEND,
    );

    // The product's premise: showing beats saying.
    assert.ok(supported.score > claimed.score, 'evidence made no difference');
  });

  it('rewards a stated target role', () => {
    const skills = [{ name: 'JavaScript' }, { name: 'Node.js' }];

    const neutral = scoreRoleMatch(twinWith(skills), BACKEND);
    const aimed = scoreRoleMatch(
      twinWith(skills, { targetRoles: [{ title: 'Backend Engineer', origin: 'student' }] }),
      BACKEND,
    );

    assert.ok(aimed.score > neutral.score);
  });

  it('does not treat a shared generic word as alignment', () => {
    const skills = [{ name: 'JavaScript' }];

    const neutral = scoreRoleMatch(twinWith(skills), BACKEND);
    const other = scoreRoleMatch(
      twinWith(skills, { targetRoles: [{ title: 'Frontend Developer', origin: 'student' }] }),
      BACKEND,
    );

    // Both titles contain "Developer". Counting that would make every
    // engineering role align with every engineering interest.
    assert.equal(other.score, neutral.score);
  });

  it('ignores a role Nexora suggested when reading the student\'s intent', () => {
    const skills = [{ name: 'JavaScript' }];

    const neutral = scoreRoleMatch(twinWith(skills), BACKEND);
    const suggested = scoreRoleMatch(
      twinWith(skills, { targetRoles: [{ title: 'Backend Developer', origin: 'nexora' }] }),
      BACKEND,
    );

    // Otherwise a suggestion feeds back in as though the student had chosen
    // it, and the system agrees with itself more each time it runs.
    assert.equal(suggested.score, neutral.score);
  });

  it('treats an unknown academic background as neutral, not negative', () => {
    const skills = [{ name: 'JavaScript' }, { name: 'Node.js' }];

    const unknown = scoreRoleMatch(twinWith(skills), BACKEND);
    const unrelated = scoreRoleMatch(
      twinWith(skills, { academic: { branch: 'Civil Engineering' } }),
      BACKEND,
    );
    const related = scoreRoleMatch(
      twinWith(skills, { academic: { branch: 'Computer Science and Engineering' } }),
      BACKEND,
    );

    // Not filling in a branch is not a statement about fitness. Scoring
    // silence as a negative would penalise an incomplete profile.
    assert.ok(unknown.score > unrelated.score, 'silence was treated as a bad background');
    assert.ok(related.score > unknown.score);
  });

  it('never excludes a student for their background alone', () => {
    const strong = [
      { name: 'JavaScript', strength: 'supported' },
      { name: 'Node.js', strength: 'supported' },
      { name: 'REST APIs', strength: 'supported' },
      { name: 'SQL', strength: 'supported' },
    ];

    const match = scoreRoleMatch(
      twinWith(strong, { academic: { branch: 'Mechanical Engineering' } }),
      BACKEND,
    );

    // People enter these roles from everywhere. A capable student from an
    // unrelated degree must still be recommendable.
    assert.ok(match.score >= 50, `a skilled career-changer scored only ${match.score}`);
  });

  it('exposes the per-dimension breakdown', () => {
    const match = scoreRoleMatch(twinWith([{ name: 'JavaScript' }]), BACKEND);

    // A student who disagrees with their score should be able to see which
    // part of it they disagree with.
    for (const name of Object.keys(DIMENSION_WEIGHTS)) {
      assert.ok(match.dimensions[name], `no breakdown for ${name}`);
      assert.equal(match.dimensions[name].weight, DIMENSION_WEIGHTS[name]);
    }
  });

  it('attaches the concrete evidence behind a match', () => {
    const twin = {
      skills: [
        {
          key: 'react',
          name: 'React',
          strength: 'supported',
          sourceCount: 1,
          evidence: [
            {
              source: 'project',
              strength: 'supported',
              detail: 'Used in your project "Nexora".',
              reference: 'Nexora',
            },
          ],
        },
      ],
      interests: [],
      targetRoles: [],
      academic: null,
    };

    const match = scoreRoleMatch(twin, findRole('frontend-developer'));

    assert.equal(match.evidence.length, 1);
    assert.match(match.evidence[0].detail, /Nexora/);
  });

  it('counts one project behind three skills as one piece of evidence', () => {
    const project = {
      source: 'project',
      strength: 'supported',
      detail: 'Used in your project "Nexora".',
      reference: 'Nexora',
    };

    const twin = {
      skills: ['JavaScript', 'Node.js', 'SQL'].map((name) => ({
        key: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        name,
        strength: 'supported',
        sourceCount: 1,
        evidence: [project],
      })),
      interests: [],
      targetRoles: [],
      academic: null,
    };

    const match = scoreRoleMatch(twin, BACKEND);

    // Listing it three times would overstate how much the student has done.
    assert.equal(match.evidence.length, 1);
    assert.deepEqual(match.evidence[0].skills, ['JavaScript', 'Node.js', 'SQL']);
  });

  it('is deterministic', () => {
    const twin = twinWith([
      { name: 'JavaScript', strength: 'supported' },
      { name: 'Node.js' },
    ]);

    assert.deepEqual(scoreRoleMatch(twin, BACKEND), scoreRoleMatch(twin, BACKEND));
  });

  it('keeps every score within 0 and 100', () => {
    const everything = twinWith(
      CAREER_ROLES.flatMap((role) => [...role.requiredSkills, ...role.preferredSkills]).map(
        (name) => ({ name, strength: 'verified' }),
      ),
      {
        academic: { branch: 'Computer Science and Engineering' },
        targetRoles: [{ title: 'Backend Developer', origin: 'student' }],
      },
    );

    for (const role of CAREER_ROLES) {
      const match = scoreRoleMatch(everything, role);
      assert.ok(match.score >= 0 && match.score <= 100, `${role.id} scored ${match.score}`);
    }

    assert.equal(scoreRoleMatch(twinWith([]), BACKEND).score >= 0, true);
  });
});

// ----------------------------------------------------------------- ranking

describe('rankRoles', () => {
  const backendStudent = twinWith([
    { name: 'JavaScript', strength: 'supported' },
    { name: 'Node.js', strength: 'supported' },
    { name: 'SQL' },
    { name: 'REST APIs' },
    { name: 'MongoDB' },
  ]);

  it('puts the best-fitting role first', () => {
    const { matches } = rankRoles(backendStudent);

    assert.equal(matches[0].roleId, 'backend-developer');
  });

  it('filters out matches too weak to be advice', () => {
    const { matches } = rankRoles(twinWith([{ name: 'Figma' }]));

    for (const match of matches) {
      assert.ok(match.score >= MINIMUM_RECOMMENDABLE_SCORE);
    }
  });

  it('returns weak matches when explicitly asked', () => {
    const all = rankRoles(twinWith([{ name: 'Figma' }]), {
      includeBelowThreshold: true,
      limit: 50,
    });

    assert.equal(all.matches.length, CAREER_ROLES.length);
  });

  it('honours the limit', () => {
    assert.equal(rankRoles(backendStudent, { limit: 2 }).matches.length, 2);
  });

  it('breaks ties stably, so the list does not reorder itself', () => {
    const twin = twinWith([{ name: 'Git' }]);

    const first = rankRoles(twin, { includeBelowThreshold: true, limit: 50 });
    const second = rankRoles(twin, { includeBelowThreshold: true, limit: 50 });

    assert.deepEqual(
      first.matches.map((match) => match.roleId),
      second.matches.map((match) => match.roleId),
    );
  });

  it('reports the catalogue and weights version it used', () => {
    const { catalogue } = rankRoles(backendStudent);

    // A stored or shared recommendation must be recognisable as computed
    // against an older list rather than silently compared across versions.
    assert.ok(Number.isInteger(catalogue.version));
    assert.ok(Number.isInteger(catalogue.weightsVersion));
    assert.equal(catalogue.source, 'curated');
  });

  it('recommends nothing to a student with no skills', () => {
    const { matches } = rankRoles(twinWith([]));

    assert.deepEqual(matches, []);
  });
});
