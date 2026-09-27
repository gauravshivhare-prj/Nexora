import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CAREER_ROLES, findRole } from '../src/domain/careers/roleCatalogue.js';
import {
  GAP_IMPORTANCE,
  GAP_STATUS,
  computeSkillGap,
} from '../src/domain/skillGap/computeSkillGap.js';
import { skillKey, skillDisplayName, isSameSkill } from '../src/domain/skills/skillKey.js';
import { SKILL_GAP_FIXTURES } from './fixtures/skillGapFixtures.js';

const BACKEND = findRole('backend-developer');
const FRONTEND = findRole('frontend-developer');
const DATA_SCIENTIST = findRole('data-scientist');

const find = (gap, name) => gap.skills.find((skill) => skill.key === skillKey(name));

describe('TASK A17 — Skill-Gap Quality Audit Suite', () => {
  // =========================================================================
  // 1. Missing, Claimed, Supported, Verified States
  // =========================================================================
  describe('1. Skill Gap States (Missing / Claimed / Supported / Verified)', () => {
    it('accurately distinguishes all 4 statuses across required skills', () => {
      const gap = computeSkillGap(SKILL_GAP_FIXTURES.statusLevels, BACKEND);

      const js = find(gap, 'JavaScript');
      const node = find(gap, 'Node.js');
      const rest = find(gap, 'REST APIs');
      const sql = find(gap, 'SQL');

      assert.equal(js.status, GAP_STATUS.CLAIMED);
      assert.equal(node.status, GAP_STATUS.SUPPORTED);
      assert.equal(rest.status, GAP_STATUS.VERIFIED);
      assert.equal(sql.status, GAP_STATUS.MISSING);

      assert.match(js.reason, /has not seen you use it/);
      assert.match(node.reason, /concrete work/);
      assert.match(rest.reason, /independently checked/);
      assert.match(sql.reason, /has not seen it anywhere/);
    });

    it('reports all skills as missing for an empty profile', () => {
      const gap = computeSkillGap(SKILL_GAP_FIXTURES.emptyProfile, BACKEND);

      assert.equal(gap.summary.required.missing, BACKEND.requiredSkills.length);
      assert.equal(gap.summary.preferred.missing, BACKEND.preferredSkills.length);
      assert.equal(gap.summary.required.claimed, 0);
      assert.equal(gap.summary.required.supported, 0);
      assert.equal(gap.summary.required.verified, 0);

      for (const skill of gap.skills) {
        assert.equal(skill.status, GAP_STATUS.MISSING);
        assert.deepEqual(skill.evidence, []);
        assert.ok(skill.suggestedEvidence.length > 0);
      }
    });

    it('reports all skills as claimed when profile only has self-declared skills', () => {
      const gap = computeSkillGap(SKILL_GAP_FIXTURES.allClaimed, BACKEND);

      assert.equal(gap.summary.required.claimed, BACKEND.requiredSkills.length);
      assert.equal(gap.summary.required.missing, 0);
      assert.equal(gap.summary.required.supported, 0);
      assert.equal(gap.summary.required.verified, 0);

      for (const reqSkillName of BACKEND.requiredSkills) {
        const skill = find(gap, reqSkillName);
        assert.equal(skill.status, GAP_STATUS.CLAIMED);
        assert.equal(skill.importance, GAP_IMPORTANCE.REQUIRED);
        assert.match(skill.reason, /has not seen you use it/);
      }
    });

    it('reports all skills as supported when backed by project/certifications', () => {
      const gap = computeSkillGap(SKILL_GAP_FIXTURES.allSupported, BACKEND);

      assert.equal(gap.summary.required.supported, BACKEND.requiredSkills.length);
      assert.equal(gap.summary.required.missing, 0);
      assert.equal(gap.summary.required.claimed, 0);
      assert.equal(gap.summary.required.verified, 0);

      for (const reqSkillName of BACKEND.requiredSkills) {
        const skill = find(gap, reqSkillName);
        assert.equal(skill.status, GAP_STATUS.SUPPORTED);
        assert.match(skill.reason, /concrete work/);
        // Supported skills only suggest assessment to reach verified
        assert.equal(skill.suggestedEvidence.length, 1);
        assert.equal(skill.suggestedEvidence[0].type, 'assessment');
        assert.equal(skill.suggestedEvidence[0].wouldReach, GAP_STATUS.VERIFIED);
      }
    });

    it('reports all skills as verified when independently proven', () => {
      const gap = computeSkillGap(SKILL_GAP_FIXTURES.allVerified, BACKEND);

      assert.equal(gap.summary.required.verified, BACKEND.requiredSkills.length);
      assert.equal(gap.summary.required.missing, 0);
      assert.equal(gap.summary.required.claimed, 0);
      assert.equal(gap.summary.required.supported, 0);

      for (const reqSkillName of BACKEND.requiredSkills) {
        const skill = find(gap, reqSkillName);
        assert.equal(skill.status, GAP_STATUS.VERIFIED);
        assert.match(skill.reason, /independently checked/);
        assert.deepEqual(skill.suggestedEvidence, []);
      }
    });
  });

  // =========================================================================
  // 2. Requirements & Role Integrity
  // =========================================================================
  describe('2. Requirements & Role Classification', () => {
    it('properly classifies required vs preferred skills across all 10 catalogue roles', () => {
      for (const role of CAREER_ROLES) {
        const gap = computeSkillGap({ skills: [] }, role);

        assert.equal(gap.roleId, role.id);
        assert.equal(gap.roleTitle, role.title);
        assert.equal(gap.summary.required.total, role.requiredSkills.length);
        assert.equal(gap.summary.preferred.total, role.preferredSkills.length);

        const requiredInGap = gap.skills.filter((s) => s.importance === GAP_IMPORTANCE.REQUIRED);
        const preferredInGap = gap.skills.filter((s) => s.importance === GAP_IMPORTANCE.PREFERRED);

        assert.equal(requiredInGap.length, role.requiredSkills.length);
        assert.equal(preferredInGap.length, role.preferredSkills.length);
      }
    });

    it('handles mixed requirements coverage accurately', () => {
      const gap = computeSkillGap(SKILL_GAP_FIXTURES.mixedRequirements, BACKEND);

      assert.equal(gap.summary.required.verified, 1); // JavaScript
      assert.equal(gap.summary.required.supported, 1); // Node.js
      assert.equal(gap.summary.required.claimed, 1); // SQL
      assert.equal(gap.summary.required.missing, 1); // REST APIs

      assert.equal(gap.summary.preferred.supported, 1); // Docker
      assert.equal(gap.summary.preferred.claimed, 1); // MongoDB
      assert.equal(gap.summary.preferred.missing, 4); // Express.js, PostgreSQL, Redis, Git
      assert.equal(gap.summary.preferred.total, 6);
    });

    it('deduplicates duplicate mentions of skills in custom role definitions', () => {
      const customRole = {
        id: 'custom-dev',
        title: 'Custom Dev',
        requiredSkills: ['Node.js', 'NodeJS', 'node', 'SQL'],
        preferredSkills: ['Node.js', 'Docker', 'docker'],
      };

      const gap = computeSkillGap(SKILL_GAP_FIXTURES.allClaimed, customRole);

      // Node.js should appear exactly once (as required), SQL once, Docker once (as preferred)
      const nodeOccurrences = gap.skills.filter((s) => s.key === skillKey('Node.js'));
      assert.equal(nodeOccurrences.length, 1);
      assert.equal(nodeOccurrences[0].importance, GAP_IMPORTANCE.REQUIRED);

      const dockerOccurrences = gap.skills.filter((s) => s.key === skillKey('Docker'));
      assert.equal(dockerOccurrences.length, 1);
      assert.equal(dockerOccurrences[0].importance, GAP_IMPORTANCE.PREFERRED);
    });

    it('safely handles null, undefined, or missing role properties', () => {
      const gapNullRole = computeSkillGap({ skills: [] }, null);
      assert.equal(gapNullRole.roleId, null);
      assert.equal(gapNullRole.skills.length, 0);
      assert.equal(gapNullRole.summary.required.total, 0);

      const gapEmptyRole = computeSkillGap({ skills: [] }, {});
      assert.equal(gapEmptyRole.roleId, null);
      assert.equal(gapEmptyRole.skills.length, 0);
    });

    it('safely handles null, undefined, or malformed twin', () => {
      const gapNull = computeSkillGap(null, BACKEND);
      assert.equal(gapNull.roleId, BACKEND.id);
      assert.equal(gapNull.summary.required.missing, BACKEND.requiredSkills.length);

      const gapUndefined = computeSkillGap(undefined, BACKEND);
      assert.equal(gapUndefined.summary.required.missing, BACKEND.requiredSkills.length);

      const gapPrimitive = computeSkillGap('not-an-object', BACKEND);
      assert.equal(gapPrimitive.summary.required.missing, BACKEND.requiredSkills.length);
    });
  });

  // =========================================================================
  // 3. Normalization & Canonical Keys
  // =========================================================================
  describe('3. Normalization & Canonical Key Resolution', () => {
    it('normalizes skill aliases correctly against catalogue requirements', () => {
      const twin = {
        skills: [
          { name: 'ecmascript', strength: 'supported' }, // JavaScript
          { name: 'nodejs', strength: 'claimed' }, // Node.js
          { name: 'psql', strength: 'verified' }, // PostgreSQL
          { name: 'restful', strength: 'supported' }, // REST APIs
          { name: 'py', strength: 'claimed' }, // Python
        ],
      };

      const backendGap = computeSkillGap(twin, BACKEND);
      const js = find(backendGap, 'JavaScript');
      const node = find(backendGap, 'Node.js');
      const rest = find(backendGap, 'REST APIs');

      assert.equal(js.status, GAP_STATUS.SUPPORTED);
      assert.equal(js.yourSkill, 'ecmascript');
      assert.equal(node.status, GAP_STATUS.CLAIMED);
      assert.equal(node.yourSkill, 'nodejs');
      assert.equal(rest.status, GAP_STATUS.SUPPORTED);
      assert.equal(rest.yourSkill, 'restful');

      const dsGap = computeSkillGap(twin, DATA_SCIENTIST);
      const python = find(dsGap, 'Python');
      assert.equal(python.status, GAP_STATUS.CLAIMED);
      assert.equal(python.yourSkill, 'py');
    });

    it('resolves skill key from skill.name when skill.key is omitted in twin', () => {
      const twin = {
        skills: [
          { name: 'JavaScript', strength: 'verified' },
          { name: 'Node.js', strength: 'supported' },
        ],
      };

      const gap = computeSkillGap(twin, BACKEND);
      assert.equal(find(gap, 'JavaScript').status, GAP_STATUS.VERIFIED);
      assert.equal(find(gap, 'Node.js').status, GAP_STATUS.SUPPORTED);
    });

    it('normalizes casing, whitespace, and special characters (+, #, .)', () => {
      assert.ok(isSameSkill('C++', 'c++'));
      assert.ok(isSameSkill('C#', 'c#'));
      assert.ok(isSameSkill('.NET', 'dotnet'));
      assert.ok(isSameSkill('Node.js', 'NODE JS'));
      assert.ok(isSameSkill('CI/CD', 'cicd'));
      assert.ok(isSameSkill('Data Structures and Algorithms', 'dsa'));
    });
  });

  // =========================================================================
  // 4. Priority Ordering & Deterministic Stability
  // =========================================================================
  describe('4. Priority Ordering & Deterministic Stability', () => {
    it('enforces the exact 6 priority tiers with verified skills last', () => {
      const gap = computeSkillGap(SKILL_GAP_FIXTURES.priorityCoverage, BACKEND);

      const orderedPairs = gap.skills.map((s) => `${s.importance}:${s.status}`);

      // Tier 1: required:missing
      const firstReqMissing = orderedPairs.indexOf('required:missing');
      // Tier 2: required:claimed
      const firstReqClaimed = orderedPairs.indexOf('required:claimed');
      // Tier 3: preferred:missing
      const firstPrefMissing = orderedPairs.indexOf('preferred:missing');
      // Tier 4: required:supported
      const firstReqSupported = orderedPairs.indexOf('required:supported');
      // Tier 5: preferred:claimed
      const firstPrefClaimed = orderedPairs.indexOf('preferred:claimed');
      // Tier 6: preferred:supported
      const firstPrefSupported = orderedPairs.indexOf('preferred:supported');
      // Tier 7+: verified
      const firstVerified = orderedPairs.indexOf('required:verified');

      assert.ok(firstReqMissing !== -1 && firstReqClaimed !== -1);
      assert.ok(firstReqMissing < firstReqClaimed, 'required:missing must precede required:claimed');
      assert.ok(firstReqClaimed < firstPrefMissing, 'required:claimed must precede preferred:missing');
      assert.ok(firstPrefMissing < firstReqSupported, 'preferred:missing must precede required:supported');
      assert.ok(firstReqSupported < firstPrefClaimed, 'required:supported must precede preferred:claimed');
      assert.ok(firstPrefClaimed < firstPrefSupported, 'preferred:claimed must precede preferred:supported');
      assert.ok(firstPrefSupported < firstVerified, 'preferred:supported must precede verified');
    });

    it('breaks ties deterministically by English skill name and canonical key', () => {
      const role = {
        id: 'test-role',
        title: 'Test Role',
        requiredSkills: ['SQL', 'CSS', 'HTML'],
        preferredSkills: [],
      };

      const gap = computeSkillGap({ skills: [] }, role);
      const names = gap.skills.map((s) => s.name);

      // All 3 are required:missing, so they must sort alphabetically: CSS, HTML, SQL
      assert.deepEqual(names, ['CSS', 'HTML', 'SQL']);
    });

    it('produces identical output regardless of twin.skills array permutation', () => {
      const skillsA = [
        { name: 'JavaScript', strength: 'claimed' },
        { name: 'Node.js', strength: 'supported' },
        { name: 'SQL', strength: 'verified' },
      ];
      const skillsB = [
        { name: 'SQL', strength: 'verified' },
        { name: 'JavaScript', strength: 'claimed' },
        { name: 'Node.js', strength: 'supported' },
      ];

      const gapA = computeSkillGap({ skills: skillsA }, BACKEND);
      const gapB = computeSkillGap({ skills: skillsB }, BACKEND);

      assert.deepEqual(gapA, gapB);
    });
  });

  // =========================================================================
  // 5. Duplicate Handling & Strength Credit Progression
  // =========================================================================
  describe('5. Duplicate Handling & Strength Credit Progression', () => {
    it('always preserves the highest evidence strength when twin contains duplicate skills', () => {
      const gap = computeSkillGap(SKILL_GAP_FIXTURES.duplicateSkills, BACKEND);

      const node = find(gap, 'Node.js');
      const sql = find(gap, 'SQL');
      const js = find(gap, 'JavaScript');

      // Node.js has claimed and verified -> verified must win
      assert.equal(node.status, GAP_STATUS.VERIFIED);
      // SQL has supported and claimed -> supported must win
      assert.equal(sql.status, GAP_STATUS.SUPPORTED);
      // JavaScript has claimed and supported -> supported must win
      assert.equal(js.status, GAP_STATUS.SUPPORTED);
    });

    it('does not downgrade a verified skill if a claimed duplicate appears after it', () => {
      const twin = {
        skills: [
          { name: 'Node.js', strength: 'verified' },
          { name: 'Node.js', strength: 'claimed' },
        ],
      };

      const gap = computeSkillGap(twin, BACKEND);
      assert.equal(find(gap, 'Node.js').status, GAP_STATUS.VERIFIED);
    });
  });

  // =========================================================================
  // 6. Missing Evidence, Malformed Payloads & Additional Skills
  // =========================================================================
  describe('6. Missing Evidence, Malformed Payloads & Additional Skills', () => {
    it('safely handles missing evidence array, null evidence items, or malformed entries', () => {
      const gap = computeSkillGap(SKILL_GAP_FIXTURES.malformedAndMissingEvidence, BACKEND);

      const node = find(gap, 'Node.js');
      const sql = find(gap, 'SQL');
      const js = find(gap, 'JavaScript');

      assert.equal(node.status, GAP_STATUS.CLAIMED);
      assert.deepEqual(node.evidence, []);

      assert.equal(sql.status, GAP_STATUS.SUPPORTED);
      assert.equal(sql.evidence.length, 1);

      assert.equal(js.status, GAP_STATUS.VERIFIED);
      assert.deepEqual(js.evidence, []);
    });

    it('isolates unsupported and extra skills into additionalSkills cleanly', () => {
      const gap = computeSkillGap(SKILL_GAP_FIXTURES.extraSkillsOnly, BACKEND);

      assert.equal(gap.summary.required.missing, BACKEND.requiredSkills.length);
      assert.equal(gap.additionalSkills.length, 3);

      const additionalNames = gap.additionalSkills.map((s) => s.name);
      assert.ok(additionalNames.includes('Figma'));
      assert.ok(additionalNames.includes('UI Design'));
      assert.ok(additionalNames.includes('Flutter'));
    });

    it('deduplicates additionalSkills and preserves highest strength', () => {
      const twin = {
        skills: [
          { name: 'Figma', strength: 'claimed' },
          { name: 'Figma', strength: 'supported' },
          { name: 'Blender', strength: 'claimed' },
        ],
      };

      const gap = computeSkillGap(twin, BACKEND);
      assert.equal(gap.additionalSkills.length, 2);

      const figma = gap.additionalSkills.find((s) => s.name === 'Figma');
      assert.equal(figma.strength, 'supported');
    });

    it('never invents readiness scores, percentages, or fabricated metrics in summary', () => {
      const gap = computeSkillGap(SKILL_GAP_FIXTURES.mixedRequirements, BACKEND);

      const summaryStr = JSON.stringify(gap.summary).toLowerCase();
      assert.ok(!summaryStr.includes('percent'));
      assert.ok(!summaryStr.includes('score'));
      assert.ok(!summaryStr.includes('readiness'));
      assert.ok(!summaryStr.includes('grade'));
    });
  });
});
