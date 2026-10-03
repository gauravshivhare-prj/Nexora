import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  clearCareerTwins,
  clearProfiles,
  clearResumes,
  clearSkillEvidenceChecks,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';
import {
  buildCareerTwin,
} from '../src/domain/careerTwin/buildCareerTwin.js';
import {
  deriveConfidence,
  deriveProficiency,
  deriveRoleRelevance,
  projectTwinSkill,
} from '../src/domain/careerTwin/careerTwinProjection.js';
import { EVIDENCE_STRENGTH } from '../src/domain/evidence/evidence.js';
import { SkillEvidenceCheck } from '../src/models/index.js';

/**
 * Task 07 — CareerTwin Intelligence Engine Reconstruction Test Suite
 *
 * Validates:
 * 1. Deterministic derivation rules: confidence, proficiency, role relevance.
 * 2. Conflict resolution: capping unverified claims, resolving aliases.
 * 3. Freshness & Reproducibility: CareerTwin can be rebuilt from scratch with 100% consistency.
 * 4. End-to-End API Integration: Skill exposure, /rebuild endpoint, predictability of evidence updates.
 */

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let counter = 0;

describe('Task 07 — CareerTwin Intelligence Engine Reconstruction Suite', () => {
  before(async () => {
    server = await startTestServer({ suiteId: 'twinintel' });
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearCareerTwins();
    await clearResumes();
    await clearProfiles();
    await clearSkillEvidenceChecks();
    await clearUsers();
    resetRateLimiters();
  });

  async function registerAndLogin() {
    counter += 1;
    const email = `twin.intel.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Twin Intelligence Student',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { user: res.body.data.user, token: res.body.data.token };
  }

  describe('1. Deterministic Projection & Confidence Scoring', () => {
    it('calculates deterministic confidence from evidence strength and corroboration', () => {
      // Claimed only (1 source)
      const confClaimed = deriveConfidence({
        strength: EVIDENCE_STRENGTH.CLAIMED,
        evidence: [{ source: 'profile' }],
      });
      assert.equal(confClaimed, 0.35);

      // Supported with 2 independent sources (+0.05 bonus)
      const confSupported = deriveConfidence({
        strength: EVIDENCE_STRENGTH.SUPPORTED,
        evidence: [{ source: 'project' }, { source: 'resume' }],
      });
      assert.equal(confSupported, 0.70);

      // Verified with assessment score >= 0.85 and 2 sources (+0.05 corroboration + 0.05 score)
      const confVerifiedHigh = deriveConfidence({
        strength: EVIDENCE_STRENGTH.VERIFIED,
        evidence: [
          { source: 'assessment', verified: true, score: 0.92 },
          { source: 'project' },
        ],
      });
      assert.equal(confVerifiedHigh, 1.00);

      // Staleness penalty (-0.10 if lastUpdate > 180 days ago)
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
      const confStale = deriveConfidence({
        strength: EVIDENCE_STRENGTH.SUPPORTED,
        evidence: [{ source: 'project' }],
        lastUpdate: staleDate,
      });
      assert.equal(confStale, 0.55); // 0.65 - 0.10
    });

    it('enforces conflict resolution: unverified claims cannot jump to advanced proficiency', () => {
      // User claims "advanced" or "expert" with only claimed evidence -> capped at intermediate
      const profClaimedAdvanced = deriveProficiency({
        strength: EVIDENCE_STRENGTH.CLAIMED,
        selfDeclaredLevel: 'advanced',
        evidence: [{ source: 'self_declared' }],
      });
      assert.equal(profClaimedAdvanced, 'intermediate');

      const profClaimedExpert = deriveProficiency({
        strength: EVIDENCE_STRENGTH.CLAIMED,
        selfDeclaredLevel: 'expert',
        evidence: [{ source: 'self_declared' }],
      });
      assert.equal(profClaimedExpert, 'intermediate');

      // User claims "advanced" with supported project evidence -> intermediate
      const profSupportedAdvanced = deriveProficiency({
        strength: EVIDENCE_STRENGTH.SUPPORTED,
        selfDeclaredLevel: 'advanced',
        evidence: [{ source: 'project' }],
      });
      assert.equal(profSupportedAdvanced, 'intermediate');

      // Advanced is earned through verified assessment (score >= 0.85) or verified with advanced claim
      const profVerified = deriveProficiency({
        strength: EVIDENCE_STRENGTH.VERIFIED,
        selfDeclaredLevel: 'intermediate',
        evidence: [{ source: 'assessment', verified: true, score: 0.90 }],
      });
      assert.equal(profVerified, 'advanced');
    });

    it('determines role relevance against target career roles', () => {
      const targetRoles = [{ title: 'Backend Developer' }];

      // Node.js is required in Backend Developer
      const nodeRelevance = deriveRoleRelevance('nodejs', targetRoles);
      assert.equal(nodeRelevance.isTargetRoleSkill, true);
      assert.equal(nodeRelevance.relevanceTier, 'required');
      assert.ok(nodeRelevance.targetRolesMatched.includes('Backend Developer'));

      // Docker is preferred / related in Backend Developer
      const dockerRelevance = deriveRoleRelevance('docker', targetRoles);
      assert.equal(dockerRelevance.isTargetRoleSkill, true);
      assert.ok(['preferred', 'transferable'].includes(dockerRelevance.relevanceTier));

      // Skill not relevant to target role
      const figmaRelevance = deriveRoleRelevance('figma', targetRoles);
      assert.equal(figmaRelevance.isTargetRoleSkill, false);
      assert.equal(figmaRelevance.relevanceTier, 'general');
    });
  });

  describe('2. End-to-End CareerTwin Rich Exposure & Rebuild API', () => {
    it('exposes state, proficiency, confidence, ontology skillId, category, and role relevance on every skill', async () => {
      const { token } = await registerAndLogin();

      // Seed student profile
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          career: { targetRole: 'Backend Developer' },
          skills: [{ name: 'Node.js', level: 'advanced' }],
          projects: [{ title: 'E-Commerce Backend', technologies: ['Node.js', 'Express', 'PostgreSQL'] }],
        },
      });

      // Generate CareerTwin
      const genRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });
      assert.equal(genRes.status, 200);

      const twin = genRes.body.data.careerTwin;
      assert.ok(twin.skills.length >= 2, 'Must include Node.js and PostgreSQL');

      const nodeSkill = twin.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeSkill, 'Node.js skill must be present');

      // Verify all Task 07 required properties are exposed
      assert.equal(nodeSkill.state, 'supported');
      assert.equal(nodeSkill.strength, 'supported');
      assert.equal(nodeSkill.skillId, 'sk_nodejs');
      assert.equal(nodeSkill.category, 'backend');
      assert.equal(nodeSkill.proficiency, 'intermediate');
      assert.ok(nodeSkill.confidence >= 0.65 && nodeSkill.confidence <= 1.00);
      assert.ok(nodeSkill.sources.length >= 2, 'profile and project sources');
      assert.ok(nodeSkill.sourceCount >= 2);
      assert.ok(nodeSkill.roleRelevance.isTargetRoleSkill, 'Node.js is target role skill for Backend Developer');
      assert.equal(nodeSkill.roleRelevance.relevanceTier, 'required');
    });

    it('proves CareerTwin is 100% reproducible and can be rebuilt via POST /api/career-twin/rebuild', async () => {
      const { token } = await registerAndLogin();

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          career: { targetRole: 'Backend Developer' },
          skills: [{ name: 'Python', level: 'beginner' }],
          projects: [{ title: 'Analytics Bot', technologies: ['Python'] }],
        },
      });

      // Initial generation
      const res1 = await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
      const twin1 = res1.body.data.careerTwin;

      // Rebuild endpoint
      const resRebuild = await sendWithToken(server.baseUrl, '/api/career-twin/rebuild', {
        method: 'POST',
        token,
      });
      assert.equal(resRebuild.status, 200);
      const twinRebuilt = resRebuild.body.data.careerTwin;

      // Assert identical skill structure and confidence
      assert.equal(twin1.skills.length, twinRebuilt.skills.length);
      assert.equal(twin1.skills[0].key, twinRebuilt.skills[0].key);
      assert.equal(twin1.skills[0].confidence, twinRebuilt.skills[0].confidence);
      assert.equal(twin1.skills[0].proficiency, twinRebuilt.skills[0].proficiency);
      assert.equal(twin1.indicators.totalSkills, twinRebuilt.indicators.totalSkills);
    });

    it('demonstrates predictable CareerTwin evolution when verified evidence check is added', async () => {
      const { user, token } = await registerAndLogin();

      // Profile has claimed Docker
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [{ name: 'Docker', level: 'beginner' }],
        },
      });

      // Initial twin: Docker is claimed with base confidence 0.35
      const gen1 = await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
      const dockerInitial = gen1.body.data.careerTwin.skills.find((s) => s.key === 'docker');
      assert.equal(dockerInitial.state, 'claimed');
      assert.equal(dockerInitial.confidence, 0.35);
      assert.equal(dockerInitial.proficiency, 'beginner');

      // Now student passes a formal Docker verification assessment
      await SkillEvidenceCheck.create({
        user: user.id,
        kind: 'assessment',
        skillKey: 'docker',
        skillName: 'Docker',
        score: 0.95,
        passMark: 0.70,
        outcome: 'pass',
        eligibleForVerified: true,
        evaluatedBy: 'assessment-service',
        reference: 'attempt-docker-exam-99',
        completedAt: new Date(),
      });

      // Regenerate twin
      const gen2 = await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });
      const dockerPromoted = gen2.body.data.careerTwin.skills.find((s) => s.key === 'docker');

      // Docker should be promoted to verified, high confidence, and advanced proficiency
      assert.equal(dockerPromoted.state, 'verified');
      assert.equal(dockerPromoted.strength, 'verified');
      assert.ok(dockerPromoted.confidence >= 0.90, `Confidence was ${dockerPromoted.confidence}`);
      assert.equal(dockerPromoted.proficiency, 'advanced');
      assert.ok(gen2.body.data.careerTwin.indicators.verified >= 1);
    });
  });
});
