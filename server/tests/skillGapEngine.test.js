import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { findRole } from '../src/domain/careers/roleCatalogue.js';
import {
  GAP_IMPORTANCE,
  GAP_STATUS,
  SATISFACTION_STATE,
  computeSkillGap,
} from '../src/domain/skillGap/computeSkillGap.js';
import {
  clearCareerTwins,
  clearProfiles,
  clearResumes,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';

/**
 * Task 11 — Complete Skill-Gap Intelligence Engine Suite
 */

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let counter = 0;

describe('Task 11 — Complete Skill-Gap Intelligence Engine Suite', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearCareerTwins();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();
  });

  async function registerAndLogin() {
    counter += 1;
    const email = `skillgap.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Skill Gap Student',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { token: res.body.data.token };
  }

  // =========================================================================
  // 1. Proficiency Deficit & Partial Satisfaction
  // =========================================================================
  describe('1. Proficiency Deficit & Partial Satisfaction', () => {
    it('detects proficiency deficit when student level is below role expectation', () => {
      const role = findRole('backend-developer');
      // Role expects intermediate/advanced proficiency for Node.js
      const twin = {
        skills: [
          { key: 'javascript', name: 'JavaScript', strength: 'supported' },
          {
            key: 'nodejs',
            name: 'Node.js',
            strength: 'supported',
            selfDeclaredLevel: 'beginner', // Below expected
            evidence: [
              { source: 'project', strength: 'supported', detail: 'Basic hello world server' },
            ],
          },
        ],
      };

      const gap = computeSkillGap(twin, role);
      const nodeSkill = gap.skills.find((s) => s.key === 'nodejs');

      assert.ok(nodeSkill);
      assert.equal(nodeSkill.status, GAP_STATUS.SUPPORTED);
      assert.equal(nodeSkill.satisfactionState, SATISFACTION_STATE.PARTIALLY_SATISFIED);
      assert.equal(nodeSkill.proficiencyGap.hasDeficit, true);
      assert.equal(nodeSkill.proficiencyGap.actual, 'beginner');
      assert.ok(nodeSkill.actionableRemediation.includes('Deepen practical implementation'));
    });

    it('marks fully satisfied when student level meets or exceeds role expectation and prerequisites are met', () => {
      const role = findRole('backend-developer');
      const twin = {
        skills: [
          {
            key: 'javascript',
            name: 'JavaScript',
            strength: 'supported',
            selfDeclaredLevel: 'intermediate',
          },
          {
            key: 'nodejs',
            name: 'Node.js',
            strength: 'supported',
            selfDeclaredLevel: 'intermediate',
            evidence: [
              { source: 'project', strength: 'supported', detail: 'REST API backend service' },
            ],
          },
          {
            key: 'programming_fundamentals',
            name: 'Programming Fundamentals',
            strength: 'supported',
          },
        ],
      };

      const gap = computeSkillGap(twin, role);
      const nodeSkill = gap.skills.find((s) => s.key === 'nodejs');

      assert.ok(nodeSkill);
      assert.equal(nodeSkill.proficiencyGap.hasDeficit, false);
      assert.equal(nodeSkill.hasPrerequisiteBlocker, false);
      assert.equal(nodeSkill.satisfactionState, SATISFACTION_STATE.SATISFIED);
    });
  });

  // =========================================================================
  // 2. Prerequisite Gaps & Blockers
  // =========================================================================
  describe('2. Prerequisite Gaps & Blockers', () => {
    it('identifies prerequisite gaps when foundational competencies are missing', () => {
      const role = findRole('frontend-developer');
      // Student has no programming fundamentals or HTML/CSS, but role asks for React
      const twin = {
        skills: [
          {
            key: 'figma',
            name: 'Figma',
            strength: 'supported',
          },
        ],
      };

      const gap = computeSkillGap(twin, role);
      const reactSkill = gap.skills.find((s) => s.key === 'react');

      assert.ok(reactSkill);
      assert.equal(reactSkill.status, GAP_STATUS.MISSING);
      assert.equal(reactSkill.hasPrerequisiteBlocker, true);
      assert.ok(reactSkill.prerequisiteGaps.length > 0);
      assert.ok(reactSkill.actionableRemediation.includes('Fulfill foundational prerequisite'));
      assert.ok(gap.summary.prerequisiteBlockersCount > 0);
    });
  });

  // =========================================================================
  // 3. Stale Evidence & Conflicting Evidence
  // =========================================================================
  describe('3. Stale Evidence & Conflicting Evidence', () => {
    it('flags evidence older than 24 months as stale and requests refreshment', () => {
      const role = findRole('backend-developer');
      const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString();

      const twin = {
        skills: [
          { key: 'programming_fundamentals', name: 'Programming Fundamentals', strength: 'supported' },
          {
            key: 'sql',
            name: 'SQL',
            strength: 'supported',
            evidence: [
              {
                source: 'project',
                strength: 'supported',
                detail: 'Old database project',
                completedAt: threeYearsAgo,
              },
            ],
          },
        ],
      };

      const gap = computeSkillGap(twin, role);
      const sqlSkill = gap.skills.find((s) => s.key === 'sql');

      assert.ok(sqlSkill);
      assert.equal(sqlSkill.isStale, true);
      assert.match(sqlSkill.staleReason, /older than 24 months/i);
      assert.ok(sqlSkill.actionableRemediation.includes('Refresh your evidence'));
      assert.ok(gap.summary.staleEvidenceCount >= 1);
    });

    it('detects conflict when self-declared expert score has failed assessment', () => {
      const role = findRole('backend-developer');
      const twin = {
        skills: [
          {
            key: 'javascript',
            name: 'JavaScript',
            strength: 'supported',
            selfDeclaredLevel: 'expert',
            evidence: [
              {
                source: 'assessment',
                score: 35, // Failed score contradicts "expert"
                strength: 'supported',
                detail: 'Assessment attempt completed',
              },
            ],
          },
        ],
      };

      const gap = computeSkillGap(twin, role);
      const jsSkill = gap.skills.find((s) => s.key === 'javascript');

      assert.ok(jsSkill);
      assert.equal(jsSkill.conflictingEvidence.hasConflict, true);
      assert.match(jsSkill.conflictingEvidence.detail, /contradicts self-declared expert/i);
    });
  });

  // =========================================================================
  // 4. Anti-Inference & Cross-Module Invariant
  // =========================================================================
  describe('4. Anti-Inference & Cross-Module Invariant', () => {
    it('strictly ignores ungrounded AI model inferences from counting as satisfied evidence', () => {
      const role = findRole('backend-developer');
      const twin = {
        skills: [
          {
            key: 'sql',
            name: 'SQL',
            provenance: 'ai_inference', // Pure ungrounded AI guess
            evidence: [],
          },
        ],
      };

      const gap = computeSkillGap(twin, role);
      const sqlSkill = gap.skills.find((s) => s.key === 'sql');

      assert.ok(sqlSkill);
      assert.equal(sqlSkill.status, GAP_STATUS.MISSING);
      assert.equal(sqlSkill.satisfactionState, SATISFACTION_STATE.MISSING);
    });

    it('never reports MISSING when CareerTwin has grounded evidence', () => {
      const role = findRole('backend-developer');
      const twin = {
        skills: [
          {
            key: 'nodejs',
            name: 'Node.js',
            strength: 'claimed',
            evidence: [{ source: 'self_declared', strength: 'claimed', detail: 'Listed skill' }],
          },
        ],
      };

      const gap = computeSkillGap(twin, role);
      const nodeSkill = gap.skills.find((s) => s.key === 'nodejs');

      assert.ok(nodeSkill);
      assert.notEqual(nodeSkill.status, GAP_STATUS.MISSING);
      assert.equal(nodeSkill.status, GAP_STATUS.CLAIMED);
    });
  });

  // =========================================================================
  // 5. End-to-End API Integration
  // =========================================================================
  describe('5. End-to-End API Integration', () => {
    it('returns enriched skill gap payload from GET /api/careers/roles/:roleId/skill-gap', async () => {
      const { token } = await registerAndLogin();

      // Seed student profile
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          career: { targetRole: 'Backend Developer' },
          skills: [
            { name: 'JavaScript', level: 'intermediate' },
            { name: 'Node.js', level: 'beginner' },
          ],
          projects: [{ title: 'API Service', technologies: ['JavaScript', 'Node.js'] }],
        },
      });

      // Build CareerTwin
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Request Skill Gap
      const res = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/skill-gap',
        token,
      );

      assert.equal(res.status, 200);
      const gap = res.body.data.gap;

      assert.equal(gap.roleId, 'backend-developer');
      assert.ok(gap.skills.length > 0);

      const nodeSkill = gap.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeSkill);
      assert.ok(nodeSkill.actionableRemediation);
      assert.ok(nodeSkill.satisfactionState);
      assert.ok(nodeSkill.proficiencyGap);
      assert.ok(gap.summary);
      assert.ok(gap.summary.required.partiallySatisfied !== undefined);
    });
  });
});
