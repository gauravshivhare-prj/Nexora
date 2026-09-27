import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SYNTHETIC_PROFILES,
  getSyntheticProfile,
  isSyntheticProfile,
  assertNonProductionEnvironment,
  SYNTHETIC_FIXTURE_METADATA,
} from './fixtures/syntheticProfilesFixtures.js';
import { buildCareerTwin } from '../src/domain/careerTwin/buildCareerTwin.js';
import { rankRoles } from '../src/domain/careers/matchRole.js';
import { findRole, CAREER_ROLES } from '../src/domain/careers/roleCatalogue.js';
import { computeSkillGap, GAP_STATUS, GAP_IMPORTANCE } from '../src/domain/skillGap/computeSkillGap.js';
import { buildRoadmap } from '../src/domain/roadmap/buildRoadmap.js';
import { computeReadiness } from '../src/domain/readiness/computeReadiness.js';
import { READINESS_EVIDENCE_STATUS } from '../src/domain/readiness/readinessContract.js';
import { matchOpportunities } from '../src/domain/opportunities/opportunityCatalogue.js';
import { canonicalSkill, skillKey } from '../src/domain/skills/skillKey.js';
import { SKILL_LEVEL_VALUES } from '../src/constants/profilePolicy.js';

describe('TASK A21 — Synthetic Intelligence Fixtures Regression Suite', () => {
  describe('1. Synthetic Fixture Integrity & Non-Production Guardrails', () => {
    it('enforces non-production metadata on all synthetic profiles', () => {
      assert.equal(SYNTHETIC_FIXTURE_METADATA.isSynthetic, true);
      assert.equal(SYNTHETIC_FIXTURE_METADATA.productionUsable, false);
      assert.equal(SYNTHETIC_FIXTURE_METADATA.environment, 'test');

      for (const [key, profile] of Object.entries(SYNTHETIC_PROFILES)) {
        assert.ok(profile.id.startsWith('synthetic-'), `${key} id must have synthetic- prefix`);
        assert.equal(profile.metadata.isSynthetic, true);
        assert.equal(profile.metadata.productionUsable, false);
        assert.equal(profile.metadata.environment, 'test');
        assert.ok(isSyntheticProfile(profile), `${key} must be identified as synthetic`);
      }
    });

    it('deeply freezes all synthetic fixtures to prevent runtime mutation during test runs', () => {
      assert.ok(Object.isFrozen(SYNTHETIC_PROFILES));
      assert.ok(Object.isFrozen(SYNTHETIC_PROFILES.beginner));
      assert.ok(Object.isFrozen(SYNTHETIC_PROFILES.beginner.profile));
      assert.ok(Object.isFrozen(SYNTHETIC_PROFILES.beginner.twin));

      assert.throws(() => {
        SYNTHETIC_PROFILES.beginner.tier = 'mutated';
      }, TypeError);

      assert.throws(() => {
        SYNTHETIC_PROFILES.intermediate.profile.skills.push({ name: 'Hacked', level: 'expert' });
      }, TypeError);
    });

    it('strictly forbids synthetic intelligence fixtures in production environments', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        assert.throws(() => {
          assertNonProductionEnvironment();
        }, /MUST NEVER be loaded in production/);

        assert.throws(() => {
          getSyntheticProfile('beginner');
        }, /MUST NEVER be loaded in production/);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('accurately identifies synthetic profiles vs real candidate models', () => {
      assert.equal(isSyntheticProfile(SYNTHETIC_PROFILES.beginner), true);
      assert.equal(isSyntheticProfile(SYNTHETIC_PROFILES.intermediate), true);
      assert.equal(isSyntheticProfile(SYNTHETIC_PROFILES.advanced), true);

      // Real user document simulation
      const realCandidate = {
        id: 'user_64abc0001112223334445556',
        name: 'Actual Candidate',
        skills: [{ name: 'JavaScript', level: 'intermediate' }],
      };
      assert.equal(isSyntheticProfile(realCandidate), false);
      assert.equal(isSyntheticProfile(null), false);
      assert.equal(isSyntheticProfile({}), false);
    });

    it('contains zero leaked secrets, credentials, passwords, or production PII', () => {
      const serialized = JSON.stringify(SYNTHETIC_PROFILES);
      assert.equal(serialized.includes('password'), false);
      assert.equal(serialized.includes('secret'), false);
      assert.equal(serialized.includes('token'), false);
      assert.equal(serialized.includes('bearer'), false);
    });
  });

  describe('2. Schema & Taxonomy Grounding Audit', () => {
    it('verifies all skills in profiles and evidence are grounded in canonical skill taxonomy', () => {
      for (const [name, fixture] of Object.entries(SYNTHETIC_PROFILES)) {
        for (const skill of fixture.profile.skills) {
          const canonical = canonicalSkill(skill.name);
          assert.ok(canonical, `${name} skill "${skill.name}" must exist in canonical taxonomy`);
          assert.ok(SKILL_LEVEL_VALUES.includes(skill.level), `${skill.level} must be valid level`);
        }

        for (const project of fixture.profile.projects) {
          for (const tech of project.technologies) {
            const canonical = canonicalSkill(tech);
            assert.ok(canonical, `${name} project tech "${tech}" must exist in canonical taxonomy`);
          }
        }

        for (const item of fixture.verifiedEvidence) {
          const canonical = canonicalSkill(item.skill);
          assert.ok(canonical, `${name} verified evidence "${item.skill}" must exist in canonical taxonomy`);
          assert.equal(item.evidence.strength, 'verified');
        }
      }
    });

    it('verifies target roles exist in official career catalogue', () => {
      for (const fixture of Object.values(SYNTHETIC_PROFILES)) {
        const statedRole = fixture.profile.career.targetRole;
        const role = CAREER_ROLES.find(
          (r) => r.title.toLowerCase() === statedRole.toLowerCase() || r.id === statedRole,
        );
        assert.ok(role, `Target role "${statedRole}" must exist in CAREER_ROLES catalogue`);
      }
    });
  });

  describe('3. Career Twin Synthesis Determinism', () => {
    it('reproduces twin structure identically via pure buildCareerTwin', () => {
      for (const fixture of Object.values(SYNTHETIC_PROFILES)) {
        const freshlyBuilt = buildCareerTwin({
          profile: fixture.profile,
          resumes: fixture.resumes,
          verifiedEvidence: fixture.verifiedEvidence,
        });

        assert.equal(freshlyBuilt.skills.length, fixture.twin.skills.length);
        assert.equal(freshlyBuilt.indicators.verified, fixture.twin.indicators.verified);
        assert.equal(freshlyBuilt.indicators.supported, fixture.twin.indicators.supported);
        assert.equal(freshlyBuilt.indicators.claimedOnly, fixture.twin.indicators.claimedOnly);
      }
    });

    it('verifies evidence strength distribution across tiers', () => {
      const beginner = SYNTHETIC_PROFILES.beginner;
      const intermediate = SYNTHETIC_PROFILES.intermediate;
      const advanced = SYNTHETIC_PROFILES.advanced;

      // Beginner: 0 verified, mostly claimed
      assert.equal(beginner.twin.indicators.verified, 0);
      assert.ok(beginner.twin.indicators.claimedOnly >= 1);

      // Intermediate: exactly 1 verified, multiple supported
      assert.equal(intermediate.twin.indicators.verified, 1);
      assert.ok(intermediate.twin.indicators.supported >= 3);

      // Advanced: 4 verified skills, top corroboration
      assert.equal(advanced.twin.indicators.verified, 4);
    });
  });

  describe('4. Intelligence Pipeline Regression: Backend Track Across Tiers', () => {
    const beginner = SYNTHETIC_PROFILES.beginner;
    const intermediate = SYNTHETIC_PROFILES.intermediate;
    const advanced = SYNTHETIC_PROFILES.advanced;
    const backendRole = findRole('backend-developer');

    it('1. Role Matching: scores strictly increase monotonically from Beginner to Advanced', () => {
      const begMatch = rankRoles(beginner.twin).matches.find((m) => m.roleId === 'backend-developer');
      const intMatch = rankRoles(intermediate.twin).matches.find((m) => m.roleId === 'backend-developer');
      const advMatch = rankRoles(advanced.twin).matches.find((m) => m.roleId === 'backend-developer');

      assert.ok(begMatch, 'Beginner must match backend role');
      assert.ok(intMatch, 'Intermediate must match backend role');
      assert.ok(advMatch, 'Advanced must match backend role');

      // Monotonic progression: Beginner < Intermediate < Advanced
      assert.ok(
        begMatch.score < intMatch.score,
        `Beginner score (${begMatch.score}) must be lower than intermediate (${intMatch.score})`,
      );
      assert.ok(
        intMatch.score < advMatch.score,
        `Intermediate score (${intMatch.score}) must be lower than advanced (${advMatch.score})`,
      );

      // Score tiers & bands
      assert.ok(begMatch.score <= beginner.expectedBenchmarks.rankRoles.maxScore);
      assert.equal(begMatch.band, beginner.expectedBenchmarks.rankRoles.expectedBand);

      assert.ok(intMatch.score >= intermediate.expectedBenchmarks.rankRoles.minScore);
      assert.ok(intMatch.score <= intermediate.expectedBenchmarks.rankRoles.maxScore);

      assert.ok(advMatch.score >= advanced.expectedBenchmarks.rankRoles.minScore);
      assert.equal(advMatch.band, advanced.expectedBenchmarks.rankRoles.expectedBand);

      // Dimension breakdown
      assert.equal(begMatch.matchedRequired.length, 1); // Only JS
      assert.equal(begMatch.missingRequired.length, 3); // Node, SQL, REST APIs missing

      assert.equal(intMatch.matchedRequired.length, 4); // All 4 required held
      assert.equal(intMatch.missingRequired.length, 0);

      assert.equal(advMatch.matchedRequired.length, 4);
      assert.equal(advMatch.missingRequired.length, 0);
      assert.ok(advMatch.dimensions.evidenceStrength.value >= 85); // 85-90+ strong verified credit
    });

    it('2. Skill Gap: verifies gap resolution progression across tiers', () => {
      const begGap = computeSkillGap(beginner.twin, backendRole);
      const intGap = computeSkillGap(intermediate.twin, backendRole);
      const advGap = computeSkillGap(advanced.twin, backendRole);

      // Beginner
      assert.equal(begGap.summary.required.total, 4);
      assert.equal(begGap.summary.required.missing, 3);
      assert.equal(begGap.summary.required.claimed, 1);
      assert.equal(begGap.summary.required.supported, 0);
      assert.equal(begGap.summary.required.verified, 0);

      // Intermediate
      assert.equal(intGap.summary.required.total, 4);
      assert.equal(intGap.summary.required.missing, 0);
      assert.equal(intGap.summary.required.claimed, 0);
      assert.equal(intGap.summary.required.supported, 3);
      assert.equal(intGap.summary.required.verified, 1);

      // Advanced
      assert.equal(advGap.summary.required.total, 4);
      assert.equal(advGap.summary.required.missing, 0);
      assert.equal(advGap.summary.required.claimed, 0);
      assert.equal(advGap.summary.required.supported, 0);
      assert.equal(advGap.summary.required.verified, 4);

      // Strictly increasing verified count
      assert.equal(begGap.summary.required.verified, 0);
      assert.equal(intGap.summary.required.verified, 1);
      assert.equal(advGap.summary.required.verified, 4);
    });

    it('3. Roadmap: verifies roadmap action prioritization across tiers', () => {
      const begGap = computeSkillGap(beginner.twin, backendRole);
      const intGap = computeSkillGap(intermediate.twin, backendRole);
      const advGap = computeSkillGap(advanced.twin, backendRole);

      const begRoadmap = buildRoadmap(begGap);
      const intRoadmap = buildRoadmap(intGap);
      const advRoadmap = buildRoadmap(advGap);

      // Beginner must have critical priority actions for missing core required skills
      assert.ok(begRoadmap.items.length > 0);
      const criticalActions = begRoadmap.items.filter((a) => a.priority === 'critical');
      assert.ok(criticalActions.length >= 3, 'Beginner must have critical actions for missing required skills');

      // Intermediate has fewer critical actions, focuses on verification & preferred skills
      assert.ok(intRoadmap.items.some((a) => ['Docker', 'Redis', 'Express.js'].includes(a.skill.name)));

      // Advanced has 0 required blocking gap actions
      const advRequiredActions = advRoadmap.items.filter((a) => backendRole.requiredSkills.includes(a.skill.name));
      assert.equal(advRequiredActions.length, 0, 'Advanced profile must have no remaining required roadmap gaps');
    });

    it('4. Readiness: verifies evidence status progression from partial to verified', () => {
      const begGap = computeSkillGap(beginner.twin, backendRole);
      const intGap = computeSkillGap(intermediate.twin, backendRole);
      const advGap = computeSkillGap(advanced.twin, backendRole);

      const begReadiness = computeReadiness(begGap);
      const intReadiness = computeReadiness(intGap);
      const advReadiness = computeReadiness(advGap);

      // Beginner: partial, 4 blocking skills
      assert.equal(begReadiness.evidenceStatus, READINESS_EVIDENCE_STATUS.PARTIAL);
      assert.equal(begReadiness.blockingSkills.length, 4);

      // Intermediate: supported, 3 blocking skills (the 3 supported ones, since only verified unblocks)
      assert.equal(intReadiness.evidenceStatus, READINESS_EVIDENCE_STATUS.SUPPORTED);
      assert.equal(intReadiness.blockingSkills.length, 3);
      assert.ok(intReadiness.blockingSkills.every((s) => s.status === 'supported'));

      // Advanced: verified, 0 blocking skills
      assert.equal(advReadiness.evidenceStatus, READINESS_EVIDENCE_STATUS.VERIFIED);
      assert.equal(advReadiness.blockingSkills.length, 0);
    });

    it('5. Opportunities: verifies strict matching rules (only Advanced unblocks curated opportunity)', () => {
      const begOpps = matchOpportunities(beginner.twin, beginner.profile);
      const intOpps = matchOpportunities(intermediate.twin, intermediate.profile);
      const advOpps = matchOpportunities(advanced.twin, advanced.profile);

      // Beginner & Intermediate fail verified requirements
      assert.equal(begOpps.length, 0);
      assert.equal(intOpps.length, 0);

      // Advanced unlocks curated backend apprenticeship
      assert.equal(advOpps.length, 1);
      assert.equal(advOpps[0].id, 'curated_internal:backend-apprenticeship');
      assert.equal(advOpps[0].matchedEligibility.length, 2);
    });
  });

  describe('5. Multi-Track Regression: Frontend Track Across Tiers', () => {
    const begFe = SYNTHETIC_PROFILES.beginnerFrontend;
    const intFe = SYNTHETIC_PROFILES.intermediateFrontend;
    const advFe = SYNTHETIC_PROFILES.advancedFrontend;
    const frontendRole = findRole('frontend-developer');

    it('verifies frontend career matching, gap, readiness, and opportunity progression', () => {
      // 1. Matching
      const begMatch = rankRoles(begFe.twin).matches.find((m) => m.roleId === 'frontend-developer');
      const intMatch = rankRoles(intFe.twin).matches.find((m) => m.roleId === 'frontend-developer');
      const advMatch = rankRoles(advFe.twin).matches.find((m) => m.roleId === 'frontend-developer');

      assert.ok(begMatch.score < intMatch.score);
      assert.ok(intMatch.score < advMatch.score);
      assert.equal(advMatch.band, 'strong');

      // 2. Skill Gap
      const begGap = computeSkillGap(begFe.twin, frontendRole);
      const intGap = computeSkillGap(intFe.twin, frontendRole);
      const advGap = computeSkillGap(advFe.twin, frontendRole);

      assert.equal(begGap.summary.required.missing, 2);
      assert.equal(intGap.summary.required.missing, 0);
      assert.equal(advGap.summary.required.verified, 4);

      // 3. Readiness
      assert.equal(computeReadiness(begGap).evidenceStatus, READINESS_EVIDENCE_STATUS.PARTIAL);
      assert.equal(computeReadiness(intGap).evidenceStatus, READINESS_EVIDENCE_STATUS.SUPPORTED);
      assert.equal(computeReadiness(advGap).evidenceStatus, READINESS_EVIDENCE_STATUS.VERIFIED);
      assert.equal(computeReadiness(advGap).blockingSkills.length, 0);

      // 4. Opportunities
      assert.equal(matchOpportunities(begFe.twin, begFe.profile).length, 0);
      assert.equal(matchOpportunities(intFe.twin, intFe.profile).length, 0);
      const advOpps = matchOpportunities(advFe.twin, advFe.profile);
      assert.equal(advOpps.length, 1);
      assert.equal(advOpps[0].id, 'curated_internal:frontend-apprenticeship');
    });
  });

  describe('6. Reproducibility & Cross-Run Determinism', () => {
    it('produces identical outputs across 10 consecutive runs with zero drift', () => {
      const backendRole = findRole('backend-developer');
      const baselineMatch = rankRoles(SYNTHETIC_PROFILES.intermediate.twin);
      const baselineGap = computeSkillGap(SYNTHETIC_PROFILES.intermediate.twin, backendRole);
      const baselineReadiness = computeReadiness(baselineGap);

      for (let run = 0; run < 10; run++) {
        const currentMatch = rankRoles(SYNTHETIC_PROFILES.intermediate.twin);
        const currentGap = computeSkillGap(SYNTHETIC_PROFILES.intermediate.twin, backendRole);
        const currentReadiness = computeReadiness(currentGap);

        assert.deepEqual(currentMatch, baselineMatch);
        assert.deepEqual(currentGap, baselineGap);
        assert.deepEqual(currentReadiness, baselineReadiness);
      }
    });
  });
});
