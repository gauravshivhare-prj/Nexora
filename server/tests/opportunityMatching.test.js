import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  OPPORTUNITY_CATALOGUE,
  matchOpportunities,
  nearMissOpportunities,
} from '../src/domain/opportunities/opportunityCatalogue.js';
import { CAREER_ROLES } from '../src/domain/careers/roleCatalogue.js';
import { skillKey } from '../src/domain/skills/skillKey.js';

/**
 * Task 18 — Opportunity Matching & Eligibility Engine Reconstruction
 *
 * Tests:
 * 1. Expanded catalogue (10 entries, 4 career paths)
 * 2. matchOpportunities: full eligibility, determinism, matchScore
 * 3. nearMissOpportunities: partial match, gapToEligibility, minSkillFraction
 * 4. Edge cases: empty inputs, invalid catalogue, filters
 */

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function twinWith(skills, strength = 'verified') {
  return {
    skills: skills.map((name) => ({
      name,
      key: skillKey(name),
      strength,
    })),
  };
}

const backendProfile = { career: { targetRole: 'backend-developer' } };
const frontendProfile = { career: { targetRole: 'frontend-developer' } };
const fullstackProfile = { career: { targetRole: 'full-stack-developer' } };
const devopsProfile = { career: { targetRole: 'devops-engineer' } };

// ─── 1. Catalogue Integrity ────────────────────────────────────────────────

describe('Task 18 — catalogue integrity', () => {
  it('contains 10 entries in the expanded catalogue', () => {
    assert.equal(OPPORTUNITY_CATALOGUE.length, 10);
  });

  it('covers all 4 career role paths', () => {
    const coveredRoles = new Set(OPPORTUNITY_CATALOGUE.flatMap((o) => o.targetRoleIds));
    assert.ok(coveredRoles.has('backend-developer'));
    assert.ok(coveredRoles.has('frontend-developer'));
    assert.ok(coveredRoles.has('full-stack-developer'));
    assert.ok(coveredRoles.has('devops-engineer'));
  });

  it('all target role IDs are in the CAREER_ROLES catalogue', () => {
    const knownIds = new Set(CAREER_ROLES.map((r) => r.id));
    for (const opp of OPPORTUNITY_CATALOGUE) {
      for (const roleId of opp.targetRoleIds) {
        assert.ok(knownIds.has(roleId), `Unknown roleId: ${roleId} in ${opp.id}`);
      }
    }
  });

  it('all IDs are unique and stable', () => {
    const ids = OPPORTUNITY_CATALOGUE.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, 'Duplicate IDs found');
    for (const id of ids) {
      assert.match(id, /^curated_internal:/, 'ID must have curated_internal: prefix');
    }
  });

  it('all required skills have valid canonical keys', () => {
    for (const opp of OPPORTUNITY_CATALOGUE) {
      for (const skillName of opp.requiredSkills) {
        const key = skillKey(skillName);
        assert.ok(key && key.length > 0, `Skill '${skillName}' in ${opp.id} has no key`);
      }
    }
  });

  it('each entry has a minSkillFraction between 0 and 1', () => {
    for (const opp of OPPORTUNITY_CATALOGUE) {
      const frac = opp.minSkillFraction;
      assert.ok(typeof frac === 'number' && frac > 0 && frac <= 1,
        `Invalid minSkillFraction in ${opp.id}: ${frac}`);
    }
  });
});

// ─── 2. matchOpportunities — full eligibility ─────────────────────────────

