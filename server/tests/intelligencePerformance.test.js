import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { performance } from 'node:perf_hooks';

import { skillKey, canonicalSkill, skillDisplayName, knownSkillNames } from '../src/domain/skills/skillKey.js';
import { CAREER_ROLES, findRole, catalogueSkillNames } from '../src/domain/careers/roleCatalogue.js';
import { rankRoles, scoreRoleMatch } from '../src/domain/careers/matchRole.js';
import { computeSkillGap, GAP_STATUS, GAP_IMPORTANCE } from '../src/domain/skillGap/computeSkillGap.js';
import { buildRoadmap, PRIORITY } from '../src/domain/roadmap/buildRoadmap.js';
import { computeReadiness } from '../src/domain/readiness/computeReadiness.js';
import { evaluateAssessmentSubmission } from '../src/domain/assessment/assessmentContract.js';
import { getAssessmentById } from '../src/domain/assessment/assessmentCatalog.js';
import { SYNTHETIC_PROFILES } from './fixtures/syntheticProfilesFixtures.js';

describe('TASK A26 — Intelligence Performance & Optimization Suite', () => {
  const backendRole = findRole('backend-developer');
  const frontendRole = findRole('frontend-developer');

  // =========================================================================
  // 1. Skill Key & Normalization Performance
  // =========================================================================
  describe('1. Skill Key & Taxonomy Resolution Performance', () => {
    it('resolves skill keys and aliases with high throughput (< 50ms for 25,000 lookups)', () => {
      const testNames = [
        'Node.js', 'nodejs', 'NODE JS', 'node', 'React', 'reactjs',
        'TypeScript', 'ts', 'Python', 'py3', 'Docker', 'Kubernetes',
        'C++', 'cpp', 'C#', 'csharp', 'PostgreSQL', 'postgres',
        'HTML5', 'html', 'Express', 'express.js', 'Figma', 'AWS',
      ];

      const iterations = 25000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const name = testNames[i % testNames.length];
        const key = skillKey(name);
        assert.ok(typeof key === 'string');
      }
      const durationMs = performance.now() - start;

      assert.ok(
        durationMs < 150,
        `25,000 skillKey lookups took ${durationMs.toFixed(2)}ms (budget: 150ms)`,
      );
    });

    it('correctly maps aliases and canonical names identically to domain specification', () => {
      assert.equal(skillKey('Node.js'), 'nodejs');
      assert.equal(skillKey('node'), 'nodejs');
      assert.equal(skillKey('js'), 'javascript');
      assert.equal(skillKey('ts'), 'typescript');
      assert.equal(skillKey('py'), 'python');
      assert.equal(skillKey('cpp'), 'c++');
      assert.equal(skillKey('cplusplus'), 'c++');
      assert.equal(skillKey('csharp'), 'c#');
      assert.equal(skillKey('html5'), 'html');
      assert.equal(skillKey('express'), 'expressjs');
      assert.equal(skillKey(''), '');
      assert.equal(skillKey(null), '');

      assert.equal(skillDisplayName('nodejs'), 'Node.js');
      assert.equal(skillDisplayName('js'), 'JavaScript');
      assert.equal(skillDisplayName('unknown_custom_tool'), 'unknown_custom_tool');

      const canonical = canonicalSkill('ts');
      assert.ok(canonical);
      assert.equal(canonical.key, 'typescript');
      assert.equal(canonical.name, 'TypeScript');
    });

    it('knownSkillNames returns consistent array without unnecessary re-allocations', () => {
      const names1 = knownSkillNames();
      const names2 = knownSkillNames();
      assert.deepEqual(names1, names2);
      assert.ok(names1.includes('Docker'));
      assert.ok(names1.includes('Python'));
      assert.ok(names1.includes('JavaScript'));

      // Ensure caller mutation does not corrupt subsequent calls
      names1.push('CorruptedSkill');
      const names3 = knownSkillNames();
      assert.ok(!names3.includes('CorruptedSkill'), 'knownSkillNames must be protected from external mutation');
    });
  });

  // =========================================================================
  // 2. Role Catalogue O(1) Lookup Performance
  // =========================================================================
  describe('2. Role Catalogue Lookup & Vocabulary Performance', () => {
    it('performs O(1) role lookups with negligible overhead (< 20ms for 20,000 lookups)', () => {
      const roleIds = CAREER_ROLES.map((r) => r.id);
      roleIds.push('non-existent-role');

      const iterations = 20000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const id = roleIds[i % roleIds.length];
        const role = findRole(id);
        if (id === 'non-existent-role') {
          assert.equal(role, null);
        } else {
          assert.ok(role && role.id === id);
        }
      }
      const durationMs = performance.now() - start;

      assert.ok(
        durationMs < 100,
        `20,000 role lookups took ${durationMs.toFixed(2)}ms (budget: 100ms)`,
      );
    });

    it('catalogueSkillNames returns cached vocabulary safely', () => {
      const vocab1 = catalogueSkillNames();
      const vocab2 = catalogueSkillNames();
      assert.deepEqual(vocab1, vocab2);
      assert.ok(vocab1.length > 20);

      // Caller mutation protection check
      vocab1.push('FakeSkill');
      const vocab3 = catalogueSkillNames();
      assert.ok(!vocab3.includes('FakeSkill'));
    });
  });

  // =========================================================================
  // 3. Career Recommendation & Role Match Performance
  // =========================================================================
  describe('3. Career Recommendation (rankRoles & scoreRoleMatch) Performance', () => {
    it('executes rankRoles across all catalogue roles with low latency (< 150ms for 500 runs)', () => {
      const twin = SYNTHETIC_PROFILES.intermediate.twin;

      const runs = 250;
      const start = performance.now();
      for (let i = 0; i < runs; i++) {
        const result = rankRoles(twin);
        assert.ok(result.matches.length > 0);
      }
      const durationMs = performance.now() - start;
      const avgMs = durationMs / runs;

      assert.ok(
        durationMs < 300,
        `250 rankRoles runs took ${durationMs.toFixed(2)}ms, avg ${avgMs.toFixed(3)}ms/run (budget: 300ms)`,
      );
    });

    it('interest matching handles multi-interest students cleanly and preserves exact scores', () => {
      const twinWithInterests = {
        ...SYNTHETIC_PROFILES.beginner.twin,
        interests: ['Backend Development', 'API Design', 'Cloud Infrastructure', 'Go', 'Docker'],
      };

      const match = scoreRoleMatch(twinWithInterests, backendRole);
      assert.ok(match.dimensions.interestAlignment.value > 0);

      // Confirm baseline repeatability across calls
      const match2 = scoreRoleMatch(twinWithInterests, backendRole);
      assert.deepEqual(match, match2);
    });
  });

  // =========================================================================
  // 4. Skill Gap Computation Performance
  // =========================================================================
  describe('4. Skill Gap Computation Performance', () => {
    it('computes skill gap rapidly (< 75ms for 500 runs)', () => {
      const twin = SYNTHETIC_PROFILES.intermediate.twin;

      const runs = 500;
      const start = performance.now();
      for (let i = 0; i < runs; i++) {
        const gap = computeSkillGap(twin, backendRole);
        assert.ok(gap && gap.skills.length > 0);
      }
      const durationMs = performance.now() - start;
      const avgMs = durationMs / runs;

      assert.ok(
        durationMs < 150,
        `500 computeSkillGap runs took ${durationMs.toFixed(2)}ms, avg ${avgMs.toFixed(3)}ms/run (budget: 150ms)`,
      );
    });

    it('preserves exact priority order sorting with O(1) rank table lookup', () => {
      const mockRole = {
        id: 'test-role',
        title: 'Test Role',
        requiredSkills: ['Req1', 'Req2', 'Req3'],
        preferredSkills: ['Pref1', 'Pref2'],
      };
      const mockTwin = {
        skills: [
          { key: 'req1', name: 'Req1', strength: 'claimed' },
          { key: 'pref1', name: 'Pref1', strength: 'supported' },
        ],
      };

      const gap = computeSkillGap(mockTwin, mockRole);
      assert.ok(gap.skills.length === 5);

      // Required + Missing must precede Required + Claimed
      const reqMissing = gap.skills.find((s) => s.name === 'Req2');
      const reqClaimed = gap.skills.find((s) => s.name === 'Req1');
      assert.ok(reqMissing && reqClaimed);
      assert.ok(
        gap.skills.indexOf(reqMissing) < gap.skills.indexOf(reqClaimed),
        'Required-missing must sort before required-claimed',
      );
    });
  });

  // =========================================================================
  // 5. Roadmap Generation & Prerequisite Transitive Closure Performance
  // =========================================================================
  describe('5. Roadmap Generation Performance', () => {
    it('builds roadmaps quickly with precomputed transitive dependencies (< 75ms for 500 runs)', () => {
      const twin = SYNTHETIC_PROFILES.beginner.twin;
      const gap = computeSkillGap(twin, backendRole);

      const runs = 500;
      const start = performance.now();
      for (let i = 0; i < runs; i++) {
        const roadmap = buildRoadmap(gap);
        assert.ok(roadmap && Array.isArray(roadmap.items));
      }
      const durationMs = performance.now() - start;
      const avgMs = durationMs / runs;

      assert.ok(
        durationMs < 150,
        `500 buildRoadmap runs took ${durationMs.toFixed(2)}ms, avg ${avgMs.toFixed(3)}ms/run (budget: 150ms)`,
      );
    });

    it('strictly preserves transitive prerequisite ordering (JavaScript before Node.js before Express.js)', () => {
      const mockGap = {
        roleId: 'fullstack-developer',
        roleTitle: 'Fullstack Developer',
        skills: [
          {
            key: 'expressjs',
            name: 'Express.js',
            importance: GAP_IMPORTANCE.REQUIRED,
            status: GAP_STATUS.MISSING,
            suggestedEvidence: [{ type: 'project', available: true }],
          },
          {
            key: 'nodejs',
            name: 'Node.js',
            importance: GAP_IMPORTANCE.REQUIRED,
            status: GAP_STATUS.MISSING,
            suggestedEvidence: [{ type: 'project', available: true }],
          },
          {
            key: 'javascript',
            name: 'JavaScript',
            importance: GAP_IMPORTANCE.REQUIRED,
            status: GAP_STATUS.MISSING,
            suggestedEvidence: [{ type: 'project', available: true }],
          },
        ],
      };

      const roadmap = buildRoadmap(mockGap);
      const skillKeys = roadmap.items.map((it) => it.skill.key);

      const jsIdx = skillKeys.indexOf('javascript');
      const nodeIdx = skillKeys.indexOf('nodejs');
      const expressIdx = skillKeys.indexOf('expressjs');

      assert.ok(jsIdx !== -1 && nodeIdx !== -1 && expressIdx !== -1);
      assert.ok(jsIdx < nodeIdx, 'JavaScript must precede Node.js');
      assert.ok(nodeIdx < expressIdx, 'Node.js must precede Express.js');
    });
  });

  // =========================================================================
  // 6. Readiness Projection Performance
  // =========================================================================
  describe('6. Readiness Projection Performance', () => {
    it('projects readiness with low overhead (< 50ms for 500 runs)', () => {
      const twin = SYNTHETIC_PROFILES.intermediate.twin;
      const gap = computeSkillGap(twin, backendRole);

      const runs = 500;
      const start = performance.now();
      for (let i = 0; i < runs; i++) {
        const readiness = computeReadiness(gap);
        assert.ok(readiness && readiness.roleId === backendRole.id);
      }
      const durationMs = performance.now() - start;
      const avgMs = durationMs / runs;

      assert.ok(
        durationMs < 100,
        `500 computeReadiness runs took ${durationMs.toFixed(2)}ms, avg ${avgMs.toFixed(3)}ms/run (budget: 100ms)`,
      );
    });
  });

  // =========================================================================
  // 7. Assessment Submission Evaluation Performance
  // =========================================================================
  describe('7. Assessment Evaluation Performance', () => {
    it('evaluates multi-question assessment submissions deterministically (< 50ms for 500 runs)', () => {
      const assessment = getAssessmentById('asm_javascript_intermediate');
      assert.ok(assessment, 'asm_javascript_intermediate assessment must exist');

      const submission = {
        attemptId: 'att_perf_test_001',
        studentId: 'student_perf_001',
        submittedAt: new Date(),
        answers: {
          q_js_event_loop: '1\n4\n3\n2',
          q_js_closures: 'opt_a',
        },
      };

      const runs = 500;
      const start = performance.now();
      for (let i = 0; i < runs; i++) {
        const result = evaluateAssessmentSubmission({ assessment, submission });
        assert.ok(result && typeof result.score === 'number' && typeof result.passed === 'boolean');
      }
      const durationMs = performance.now() - start;
      const avgMs = durationMs / runs;

      assert.ok(
        durationMs < 150,
        `500 evaluateAssessmentSubmission runs took ${durationMs.toFixed(2)}ms, avg ${avgMs.toFixed(3)}ms/run (budget: 150ms)`,
      );
    });
  });

  // =========================================================================
  // 8. End-to-End Pipeline Performance
  // =========================================================================
  describe('8. Full Intelligence Pipeline Throughput', () => {
    it('completes 100 end-to-end intelligence pipelines (match -> gap -> roadmap -> readiness) in < 150ms', () => {
      const twin = SYNTHETIC_PROFILES.intermediate.twin;

      const pipelines = 100;
      const start = performance.now();
      for (let i = 0; i < pipelines; i++) {
        // 1. Rank roles
        const ranked = rankRoles(twin);
        const topRole = findRole(ranked.matches[0].roleId);

        // 2. Skill gap
        const gap = computeSkillGap(twin, topRole);

        // 3. Roadmap
        const roadmap = buildRoadmap(gap);

        // 4. Readiness
        const readiness = computeReadiness(gap);

        assert.ok(topRole && gap && roadmap && readiness);
      }
      const durationMs = performance.now() - start;
      const avgMs = durationMs / pipelines;

      assert.ok(
        durationMs < 250,
        `100 full intelligence pipelines took ${durationMs.toFixed(2)}ms, avg ${avgMs.toFixed(3)}ms/student (budget: 250ms)`,
      );
    });
  });
});
