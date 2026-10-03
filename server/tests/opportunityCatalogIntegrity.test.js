import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  OPPORTUNITY_CATALOGUE,
  matchOpportunities,
  nearMissOpportunities,
} from '../src/domain/opportunities/opportunityCatalogue.js';
import {
  validateOpportunityCatalogue,
  auditCatalogueFreshness,
} from '../src/domain/opportunities/catalogueIntegrity.js';
import { CAREER_ROLES } from '../src/domain/careers/roleCatalogue.js';
import { skillKey } from '../src/domain/skills/skillKey.js';

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
const fullstackProfile = { career: { targetRole: 'full-stack-developer' } };

describe('Task 25 & 26 — Opportunity Catalogue Integrity & Intelligence Matching', () => {
  // ─── 1. Canonical Catalogue Schema & Grounding Conformance ─────────────────
  describe('1. Catalogue Schema & Grounding Conformance', () => {
    it('validates the canonical OPPORTUNITY_CATALOGUE without errors', () => {
      const result = validateOpportunityCatalogue(OPPORTUNITY_CATALOGUE);
      assert.equal(result.valid, true);
      assert.equal(result.count, 10);
      assert.deepEqual(result.errors, []);
    });

    it('each catalogue item declares addedDate, expiresAt, and isActive', () => {
      for (const opp of OPPORTUNITY_CATALOGUE) {
        assert.ok(opp.addedDate, `${opp.id} must declare addedDate`);
        assert.match(opp.addedDate, /^\d{4}-\d{2}-\d{2}$/, `${opp.id} addedDate must be ISO YYYY-MM-DD`);
        assert.ok(opp.expiresAt, `${opp.id} must declare expiresAt`);
        assert.match(opp.expiresAt, /^\d{4}-\d{2}-\d{2}$/, `${opp.id} expiresAt must be ISO YYYY-MM-DD`);
        assert.ok(opp.expiresAt > opp.addedDate, `${opp.id} expiresAt must be after addedDate`);
        assert.equal(opp.isActive, true, `${opp.id} isActive must be true`);
      }
    });

    it('each required skill is grounded in canonical skill taxonomy', () => {
      for (const opp of OPPORTUNITY_CATALOGUE) {
        for (const skill of opp.requiredSkills) {
          const key = skillKey(skill);
          assert.ok(key && key.length > 0, `Skill '${skill}' in ${opp.id} must have a valid key`);
        }
      }
    });

    it('each target role exists in CAREER_ROLES catalogue', () => {
      const knownRoleIds = new Set(CAREER_ROLES.map((r) => r.id));
      for (const opp of OPPORTUNITY_CATALOGUE) {
        for (const roleId of opp.targetRoleIds) {
          assert.ok(knownRoleIds.has(roleId), `Unknown roleId: ${roleId} in ${opp.id}`);
        }
      }
    });
  });

  // ─── 2. Negative Schema Validation ─────────────────────────────────────────
  describe('2. Negative Schema Validation', () => {
    it('throws when catalogue is not an array', () => {
      assert.throws(() => validateOpportunityCatalogue(null), /must be an array/i);
      assert.throws(() => validateOpportunityCatalogue('not-an-array'), /must be an array/i);
    });

    it('throws when an item is missing required fields', () => {
      const invalid = [
        {
          id: 'curated_internal:missing-title',
          summary: 'Missing title',
          source: OPPORTUNITY_CATALOGUE[0].source,
          eligibility: OPPORTUNITY_CATALOGUE[0].eligibility,
          requiredSkills: ['JavaScript'],
          targetRoleIds: ['backend-developer'],
        },
      ];
      assert.throws(() => validateOpportunityCatalogue(invalid), /title must be a non-empty string/i);
    });

    it('throws when an ungrounded skill is used', () => {
      const invalid = [
        {
          ...OPPORTUNITY_CATALOGUE[0],
          id: 'curated_internal:fake-skill',
          requiredSkills: ['FakeSkillThatDoesNotExistInTaxonomy12345!@#'],
        },
      ];
      // Note: non-alphanumeric fails skillKey normalization
      assert.throws(() => validateOpportunityCatalogue(invalid), /not grounded/i);
    });

    it('throws when an invalid role ID is referenced', () => {
      const invalid = [
        {
          ...OPPORTUNITY_CATALOGUE[0],
          id: 'curated_internal:fake-role',
          targetRoleIds: ['chief-vibes-officer'],
        },
      ];
      assert.throws(() => validateOpportunityCatalogue(invalid), /targetRoleId.*not in CAREER_ROLES/i);
    });

    it('throws when expiresAt is on or before addedDate', () => {
      const invalid = [
        {
          ...OPPORTUNITY_CATALOGUE[0],
          id: 'curated_internal:bad-dates',
          addedDate: '2026-10-02',
          expiresAt: '2026-10-01',
        },
      ];
      assert.throws(() => validateOpportunityCatalogue(invalid), /expiresAt must be strictly after addedDate/i);
    });

    it('throws when minSkillFraction is out of (0, 1] range', () => {
      const invalidZero = [
        {
          ...OPPORTUNITY_CATALOGUE[0],
          id: 'curated_internal:bad-frac-0',
          minSkillFraction: 0,
        },
      ];
      assert.throws(() => validateOpportunityCatalogue(invalidZero), /minSkillFraction must be a number between 0 and 1/i);

      const invalidOver = [
        {
          ...OPPORTUNITY_CATALOGUE[0],
          id: 'curated_internal:bad-frac-2',
          minSkillFraction: 1.5,
        },
      ];
      assert.throws(() => validateOpportunityCatalogue(invalidOver), /minSkillFraction must be a number between 0 and 1/i);
    });
  });

  // ─── 3. Deduplication & Semantic Collision Detection ───────────────────────
  describe('3. Deduplication & Semantic Collision Detection', () => {
    it('throws on duplicate IDs', () => {
      const dupe = [OPPORTUNITY_CATALOGUE[0], { ...OPPORTUNITY_CATALOGUE[0] }];
      assert.throws(() => validateOpportunityCatalogue(dupe), /duplicate/i);
    });

    it('throws on semantic duplicates with identical title, skills, and target roles', () => {
      const semanticDupe = [
        OPPORTUNITY_CATALOGUE[0],
        {
          ...OPPORTUNITY_CATALOGUE[0],
          id: 'curated_internal:different-id-same-content',
        },
      ];
      assert.throws(() => validateOpportunityCatalogue(semanticDupe), /semantic duplicate detected/i);
    });
  });

  // ─── 4. Freshness & Staleness Audit ────────────────────────────────────────
  describe('4. Freshness & Staleness Audit', () => {
    it('audits current catalogue as fresh and active against current date', () => {
      const audit = auditCatalogueFreshness(OPPORTUNITY_CATALOGUE, {
        referenceDate: '2026-10-03',
        maxAgeDays: 365,
      });

      assert.equal(audit.valid, true);
      assert.equal(audit.total, 10);
      assert.equal(audit.activeCount, 10);
      assert.equal(audit.expiredCount, 0);
      assert.equal(audit.staleCount, 0);
      assert.deepEqual(audit.expiredOpportunities, []);
      assert.deepEqual(audit.staleOpportunities, []);
    });

    it('detects expired opportunities against future reference date', () => {
      const audit = auditCatalogueFreshness(OPPORTUNITY_CATALOGUE, {
        referenceDate: '2028-01-01',
      });

      assert.equal(audit.valid, false);
      assert.equal(audit.expiredCount, 10);
      assert.equal(audit.activeCount, 0);
      assert.equal(audit.expiredOpportunities.length, 10);
    });

    it('detects stale opportunities when age exceeds maxAgeDays', () => {
      const audit = auditCatalogueFreshness(OPPORTUNITY_CATALOGUE, {
        referenceDate: '2026-10-03',
        maxAgeDays: 0, // 0 days max age flags anything added in past
      });

      assert.equal(audit.staleCount, 10);
      assert.ok(audit.staleOpportunities.length > 0);
    });
  });

  // ─── 5. Task 25 Matching & Near-Miss Intelligence ───────────────────────────
  describe('5. Task 25 Matching & Near-Miss Intelligence', () => {
    it('returns matchExplanation with satisfied skills and evidence count for matched opportunities', () => {
      const result = matchOpportunities(
        twinWith(['JavaScript', 'Node.js']),
        backendProfile,
      );

      assert.ok(result.length >= 1);
      const app = result.find((r) => r.id === 'curated_internal:backend-apprenticeship');
      assert.ok(app);
      assert.ok(app.matchExplanation, 'matched opportunity must contain matchExplanation');
      assert.deepEqual(app.matchExplanation.satisfiedSkills, ['JavaScript', 'Node.js']);
      assert.deepEqual(app.matchExplanation.missingSkills, []);
      assert.equal(app.matchExplanation.verifiedCount, 2);
      assert.equal(app.matchExplanation.requiredCount, 2);
      assert.equal(app.matchExplanation.matchedRole, 'backend-developer');
    });

    it('returns matchExplanation with satisfied and missing skills for near-miss opportunities', () => {
      const result = nearMissOpportunities(
        twinWith(['JavaScript']),
        backendProfile,
      );

      const app = result.find((r) => r.id === 'curated_internal:backend-apprenticeship');
      assert.ok(app);
      assert.ok(app.matchExplanation, 'near-miss must contain matchExplanation');
      assert.deepEqual(app.matchExplanation.satisfiedSkills, ['JavaScript']);
      assert.deepEqual(app.matchExplanation.missingSkills, ['Node.js']);
      assert.equal(app.matchExplanation.verifiedCount, 1);
      assert.equal(app.matchExplanation.requiredCount, 2);
      assert.equal(app.matchExplanation.thresholdUsed, 0.5);
    });

    it('respects configurable near-miss threshold via filters.threshold', () => {
      // Backend student with JavaScript only (1 of 2 skills = 50%)
      // If threshold is 60%, 50% does not meet threshold -> excluded
      const strictResult = nearMissOpportunities(
        twinWith(['JavaScript']),
        backendProfile,
        OPPORTUNITY_CATALOGUE,
        { threshold: 0.6 },
      );
      assert.equal(strictResult.some((r) => r.id === 'curated_internal:backend-apprenticeship'), false);

      // If threshold is 40% (or 40), 50% qualifies -> included
      const lenientResult = nearMissOpportunities(
        twinWith(['JavaScript']),
        backendProfile,
        OPPORTUNITY_CATALOGUE,
        { threshold: 40 },
      );
      assert.equal(lenientResult.some((r) => r.id === 'curated_internal:backend-apprenticeship'), true);
    });

    it('filters out expired opportunities based on currentDate', () => {
      const mockCatalogue = [
        {
          ...OPPORTUNITY_CATALOGUE[0],
          id: 'curated_internal:expired-backend-app',
          expiresAt: '2026-01-01',
        },
      ];

      // At 2026-10-03, this opportunity is expired
      const matches = matchOpportunities(
        twinWith(['JavaScript', 'Node.js']),
        backendProfile,
        mockCatalogue,
        { currentDate: '2026-10-03' },
      );
      assert.equal(matches.length, 0);

      // If includeExpired is explicitly true, it is retained
      const withExpired = matchOpportunities(
        twinWith(['JavaScript', 'Node.js']),
        backendProfile,
        mockCatalogue,
        { currentDate: '2026-10-03', includeExpired: true },
      );
      assert.equal(withExpired.length, 1);
    });

    it('filters out inactive opportunities (isActive: false)', () => {
      const mockCatalogue = [
        {
          ...OPPORTUNITY_CATALOGUE[0],
          id: 'curated_internal:inactive-backend-app',
          isActive: false,
        },
      ];

      const matches = matchOpportunities(
        twinWith(['JavaScript', 'Node.js']),
        backendProfile,
        mockCatalogue,
      );
      assert.equal(matches.length, 0);
    });
  });
});