describe('Task 18 — matchOpportunities', () => {
  it('matches backend-apprenticeship for verified JS + Node.js + backend role', () => {
    const result = matchOpportunities(
      twinWith(['JavaScript', 'Node.js']),
      backendProfile,
    );
    const ids = result.map((r) => r.id);
    assert.ok(ids.includes('curated_internal:backend-apprenticeship'));
  });

  it('includes matchScore = 100 for fully-matched opportunities', () => {
    const result = matchOpportunities(
      twinWith(['JavaScript', 'Node.js']),
      backendProfile,
    );
    const opp = result.find((r) => r.id === 'curated_internal:backend-apprenticeship');
    assert.ok(opp, 'backend-apprenticeship must be in results');
    assert.equal(opp.matchScore, 100);
  });

  it('includes empty gapToEligibility for fully-matched opportunities', () => {
    const result = matchOpportunities(
      twinWith(['JavaScript', 'Node.js']),
      backendProfile,
    );
    const opp = result.find((r) => r.id === 'curated_internal:backend-apprenticeship');
    assert.deepEqual(opp.gapToEligibility, []);
  });

  it('matches frontend-apprenticeship for HTML + CSS + JavaScript + frontend role', () => {
    const result = matchOpportunities(
      twinWith(['HTML', 'CSS', 'JavaScript']),
      frontendProfile,
    );
    const ids = result.map((r) => r.id);
    assert.ok(ids.includes('curated_internal:frontend-apprenticeship'));
  });

  it('matches devops-pipeline-practicum for Docker + Git + Linux + devops role', () => {
    const result = matchOpportunities(
      twinWith(['Docker', 'Git', 'Linux']),
      devopsProfile,
    );
    const ids = result.map((r) => r.id);
    assert.ok(ids.includes('curated_internal:devops-pipeline-practicum'));
  });

  it('matches git-collaboration-challenge for any role with verified Git', () => {
    for (const profile of [backendProfile, frontendProfile, fullstackProfile, devopsProfile]) {
      const result = matchOpportunities(twinWith(['Git']), profile);
      const ids = result.map((r) => r.id);
      assert.ok(ids.includes('curated_internal:git-collaboration-challenge'),
        `Expected git challenge for ${profile.career.targetRole}`);
    }
  });

  it('does not match when target role is wrong even with all skills verified', () => {
    // Backend student with all frontend skills
    const result = matchOpportunities(
      twinWith(['HTML', 'CSS', 'JavaScript']),
      backendProfile, // wrong role!
    );
    const ids = result.map((r) => r.id);
    assert.equal(ids.includes('curated_internal:frontend-apprenticeship'), false);
  });

  it('does not match when a required skill is only claimed (not verified)', () => {
    const result = matchOpportunities(
      twinWith(['JavaScript', 'Node.js'], 'claimed'),
      backendProfile,
    );
    const ids = result.map((r) => r.id);
    assert.equal(ids.includes('curated_internal:backend-apprenticeship'), false);
  });

  it('is deterministic — same input always gives same output', () => {
    const twin = twinWith(['JavaScript', 'Node.js']);
    const first = matchOpportunities(twin, backendProfile);
    const second = matchOpportunities(twin, backendProfile);
    assert.deepEqual(first, second);
  });
});

// ─── 3. nearMissOpportunities ─────────────────────────────────────────────

