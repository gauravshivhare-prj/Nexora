import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CAREER_ROLES } from '../src/domain/careers/roleCatalogue.js';
import {
  OPPORTUNITY_CATALOGUE,
  matchOpportunities,
} from '../src/domain/opportunities/opportunityCatalogue.js';
import {
  OPPORTUNITY_CATALOGUE_VERSION,
  OPPORTUNITY_CONTRACT_VERSION,
  OPPORTUNITY_ELIGIBILITY_TYPES,
  OPPORTUNITY_REQUIRED_FIELDS,
  OPPORTUNITY_SOURCE_FIELDS,
  OPPORTUNITY_SOURCE_TYPES,
} from '../src/domain/opportunities/opportunityContract.js';
import { skillKey, knownSkillNames } from '../src/domain/skills/skillKey.js';

function twinWith(skills, strength = 'verified') {
  return {
    skills: skills.map((name) => ({
      name,
      key: skillKey(name),
      strength,
    })),
  };
}

describe('TASK A20 — Opportunity Matching Validation Suite', () => {
  // =========================================================================
  // 1. Taxonomy & Catalogue Grounding Audit
  // =========================================================================
  describe('1. Taxonomy & Catalogue Grounding Audit', () => {
    it('verifies all skills in catalogue are grounded in canonical skill taxonomy', () => {
      for (const opp of OPPORTUNITY_CATALOGUE) {
        assert.ok(Array.isArray(opp.requiredSkills) && opp.requiredSkills.length > 0);
        for (const skillName of opp.requiredSkills) {
          const key = skillKey(skillName);
          assert.ok(key && key.length > 0, `Skill ${skillName} in ${opp.id} must have a valid key`);
        }
      }
    });

    it('verifies all targetRoleIds exist in versioned career role catalogue', () => {
      const knownRoleIds = new Set(CAREER_ROLES.map((r) => r.id));
      for (const opp of OPPORTUNITY_CATALOGUE) {
        assert.ok(Array.isArray(opp.targetRoleIds) && opp.targetRoleIds.length > 0);
        for (const roleId of opp.targetRoleIds) {
          assert.ok(knownRoleIds.has(roleId), `RoleId ${roleId} in ${opp.id} not in CAREER_ROLES`);
        }
      }
    });

    it('resolves skill aliases at matching boundary', () => {
      // ecmascript -> JavaScript, nodejs -> Node.js
      const twin = twinWith(['ecmascript', 'nodejs'], 'verified');
      const profile = { career: { targetRole: 'Backend Developer' } };

      const matched = matchOpportunities(twin, profile);
      assert.equal(matched.length, 1);
      assert.equal(matched[0].id, 'curated_internal:backend-apprenticeship');
    });
  });

  // =========================================================================
  // 2. Role & Skill Matching Invariants
  // =========================================================================
  describe('2. Role & Skill Matching Invariants', () => {
    const backendProfile = { career: { targetRole: 'Backend Developer' } };

    it('matches when all required skills are verified and target role matches', () => {
      const twin = twinWith(['JavaScript', 'Node.js'], 'verified');
      const matched = matchOpportunities(twin, backendProfile);

      assert.equal(matched.length, 1);
      assert.equal(matched[0].id, 'curated_internal:backend-apprenticeship');
      assert.match(matched[0].explanation, /verified evidence/i);
    });

    it('strictly requires VERIFIED evidence; rejects claimed or supported skills', () => {
      const claimedTwin = twinWith(['JavaScript', 'Node.js'], 'claimed');
      const supportedTwin = twinWith(['JavaScript', 'Node.js'], 'supported');

      assert.deepEqual(matchOpportunities(claimedTwin, backendProfile), []);
      assert.deepEqual(matchOpportunities(supportedTwin, backendProfile), []);
    });

    it('resolves targetRole case-insensitively and by either ID or title', () => {
      const twin = twinWith(['JavaScript', 'Node.js'], 'verified');

      const byTitle = matchOpportunities(twin, { career: { targetRole: 'Backend Developer' } });
      const byLowerTitle = matchOpportunities(twin, { career: { targetRole: 'backend developer' } });
      const byId = matchOpportunities(twin, { career: { targetRole: 'backend-developer' } });
      const byTopLevel = matchOpportunities(twin, { targetRole: 'backend-developer' });

      assert.equal(byTitle.length, 1);
      assert.equal(byLowerTitle.length, 1);
      assert.equal(byId.length, 1);
      assert.equal(byTopLevel.length, 1);
    });

    it('rejects candidate if target role does not match, even with full verified skills', () => {
      const twin = twinWith(['JavaScript', 'Node.js', 'HTML', 'CSS'], 'verified');
      const dataProfile = { career: { targetRole: 'Data Scientist' } };

      assert.deepEqual(matchOpportunities(twin, dataProfile), []);
    });
  });

  // =========================================================================
  // 3. Query & Metadata Filtering
  // =========================================================================
  describe('3. Query & Metadata Filtering', () => {
    it('filters opportunities by roleId accurately', () => {
      const twin = twinWith(['JavaScript', 'Node.js', 'HTML', 'CSS'], 'verified');
      const fullstackProfile = { career: { targetRole: 'Backend Developer' } };

      const backendOnly = matchOpportunities(twin, fullstackProfile, OPPORTUNITY_CATALOGUE, {
        roleId: 'backend-developer',
      });
      assert.equal(backendOnly.length, 1);
      assert.equal(backendOnly[0].id, 'curated_internal:backend-apprenticeship');

      const frontendFilter = matchOpportunities(twin, fullstackProfile, OPPORTUNITY_CATALOGUE, {
        roleId: 'frontend-developer',
      });
      assert.equal(frontendFilter.length, 0);
    });

    it('filters opportunities by required skill accurately', () => {
      const twin = twinWith(['JavaScript', 'Node.js'], 'verified');
      const backendProfile = { career: { targetRole: 'Backend Developer' } };

      const jsMatches = matchOpportunities(twin, backendProfile, OPPORTUNITY_CATALOGUE, {
        skill: 'JavaScript',
      });
      assert.equal(jsMatches.length, 1);

      const htmlMatches = matchOpportunities(twin, backendProfile, OPPORTUNITY_CATALOGUE, {
        skill: 'HTML',
      });
      assert.equal(htmlMatches.length, 0);
    });
  });

  // =========================================================================
  // 4. Source Metadata & Non-Claim of Live Coverage
  // =========================================================================
  describe('4. Source Metadata & Non-Claim of Live Coverage', () => {
    it('strictly satisfies all contract fields and declares curated_internal source', () => {
      for (const opp of OPPORTUNITY_CATALOGUE) {
        for (const field of OPPORTUNITY_REQUIRED_FIELDS) {
          assert.ok(field in opp, `Missing required field ${field} in ${opp.id}`);
        }
        for (const sField of OPPORTUNITY_SOURCE_FIELDS) {
          assert.ok(sField in opp.source, `Missing source field ${sField} in ${opp.id}`);
        }

        assert.equal(opp.source.type, OPPORTUNITY_SOURCE_TYPES.CURATED_INTERNAL);
        assert.equal(opp.source.version, OPPORTUNITY_CATALOGUE_VERSION);
        assert.match(opp.source.asOf, /^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('forbids live external claims, scraping, or AI scoring in opportunity contracts', () => {
      const eligibilityTypes = Object.values(OPPORTUNITY_ELIGIBILITY_TYPES);
      assert.deepEqual(eligibilityTypes, ['verified_skills', 'target_role']);

      for (const type of eligibilityTypes) {
        assert.ok(!/live|external|scrape|ai|score|ranking/i.test(type));
      }
    });

    it('rejects catalogues with duplicate IDs or stale source versions', () => {
      const dup = [OPPORTUNITY_CATALOGUE[0], { ...OPPORTUNITY_CATALOGUE[0] }];
      assert.throws(() => matchOpportunities({}, {}, dup), /duplicate/i);

      const stale = [{
        ...OPPORTUNITY_CATALOGUE[0],
        source: { ...OPPORTUNITY_CATALOGUE[0].source, version: 999 },
      }];
      const twin = twinWith(['JavaScript', 'Node.js'], 'verified');
      assert.deepEqual(matchOpportunities(twin, { career: { targetRole: 'Backend Developer' } }, stale), []);
    });
  });
});
