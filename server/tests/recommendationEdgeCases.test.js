import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAREER_ROLES,
  findRole,
} from '../src/domain/careers/roleCatalogue.js';
import { rankRoles, scoreRoleMatch } from '../src/domain/careers/matchRole.js';
import {
  DIMENSION_WEIGHTS,
  MINIMUM_RECOMMENDABLE_SCORE,
  STRENGTH_CREDIT,
  bandFor,
} from '../src/domain/careers/scoring.js';
import { skillKey } from '../src/domain/skills/skillKey.js';

const BACKEND = findRole('backend-developer');
const FRONTEND = findRole('frontend-developer');
const UI_UX = findRole('ui-ux-designer');
const DATA_ANALYST = findRole('data-analyst');

describe('TASK A16 — Recommendation Edge Cases & Deterministic Stability Suite', () => {
  // =========================================================================
  // 1. Empty and Sparse Profiles
  // =========================================================================
  describe('1. Empty and Sparse Profiles', () => {
    it('handles null or undefined twin safely without throwing TypeError', () => {
      const matchNull = scoreRoleMatch(null, BACKEND);
      assert.ok(matchNull);
      assert.equal(matchNull.dimensions.requiredSkills.value, 0);
      assert.equal(matchNull.dimensions.preferredSkills.value, 0);
      assert.equal(matchNull.dimensions.evidenceStrength.value, 0);
      assert.equal(matchNull.dimensions.interestAlignment.value, 0);
      assert.equal(matchNull.dimensions.backgroundAlignment.value, 50); // neutral 0.5
      assert.ok(matchNull.score < MINIMUM_RECOMMENDABLE_SCORE);

      const rankedNull = rankRoles(null);
      assert.deepEqual(rankedNull.matches, []);

      const matchUndefined = scoreRoleMatch(undefined, BACKEND);
      assert.ok(matchUndefined);
      assert.equal(matchUndefined.score, matchNull.score);

      const rankedUndefined = rankRoles(undefined);
      assert.deepEqual(rankedUndefined.matches, []);
    });

    it('returns empty matches array for profile with zero skills', () => {
      const emptyTwin = {
        skills: [],
        interests: [],
        targetRoles: [],
        academic: null,
      };

      const result = rankRoles(emptyTwin);
      assert.deepEqual(result.matches, []);
    });

    it('does not recommend roles for a profile with only academic info', () => {
      const academicOnlyTwin = {
        skills: [],
        interests: [],
        targetRoles: [],
        academic: { branch: 'Computer Science and Engineering' },
      };

      // Background alignment is worth 5%. 5% < 20% threshold.
      const match = scoreRoleMatch(academicOnlyTwin, BACKEND);
      assert.equal(match.dimensions.backgroundAlignment.value, 100);
      assert.equal(match.score, 5);
      assert.equal(match.band, 'exploratory');

      const result = rankRoles(academicOnlyTwin);
      assert.deepEqual(result.matches, []);
    });

    it('does not recommend roles for a profile with only stated target role or interests', () => {
      const targetOnlyTwin = {
        skills: [],
        interests: ['REST APIs', 'Node.js'],
        targetRoles: [{ title: 'Backend Developer', origin: 'student' }],
        academic: null,
      };

      // Target role (10%) + neutral background (2.5%) = 12.5% -> round to 13%.
      // 13 < 20 threshold -> no recommendations without skills.
      const match = scoreRoleMatch(targetOnlyTwin, BACKEND);
      assert.equal(match.dimensions.interestAlignment.value, 100);
      assert.equal(match.score, 13);
      assert.equal(match.band, 'exploratory');

      const result = rankRoles(targetOnlyTwin);
      assert.deepEqual(result.matches, []);
    });

    it('exposes sub-threshold matches when includeBelowThreshold is true', () => {
      const emptyTwin = { skills: [], interests: [], targetRoles: [], academic: null };
      const result = rankRoles(emptyTwin, { includeBelowThreshold: true, limit: 10 });

      assert.equal(result.matches.length, CAREER_ROLES.length);
      for (const match of result.matches) {
        assert.ok(match.score < MINIMUM_RECOMMENDABLE_SCORE);
        assert.equal(match.band, 'exploratory');
      }
    });
  });

  // =========================================================================
  // 2. Conflicting Interests & Multi-Disciplinary Targets
  // =========================================================================
  describe('2. Conflicting Interests & Multi-Disciplinary Targets', () => {
    it('ranks concrete backend skills first even when student target role is Frontend Developer', () => {
      const twin = {
        skills: [
          { key: 'javascript', name: 'JavaScript', strength: 'supported' },
          { key: 'nodejs', name: 'Node.js', strength: 'supported' },
          { key: 'restapis', name: 'REST APIs', strength: 'supported' },
          { key: 'sql', name: 'SQL', strength: 'supported' },
        ],
        targetRoles: [{ title: 'Frontend Developer', origin: 'student' }],
        interests: ['CSS', 'HTML'],
        academic: null,
      };

      const ranked = rankRoles(twin);
      assert.ok(ranked.matches.length > 0);
      assert.equal(ranked.matches[0].roleId, 'backend-developer');
      assert.ok(ranked.matches[0].score >= 50);

      const backendMatch = scoreRoleMatch(twin, BACKEND);
      assert.equal(backendMatch.dimensions.requiredSkills.value, 100);
      assert.equal(backendMatch.dimensions.interestAlignment.value, 0); // No backend interest stated
    });

    it('ranks UI/UX Designer first when skills match design even if target role is Data Scientist', () => {
      const twin = {
        skills: [
          { key: 'uidesign', name: 'UI Design', strength: 'supported' },
          { key: 'uxresearch', name: 'UX Research', strength: 'supported' },
          { key: 'figma', name: 'Figma', strength: 'supported' },
        ],
        targetRoles: [{ title: 'Data Scientist', origin: 'student' }],
        interests: ['Machine Learning'],
        academic: null,
      };

      const ranked = rankRoles(twin);
      assert.ok(ranked.matches.length > 0);
      assert.equal(ranked.matches[0].roleId, 'ui-ux-designer');
    });

    it('evaluates multiple target roles without overcounting or exceeding 10% interest score', () => {
      const twin = {
        skills: [
          { key: 'javascript', name: 'JavaScript', strength: 'supported' },
          { key: 'nodejs', name: 'Node.js', strength: 'supported' },
        ],
        targetRoles: [
          { title: 'Backend Developer', origin: 'student' },
          { title: 'Backend Engineer', origin: 'student' },
          { title: 'Data Analyst', origin: 'student' },
        ],
        interests: ['Node.js', 'SQL', 'Databases'],
      };

      const match = scoreRoleMatch(twin, BACKEND);
      // Interest score capped at 1.0 (100% dimension value)
      assert.equal(match.dimensions.interestAlignment.value, 100);
    });

    it('filters generic job title words so they do not falsely align with every role', () => {
      const genericTwin = {
        skills: [{ key: 'javascript', name: 'JavaScript', strength: 'supported' }],
        targetRoles: [
          { title: 'Junior Associate Software Application Engineer', origin: 'student' },
        ],
      };

      // Generic title words should not trigger interest alignment for Backend Developer
      const match = scoreRoleMatch(genericTwin, BACKEND);
      assert.equal(match.dimensions.interestAlignment.value, 0);
    });
  });

  // =========================================================================
  // 3. Missing Evidence & Malformed Payloads
  // =========================================================================
  describe('3. Missing Evidence & Malformed Payloads', () => {
    it('handles skills with missing, null, or empty evidence array without throwing', () => {
      const twinWithEmptyEvidence = {
        skills: [
          { key: 'javascript', name: 'JavaScript', strength: 'supported', evidence: [] },
          { key: 'nodejs', name: 'Node.js', strength: 'supported', evidence: null },
          { key: 'sql', name: 'SQL', strength: 'supported', evidence: undefined },
          { key: 'restapis', name: 'REST APIs', strength: 'claimed' }, // evidence field omitted
        ],
      };

      const match = scoreRoleMatch(twinWithEmptyEvidence, BACKEND);
      assert.equal(match.matchedRequired.length, 4);
      assert.deepEqual(match.evidence, []);
    });

    it('tolerates malformed evidence items (nulls, empty objects, missing details)', () => {
      const twinWithMalformedEvidence = {
        skills: [
          {
            key: 'nodejs',
            name: 'Node.js',
            strength: 'supported',
            evidence: [
              null,
              undefined,
              {},
              { source: 'project', detail: null, reference: null },
              { source: 'project', detail: 'Real Project', reference: 'proj_1' },
            ],
          },
        ],
      };

      const match = scoreRoleMatch(twinWithMalformedEvidence, BACKEND);
      assert.ok(match);
      assert.ok(match.evidence.length >= 1);
      assert.equal(match.evidence.find((e) => e.reference === 'proj_1')?.detail, 'Real Project');
    });

    it('handles unrecognized skill strength by defaulting credit to 0 and sorting safely', () => {
      const twinWithBadStrength = {
        skills: [
          { key: 'javascript', name: 'JavaScript', strength: 'god-mode-expert' },
          { key: 'nodejs', name: 'Node.js', strength: 'verified' },
        ],
      };

      const match = scoreRoleMatch(twinWithBadStrength, BACKEND);
      // 'god-mode-expert' credit = 0; verified credit = 1.0. Average = (0 + 1.0) / 2 = 0.5 -> 50%
      assert.equal(match.dimensions.evidenceStrength.value, 50);
    });
  });

  // =========================================================================
  // 4. Duplicate Handling & Invariant Deduplication
  // =========================================================================
  describe('4. Duplicate Handling & Invariant Deduplication', () => {
    it('preserves the strongest evidence strength when twin contains duplicate skills', () => {
      // 1. Weak first, strong second
      const twinWeakFirst = {
        skills: [
          { key: 'nodejs', name: 'Node.js', strength: 'claimed', sourceCount: 1 },
          { key: 'nodejs', name: 'Node.js', strength: 'verified', sourceCount: 3 },
        ],
      };
      const matchWeakFirst = scoreRoleMatch(twinWeakFirst, BACKEND);
      const nodeWeakFirst = matchWeakFirst.matchedRequired.find((m) => m.name === 'Node.js');
      assert.equal(nodeWeakFirst.strength, 'verified');

      // 2. Strong first, weak second
      const twinStrongFirst = {
        skills: [
          { key: 'nodejs', name: 'Node.js', strength: 'verified', sourceCount: 3 },
          { key: 'nodejs', name: 'Node.js', strength: 'claimed', sourceCount: 1 },
        ],
      };
      const matchStrongFirst = scoreRoleMatch(twinStrongFirst, BACKEND);
      const nodeStrongFirst = matchStrongFirst.matchedRequired.find((m) => m.name === 'Node.js');
      assert.equal(nodeStrongFirst.strength, 'verified');

      // Both orders must produce identical evidence strength dimension and overall score
      assert.equal(matchWeakFirst.score, matchStrongFirst.score);
      assert.equal(
        matchWeakFirst.dimensions.evidenceStrength.value,
        matchStrongFirst.dimensions.evidenceStrength.value,
      );
    });

    it('resolves skill key from skill.name when skill.key is omitted', () => {
      const twinWithoutKey = {
        skills: [
          { name: 'Node.js', strength: 'supported' }, // key omitted
          { name: 'JavaScript', strength: 'supported' }, // key omitted
        ],
      };

      const match = scoreRoleMatch(twinWithoutKey, BACKEND);
      assert.equal(match.matchedRequired.length, 2);
      assert.ok(match.matchedRequired.some((m) => m.name === 'Node.js'));
      assert.ok(match.matchedRequired.some((m) => m.name === 'JavaScript'));
    });

    it('deduplicates skill names when single evidence reference backs multiple skills', () => {
      const twin = {
        skills: [
          {
            key: 'javascript',
            name: 'JavaScript',
            strength: 'supported',
            evidence: [{ source: 'project', reference: 'proj_common', detail: 'Common Project' }],
          },
          {
            key: 'nodejs',
            name: 'Node.js',
            strength: 'supported',
            evidence: [{ source: 'project', reference: 'proj_common', detail: 'Common Project' }],
          },
          {
            key: 'javascript', // Duplicate skill entry with same evidence
            name: 'JavaScript',
            strength: 'supported',
            evidence: [{ source: 'project', reference: 'proj_common', detail: 'Common Project' }],
          },
        ],
      };

      const match = scoreRoleMatch(twin, BACKEND);
      assert.equal(match.evidence.length, 1);
      assert.deepEqual(match.evidence[0].skills.sort(), ['JavaScript', 'Node.js']);
    });

    it('deduplicates duplicate interests without overcounting interest alignment', () => {
      const twin = {
        skills: [{ key: 'javascript', name: 'JavaScript', strength: 'supported' }],
        interests: ['UI Design', 'UI Design', 'ui design', 'UI Design'],
      };

      const match = scoreRoleMatch(twin, UI_UX);
      // Interest matches UI Design, exactly 0.5 (50%), no overcounting
      assert.equal(match.dimensions.interestAlignment.value, 50);
    });
  });

  // =========================================================================
  // 5. Unsupported Skills & Cross-Domain Isolation
  // =========================================================================
  describe('5. Unsupported Skills & Cross-Domain Isolation', () => {
    it('ignores completely unsupported non-catalogue skills without distorting recommendations', () => {
      const unrelatedTwin = {
        skills: [
          { key: 'knitting', name: 'Knitting', strength: 'verified' },
          { key: 'pottery', name: 'Pottery', strength: 'verified' },
          { key: 'woodworking', name: 'Woodworking', strength: 'verified' },
        ],
      };

      const result = rankRoles(unrelatedTwin);
      assert.deepEqual(result.matches, [], 'Unrelated non-tech skills must not match any tech role');

      const match = scoreRoleMatch(unrelatedTwin, BACKEND);
      assert.equal(match.matchedRequired.length, 0);
      assert.equal(match.matchedPreferred.length, 0);
      assert.equal(match.dimensions.requiredSkills.value, 0);
      assert.equal(match.dimensions.preferredSkills.value, 0);
      assert.equal(match.dimensions.evidenceStrength.value, 0);
    });

    it('correctly scores candidate with a mixture of supported and unsupported skills', () => {
      const mixedTwin = {
        skills: [
          { key: 'javascript', name: 'JavaScript', strength: 'supported' },
          { key: 'nodejs', name: 'Node.js', strength: 'supported' },
          { key: 'knitting', name: 'Knitting', strength: 'verified' }, // unsupported
          { key: 'ancientgreek', name: 'Ancient Greek', strength: 'verified' }, // unsupported
        ],
      };

      const match = scoreRoleMatch(mixedTwin, BACKEND);
      assert.equal(match.matchedRequired.length, 2);
      assert.equal(match.dimensions.requiredSkills.value, 50); // 2 of 4 required
      // Evidence score only calculated over matched skills (JavaScript & Node.js: 0.8 + 0.8 / 2 = 0.8 -> 80%)
      assert.equal(match.dimensions.evidenceStrength.value, 80);
    });

    it('skips malformed or primitive entries in twin.skills safely', () => {
      const messyTwin = {
        skills: [
          null,
          undefined,
          'not-an-object',
          42,
          {},
          { key: '' },
          { key: 'nodejs', name: 'Node.js', strength: 'supported' },
        ],
      };

      const match = scoreRoleMatch(messyTwin, BACKEND);
      assert.ok(match);
      assert.equal(match.matchedRequired.length, 1);
      assert.equal(match.matchedRequired[0].name, 'Node.js');
    });
  });

  // =========================================================================
  // 6. Deterministic Tie-Breaking & Stability
  // =========================================================================
  describe('6. Deterministic Tie-Breaking & Stability', () => {
    it('breaks ties deterministically by title in alphabetical order', () => {
      // Holding only SQL yields identical score (30) for:
      // - Backend Developer (1 of 4 required)
      // - Data Scientist (1 of 4 required)
      // - Full Stack Developer (1 of 4 required)
      const sqlOnlyTwin = {
        skills: [{ key: 'sql', name: 'SQL', strength: 'supported' }],
        interests: [],
        targetRoles: [],
        academic: null,
      };

      const ranked = rankRoles(sqlOnlyTwin, { includeBelowThreshold: true, limit: 10 });
      const tiedScores = ranked.matches.filter((m) => m.score === 30);
      assert.ok(tiedScores.length >= 3, 'Expected at least 3 tied roles at score 30');

      // Verify that tied roles are ordered alphabetically by title
      const titles = tiedScores.map((m) => m.title);
      const sortedTitles = [...titles].sort((a, b) => a.localeCompare(b, 'en'));
      assert.deepEqual(titles, sortedTitles, 'Tied roles must be ordered alphabetically by title');

      assert.equal(tiedScores[0].roleId, 'backend-developer');
      assert.equal(tiedScores[1].roleId, 'data-scientist');
      assert.equal(tiedScores[2].roleId, 'full-stack-developer');
    });

    it('produces identical ranking output regardless of twin.skills array order', () => {
      const skillsA = [
        { key: 'sql', name: 'SQL', strength: 'supported' },
        { key: 'nodejs', name: 'Node.js', strength: 'supported' },
        { key: 'javascript', name: 'JavaScript', strength: 'supported' },
        { key: 'restapis', name: 'REST APIs', strength: 'supported' },
      ];

      const skillsB = [
        { key: 'restapis', name: 'REST APIs', strength: 'supported' },
        { key: 'javascript', name: 'JavaScript', strength: 'supported' },
        { key: 'sql', name: 'SQL', strength: 'supported' },
        { key: 'nodejs', name: 'Node.js', strength: 'supported' },
      ];

      const rankA = rankRoles({ skills: skillsA });
      const rankB = rankRoles({ skills: skillsB });

      assert.deepEqual(
        rankA.matches.map((m) => ({ id: m.roleId, score: m.score })),
        rankB.matches.map((m) => ({ id: m.roleId, score: m.score })),
      );
    });

    it('returns consistent prefixes when limit parameter is varied', () => {
      const twin = {
        skills: [
          { key: 'sql', name: 'SQL', strength: 'supported' },
          { key: 'nodejs', name: 'Node.js', strength: 'supported' },
          { key: 'javascript', name: 'JavaScript', strength: 'supported' },
          { key: 'restapis', name: 'REST APIs', strength: 'supported' },
        ],
      };

      const top5 = rankRoles(twin, { limit: 5 }).matches;
      const top3 = rankRoles(twin, { limit: 3 }).matches;
      const top1 = rankRoles(twin, { limit: 1 }).matches;

      assert.equal(top1[0].roleId, top5[0].roleId);
      assert.deepEqual(
        top3.map((m) => m.roleId),
        top5.slice(0, 3).map((m) => m.roleId),
      );
    });
  });
});