describe('Task 18 — nearMissOpportunities', () => {
  it('returns near-miss when student has 50%+ required skills but not all', () => {
    // backend-apprenticeship needs JS + Node.js. Student has only JS → 50% → near-miss
    const result = nearMissOpportunities(
      twinWith(['JavaScript']),
      backendProfile,
    );
    const ids = result.map((r) => r.id);
    assert.ok(ids.includes('curated_internal:backend-apprenticeship'),
      'backend-apprenticeship must appear as near-miss');
  });

  it('does not include fully-matched opportunities in near-miss results', () => {
    const result = nearMissOpportunities(
      twinWith(['JavaScript', 'Node.js']),
      backendProfile,
    );
    const ids = result.map((r) => r.id);
    // Fully matched, must NOT appear as near-miss
    assert.equal(ids.includes('curated_internal:backend-apprenticeship'), false);
  });

  it('near-miss includes gapToEligibility with specific missing skills', () => {
    const result = nearMissOpportunities(
      twinWith(['JavaScript']), // Node.js missing
      backendProfile,
    );
    const opp = result.find((r) => r.id === 'curated_internal:backend-apprenticeship');
    assert.ok(opp, 'backend-apprenticeship near-miss expected');
    assert.ok(Array.isArray(opp.gapToEligibility));
    assert.ok(opp.gapToEligibility.length > 0);

    const gap = opp.gapToEligibility[0];
    assert.ok(gap.skill, 'gap must have skill name');
    assert.ok(gap.action && gap.action.length > 0, 'gap must have action text');
  });

  it('near-miss matchScore correctly reflects partial coverage', () => {
    // 1 of 2 required skills verified → 50%
    const result = nearMissOpportunities(
      twinWith(['JavaScript']),
      backendProfile,
    );
    const opp = result.find((r) => r.id === 'curated_internal:backend-apprenticeship');
    assert.ok(opp);
    assert.equal(opp.matchScore, 50);
  });

  it('near-miss explanation mentions how many skills are verified and missing', () => {
    const result = nearMissOpportunities(
      twinWith(['JavaScript']),
      backendProfile,
    );
    const opp = result.find((r) => r.id === 'curated_internal:backend-apprenticeship');
    assert.ok(opp.explanation);
    assert.match(opp.explanation, /1 of 2/);
    assert.match(opp.explanation, /remaining 1/);
  });

  it('excludes near-miss when fraction is below minSkillFraction', () => {
    // backend-api-design needs JS + Node.js + REST APIs (minSkillFraction=0.67).
    // Student has only 1 of 3 (33%) → below threshold
    const result = nearMissOpportunities(
      twinWith(['JavaScript']),
      backendProfile,
    );
    const ids = result.map((r) => r.id);
    assert.equal(ids.includes('curated_internal:backend-api-design'), false);
  });

  it('returns empty for null inputs without throwing', () => {
    const result = nearMissOpportunities(null, null);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('is deterministic — same input always gives same near-miss result', () => {
    const twin = twinWith(['JavaScript']);
    const first = nearMissOpportunities(twin, backendProfile);
    const second = nearMissOpportunities(twin, backendProfile);
    assert.deepEqual(first, second);
  });
});

// ─── 4. Filters ───────────────────────────────────────────────────────────────

describe('Task 18 — opportunity filters', () => {
  it('filters matchOpportunities by roleId', () => {
    const twin = twinWith(['JavaScript', 'Node.js', 'React', 'CSS', 'HTML', 'Docker', 'Git']);
    const result = matchOpportunities(twin, fullstackProfile, OPPORTUNITY_CATALOGUE, {
      roleId: 'full-stack-developer',
    });
    for (const opp of result) {
      assert.ok(opp.targetRoleIds.includes('full-stack-developer'),
        `${opp.id} must target full-stack-developer`);
    }
  });

  it('filters nearMissOpportunities by roleId', () => {
    const twin = twinWith(['JavaScript']); // Node.js missing
    const result = nearMissOpportunities(twin, fullstackProfile, OPPORTUNITY_CATALOGUE, {
      roleId: 'full-stack-developer',
    });
    for (const opp of result) {
      assert.ok(opp.targetRoleIds.includes('full-stack-developer'),
        `Near-miss ${opp.id} must target full-stack-developer`);
    }
  });

  it('filters by skill key, showing only opportunities requiring that skill', () => {
    const twin = twinWith(['Git']);
    const result = matchOpportunities(twin, backendProfile, OPPORTUNITY_CATALOGUE, {
      skill: 'Git',
    });
    for (const opp of result) {
      assert.ok(
        opp.requiredSkills.some((s) => skillKey(s) === skillKey('Git')),
        `${opp.id} must require Git`,
      );
    }
  });
});

// ─── 5. Edge Cases ───────────────────────────────────────────────────────────

describe('Task 18 — edge cases', () => {
  it('rejects a catalogue with duplicate IDs', () => {
    const dupe = [OPPORTUNITY_CATALOGUE[0], { ...OPPORTUNITY_CATALOGUE[0] }];
    assert.throws(() => matchOpportunities({}, {}, dupe), /duplicate|missing stable id/);
  });

  it('handles twin with no skills (empty set)', () => {
    const result = matchOpportunities({ skills: [] }, backendProfile);
    assert.deepEqual(result, []);
  });

  it('handles profile with no target role (null)', () => {
    const result = matchOpportunities(twinWith(['JavaScript', 'Node.js']), null);
    // git-collaboration-challenge has no target_role restriction if
    // all eligibility rules pass — but target_role rule will fail with null
    assert.deepEqual(result, []);
  });
});
