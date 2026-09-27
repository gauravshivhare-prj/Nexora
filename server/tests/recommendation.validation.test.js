import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAREER_ROLES,
  CATALOGUE_SOURCE,
  CATALOGUE_VERSION,
  ROLE_CATEGORIES,
  findRole,
} from '../src/domain/careers/roleCatalogue.js';
import { rankRoles, scoreRoleMatch } from '../src/domain/careers/matchRole.js';
import {
  DIMENSION_WEIGHTS,
  MATCH_BANDS,
  MINIMUM_RECOMMENDABLE_SCORE,
  STRENGTH_CREDIT,
  WEIGHTS_VERSION,
  bandFor,
} from '../src/domain/careers/scoring.js';
import { canonicalSkill, skillKey } from '../src/domain/skills/skillKey.js';
import { RECOMMENDATION_FIXTURES } from './fixtures/recommendationFixtures.js';

const BACKEND = findRole('backend-developer');

describe('TASK A15 — Recommendation Validation Audit Suite', () => {
  // =========================================================================
  // 1. Current Role Catalogue & Fixture Alignment
  // =========================================================================
  describe('1. Current Role Catalogue & Fixture Alignment', () => {
    it('verifies catalogue metadata and role integrity across all 10 roles', () => {
      assert.equal(CAREER_ROLES.length, 10, 'Expected exactly 10 roles in career catalogue');
      assert.equal(CATALOGUE_VERSION, 1);
      assert.equal(CATALOGUE_SOURCE.type, 'curated');

      const knownCategories = new Set(Object.values(ROLE_CATEGORIES));
      for (const role of CAREER_ROLES) {
        assert.ok(role.id, 'Role must have an ID');
        assert.ok(role.title, 'Role must have a title');
        assert.ok(knownCategories.has(role.category), `Role ${role.id} has invalid category`);
        assert.ok(role.summary, `Role ${role.id} has no summary`);
        assert.ok(role.requiredSkills.length > 0, `Role ${role.id} must have required skills`);
        assert.ok(role.preferredSkills.length > 0, `Role ${role.id} must have preferred skills`);

        // Check that every required and preferred skill resolves to a canonical skill
        for (const skillName of [...role.requiredSkills, ...role.preferredSkills]) {
          assert.ok(
            canonicalSkill(skillName),
            `Catalogue skill "${skillName}" in role "${role.id}" must resolve to canonical skill`,
          );
        }
      }
    });

    it('does not recommend a role for an empty profile', () => {
      const result = rankRoles(RECOMMENDATION_FIXTURES.emptyProfile);
      assert.deepEqual(result.matches, []);
    });

    it('verifies that each tailored role fixture ranks #1 for its intended role in the catalogue', () => {
      const roleFixtureMap = [
        { fixture: RECOMMENDATION_FIXTURES.strongBackendFit, expectedRole: 'backend-developer' },
        { fixture: RECOMMENDATION_FIXTURES.strongFrontendFit, expectedRole: 'frontend-developer' },
        { fixture: RECOMMENDATION_FIXTURES.strongFullStackFit, expectedRole: 'full-stack-developer' },
        { fixture: RECOMMENDATION_FIXTURES.strongDataAnalystFit, expectedRole: 'data-analyst' },
        { fixture: RECOMMENDATION_FIXTURES.strongDataScientistFit, expectedRole: 'data-scientist' },
        { fixture: RECOMMENDATION_FIXTURES.strongDevOpsFit, expectedRole: 'devops-engineer' },
        { fixture: RECOMMENDATION_FIXTURES.strongMobileFit, expectedRole: 'mobile-developer' },
        { fixture: RECOMMENDATION_FIXTURES.strongQAEngineerFit, expectedRole: 'qa-engineer' },
        { fixture: RECOMMENDATION_FIXTURES.strongUIUXFit, expectedRole: 'ui-ux-designer' },
        { fixture: RECOMMENDATION_FIXTURES.strongCloudFit, expectedRole: 'cloud-engineer' },
      ];

      for (const { fixture, expectedRole } of roleFixtureMap) {
        const result = rankRoles(fixture);
        assert.ok(result.matches.length > 0, `Expected matches for ${expectedRole}`);
        const topMatch = result.matches[0];
        assert.equal(
          topMatch.roleId,
          expectedRole,
          `Expected ${expectedRole} to rank first, but got ${topMatch.roleId}`,
        );
        assert.equal(
          topMatch.band,
          'strong',
          `Expected ${expectedRole} to be in "strong" band, got "${topMatch.band}"`,
        );
        assert.ok(
          topMatch.score >= 75,
          `Expected score >= 75 for ${expectedRole}, got ${topMatch.score}`,
        );
      }
    });

    it('keeps concrete skill fit ahead of conflicting interests', () => {
      const result = rankRoles(RECOMMENDATION_FIXTURES.conflictingInterestAndSkills);
      const backend = result.matches.find((match) => match.roleId === 'backend-developer');

      assert.ok(backend, 'the concrete backend fit should remain recommendable');
      assert.equal(backend.dimensions.requiredSkills.value, 100);
      assert.ok(backend.score >= 50);
    });
  });

  // =========================================================================
  // 2. Weights & Scoring Dimensions Audit
  // =========================================================================
  describe('2. Weights & Scoring Dimensions Audit', () => {
    it('enforces exact dimension weights summing to 1.0', () => {
      assert.equal(WEIGHTS_VERSION, 1);
      assert.equal(DIMENSION_WEIGHTS.requiredSkills, 0.45);
      assert.equal(DIMENSION_WEIGHTS.preferredSkills, 0.20);
      assert.equal(DIMENSION_WEIGHTS.evidenceStrength, 0.20);
      assert.equal(DIMENSION_WEIGHTS.interestAlignment, 0.10);
      assert.equal(DIMENSION_WEIGHTS.backgroundAlignment, 0.05);

      const sum = Object.values(DIMENSION_WEIGHTS).reduce((acc, w) => acc + w, 0);
      assert.ok(Math.abs(sum - 1.0) < 1e-9, `Dimension weights must sum to 1.0, got ${sum}`);
    });

    it('verifies exact arithmetic weighting formula for scoreRoleMatch', () => {
      const match = scoreRoleMatch(RECOMMENDATION_FIXTURES.strongBackendFit, BACKEND);

      // Verify all required skills matched (4 of 4)
      assert.equal(match.dimensions.requiredSkills.value, 100);
      assert.equal(match.dimensions.requiredSkills.weight, 0.45);

      // Verify preferred skills matched (2 of 6: Express.js, MongoDB)
      const expectedPreferredRatio = 2 / 6;
      assert.equal(match.dimensions.preferredSkills.value, Math.round(expectedPreferredRatio * 100));
      assert.equal(match.dimensions.preferredSkills.weight, 0.20);

      // Verify evidence strength (all 6 matched skills are supported = 0.8)
      assert.equal(match.dimensions.evidenceStrength.value, 80);
      assert.equal(match.dimensions.evidenceStrength.weight, 0.20);

      // Verify interest alignment (stated target role matches = 1.0)
      assert.equal(match.dimensions.interestAlignment.value, 100);
      assert.equal(match.dimensions.interestAlignment.weight, 0.10);

      // Verify background alignment (CS matches computing background = 1.0)
      assert.equal(match.dimensions.backgroundAlignment.value, 100);
      assert.equal(match.dimensions.backgroundAlignment.weight, 0.05);

      // Expected combined score:
      // (1.0 * 0.45) + (2/6 * 0.20) + (0.8 * 0.20) + (1.0 * 0.10) + (1.0 * 0.05)
      // = 0.45 + 0.066667 + 0.16 + 0.10 + 0.05 = 0.826667 -> 83
      const expectedScore = Math.round(
        (1.0 * 0.45 + (2 / 6) * 0.2 + 0.8 * 0.2 + 1.0 * 0.1 + 1.0 * 0.05) * 100,
      );
      assert.equal(match.score, expectedScore);
      assert.equal(match.score, 83);
      assert.equal(match.band, 'strong');
    });

    it('enforces MINIMUM_RECOMMENDABLE_SCORE threshold (20) filter in rankRoles', () => {
      assert.equal(MINIMUM_RECOMMENDABLE_SCORE, 20);

      // Candidate with only 1 claimed preferred skill scores below 20
      const belowCandidate = RECOMMENDATION_FIXTURES.belowThresholdCandidate;
      const normalResult = rankRoles(belowCandidate);
      assert.equal(normalResult.matches.length, 0, 'Sub-threshold matches must be filtered out by default');

      const allResult = rankRoles(belowCandidate, { includeBelowThreshold: true });
      assert.ok(allResult.matches.length > 0, 'Matches must be returned when includeBelowThreshold is true');
      assert.ok(allResult.matches[0].score < MINIMUM_RECOMMENDABLE_SCORE);

      // Candidate above 20 is included normally
      const aboveCandidate = RECOMMENDATION_FIXTURES.aboveThresholdCandidate;
      const aboveResult = rankRoles(aboveCandidate);
      assert.ok(aboveResult.matches.length > 0);
      assert.ok(aboveResult.matches[0].score >= MINIMUM_RECOMMENDABLE_SCORE);
    });
  });

  // =========================================================================
  // 3. Normalization Audit
  // =========================================================================
  describe('3. Normalization Audit', () => {
    it('normalizes skill names across casing, punctuation, and whitespace variations', () => {
      const match = scoreRoleMatch(RECOMMENDATION_FIXTURES.casingAndPunctuationSkills, BACKEND);

      // All 4 required skills must match despite variations ('node.js', 'sql', 'rest apis', 'javascript')
      assert.equal(match.matchedRequired.length, 4);
      assert.equal(match.missingRequired.length, 0);
      assert.equal(match.dimensions.requiredSkills.value, 100);
    });

    it('filters generic job title words so they do not produce false positive interest alignment', () => {
      const match = scoreRoleMatch(RECOMMENDATION_FIXTURES.genericTitleStudentTarget, BACKEND);

      // "Senior Software Application Developer" contains only generic words:
      // ['senior', 'software', 'application', 'developer'].
      // None should match "Backend Developer".
      assert.equal(match.dimensions.interestAlignment.value, 0);
    });

    it('handles academic background normalization: computing vs unrelated vs neutral (missing)', () => {
      // 1. Computing background: 100%
      const csMatch = scoreRoleMatch(RECOMMENDATION_FIXTURES.strongBackendFit, BACKEND);
      assert.equal(csMatch.dimensions.backgroundAlignment.value, 100);

      // 2. Unrelated background (Civil Engineering): 0%, without disqualifying candidate
      const civilMatch = scoreRoleMatch(RECOMMENDATION_FIXTURES.unrelatedAcademicFit, BACKEND);
      assert.equal(civilMatch.dimensions.backgroundAlignment.value, 0);
      assert.ok(civilMatch.score >= 70, 'Unrelated degree must not disqualify strong candidate');

      // 3. Neutral (missing/null) background: 50%
      const neutralMatch = scoreRoleMatch(RECOMMENDATION_FIXTURES.neutralAcademicFit, BACKEND);
      assert.equal(neutralMatch.dimensions.backgroundAlignment.value, 50);
    });
  });

  // =========================================================================
  // 4. Evidence Semantics & Credit Progression Audit
  // =========================================================================
  describe('4. Evidence Semantics & Credit Progression Audit', () => {
    it('verifies exact STRENGTH_CREDIT constant values', () => {
      assert.equal(STRENGTH_CREDIT.claimed, 0.4);
      assert.equal(STRENGTH_CREDIT.supported, 0.8);
      assert.equal(STRENGTH_CREDIT.verified, 1.0);
    });

    it('verifies evidence source mapping matches evidence taxonomy', () => {
      // Claimed uses self_declared
      for (const s of RECOMMENDATION_FIXTURES.claimedBackendSkills.skills) {
        assert.equal(s.strength, 'claimed');
        assert.equal(s.evidence[0].source, 'self_declared');
      }

      // Supported uses project
      for (const s of RECOMMENDATION_FIXTURES.supportedBackendSkills.skills) {
        assert.equal(s.strength, 'supported');
        assert.equal(s.evidence[0].source, 'project');
      }

      // Verified uses interview
      for (const s of RECOMMENDATION_FIXTURES.verifiedBackendSkills.skills) {
        assert.equal(s.strength, 'verified');
        assert.equal(s.evidence[0].source, 'interview');
      }
    });

    it('strictly enforces credit progression: verified > supported > claimed across identical skill sets', () => {
      const claimed = scoreRoleMatch(RECOMMENDATION_FIXTURES.claimedBackendSkills, BACKEND);
      const supported = scoreRoleMatch(RECOMMENDATION_FIXTURES.supportedBackendSkills, BACKEND);
      const verified = scoreRoleMatch(RECOMMENDATION_FIXTURES.verifiedBackendSkills, BACKEND);

      // Coverage dimensions must be identical (100% required coverage)
      assert.equal(claimed.dimensions.requiredSkills.value, 100);
      assert.equal(supported.dimensions.requiredSkills.value, 100);
      assert.equal(verified.dimensions.requiredSkills.value, 100);

      // Evidence strength progression
      assert.equal(claimed.dimensions.evidenceStrength.value, 40);
      assert.equal(supported.dimensions.evidenceStrength.value, 80);
      assert.equal(verified.dimensions.evidenceStrength.value, 100);

      // Overall score progression
      assert.ok(
        verified.score > supported.score,
        `Verified (${verified.score}) must exceed supported (${supported.score})`,
      );
      assert.ok(
        supported.score > claimed.score,
        `Supported (${supported.score}) must exceed claimed (${claimed.score})`,
      );
      assert.equal(verified.score, 68);
      assert.equal(supported.score, 64);
      assert.equal(claimed.score, 56);
    });

    it('correctly computes evidenceScore for mixed evidence strengths', () => {
      const mixed = scoreRoleMatch(RECOMMENDATION_FIXTURES.mixedEvidenceBackendSkills, BACKEND);

      // Skills: JavaScript (verified=1.0), Node.js (supported=0.8), REST APIs (claimed=0.4), SQL (claimed=0.4)
      // Average: (1.0 + 0.8 + 0.4 + 0.4) / 4 = 2.6 / 4 = 0.65 -> 65%
      assert.equal(mixed.dimensions.evidenceStrength.value, 65);
    });

    it('deduplicates evidence items backing multiple skills in the role match', () => {
      const twin = {
        skills: [
          {
            key: 'nodejs',
            name: 'Node.js',
            strength: 'supported',
            evidence: [{ source: 'project', reference: 'proj_alpha', detail: 'Project Alpha' }],
          },
          {
            key: 'sql',
            name: 'SQL',
            strength: 'supported',
            evidence: [{ source: 'project', reference: 'proj_alpha', detail: 'Project Alpha' }],
          },
        ],
        interests: [],
        targetRoles: [],
        academic: null,
      };

      const match = scoreRoleMatch(twin, BACKEND);

      // The two skills share Project Alpha evidence; collected evidence must deduplicate to 1 item
      assert.equal(match.evidence.length, 1);
      assert.equal(match.evidence[0].reference, 'proj_alpha');
      assert.deepEqual(match.evidence[0].skills, ['Node.js', 'SQL']);
    });
  });

  // =========================================================================
  // 5. Banding & Restraint Invariants
  // =========================================================================
  describe('5. Banding & Restraint Invariants', () => {
    it('verifies match bands and descriptions', () => {
      assert.equal(MATCH_BANDS.length, 4);
      assert.equal(bandFor(100).label, 'strong');
      assert.equal(bandFor(75).label, 'strong');
      assert.equal(bandFor(74).label, 'developing');
      assert.equal(bandFor(50).label, 'developing');
      assert.equal(bandFor(49).label, 'early');
      assert.equal(bandFor(25).label, 'early');
      assert.equal(bandFor(24).label, 'exploratory');
      assert.equal(bandFor(0).label, 'exploratory');
    });

    it('generates accurate explanation sentences naming core skills and missing skills', () => {
      const match = scoreRoleMatch(RECOMMENDATION_FIXTURES.strongBackendFit, BACKEND);

      assert.ok(Array.isArray(match.explanation));
      assert.ok(match.explanation.length >= 2);
      assert.match(match.explanation[0], /You have most of what this role asks for/i);
      assert.match(match.explanation[1], /You have 4 of 4 core skills/i);
    });

    it('strictly forbids market speculation (salary, openings, lpa, demand stats) in recommendations', () => {
      const result = rankRoles(RECOMMENDATION_FIXTURES.strongBackendFit);
      const serialized = JSON.stringify(result.matches).toLowerCase();

      for (const forbidden of ['salary', 'lpa', 'openings', 'demand', 'hiring rate', 'job market statistics']) {
        assert.ok(!serialized.includes(forbidden), `Match output must not contain "${forbidden}"`);
      }
    });
  });
});