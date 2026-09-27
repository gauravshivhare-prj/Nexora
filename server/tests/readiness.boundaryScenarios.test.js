import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
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
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';

const PASSWORD = 'Str0ngPassphrase1!';
let counter = 0;
let server;

describe('G13 — Career Readiness Calculation Integration & Boundary Tests', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await clearCareerTwins();
    await clearSkillEvidenceChecks();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
  });

  async function registerAndLogin(label) {
    counter += 1;
    const email = `g13.${label}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: `User ${label}`,
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { token: body.data.token, userId: body.data.user.id };
  }

  // =========================================================================
  // 1. Boundary Scenarios: 0% / Missing Requirements
  // =========================================================================
  describe('1. Zero / Baseline Boundary Scenarios', () => {
    it('returns insufficient_data and incomplete dataStatus when no CareerTwin exists', async () => {
      const { token } = await registerAndLogin('no_twin');

      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );

      assert.equal(status, 200);
      const readiness = body.data.readiness;
      assert.equal(readiness.evidenceStatus, 'insufficient_data');
      assert.equal(readiness.dataStatus, 'incomplete');
      assert.equal(readiness.required.total, 0);
      assert.equal(readiness.blockingSkills.length, 0);
      assert.equal('score' in readiness, false);
      assert.equal('percentage' in readiness, false);
    });

    it('returns partial evidenceStatus when 0 required skills are met (100% missing)', async () => {
      const { token } = await registerAndLogin('zero_met');

      // Profile has only unrelated skills (e.g., Graphic Design, SEO)
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [{ name: 'Graphic Design', level: 'intermediate' }],
        },
      });

      // Generate CareerTwin
      await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });

      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );

      assert.equal(status, 200);
      const readiness = body.data.readiness;
      assert.equal(readiness.roleId, 'backend-developer');
      assert.equal(readiness.evidenceStatus, 'partial');
      assert.equal(readiness.dataStatus, 'fresh');
      // For backend-developer, all required skills (Node.js, SQL, Databases) are missing
      assert.equal(readiness.required.missing, readiness.required.total);
      assert.equal(readiness.required.verified, 0);
      assert.equal(readiness.required.supported, 0);
      assert.equal(readiness.blockingSkills.length, readiness.required.total);
    });
  });

  // =========================================================================
  // 2. Intermediate Boundary Scenarios: 50% Supported
  // =========================================================================
  describe('2. Intermediate / Supported Boundary Scenarios', () => {
    it('returns supported evidenceStatus when all required skills are supported or verified', async () => {
      const { token } = await registerAndLogin('supported_all');

      // backend-developer required skills are: JavaScript, Node.js, REST APIs, SQL
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'JavaScript', level: 'advanced' },
            { name: 'Node.js', level: 'advanced' },
            { name: 'REST APIs', level: 'intermediate' },
            { name: 'SQL', level: 'intermediate' },
          ],
          projects: [
            { title: 'Project 1', technologies: ['JavaScript', 'Node.js'] },
            { title: 'Project 2', technologies: ['REST APIs', 'SQL'] },
          ],
        },
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });

      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );

      assert.equal(status, 200);
      const readiness = body.data.readiness;
      assert.equal(readiness.evidenceStatus, 'supported');
      assert.equal(readiness.dataStatus, 'fresh');
      assert.equal(readiness.required.missing, 0);
      assert.equal(readiness.required.claimed, 0);
      assert.ok(readiness.required.supported >= 1);
    });
  });

  // =========================================================================
  // 3. Complete Boundary Scenarios: 100% Verified
  // =========================================================================
  describe('3. Complete 100% Verified Boundary Scenarios', () => {
    it('returns verified evidenceStatus and zero blockingSkills when all required skills are verified', async () => {
      const { token, userId } = await registerAndLogin('verified_all');

      // Add verified evidence checks for all 4 required skills of backend-developer:
      // Canonical skills: JavaScript, Node.js, REST APIs, SQL
      const requiredSkills = [
        { key: 'javascript', name: 'JavaScript' },
        { key: 'node.js', name: 'Node.js' },
        { key: 'restapis', name: 'REST APIs' },
        { key: 'sql', name: 'SQL' },
      ];
      for (const item of requiredSkills) {
        await SkillEvidenceCheck.create({
          user: userId,
          kind: 'assessment',
          skillKey: item.key,
          skillName: item.name,
          score: 0.95,
          passMark: 0.7,
          outcome: 'pass',
          eligibleForVerified: true,
          evaluatedBy: 'assessment-system',
          reference: 'asm_test_ref',
          completedAt: new Date(),
        });
      }

      // Generate CareerTwin incorporating the verified evidence
      await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });

      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );

      assert.equal(status, 200);
      const readiness = body.data.readiness;
      assert.equal(readiness.roleId, 'backend-developer');
      assert.equal(readiness.evidenceStatus, 'verified');
      assert.equal(readiness.dataStatus, 'fresh');
      assert.equal(readiness.required.missing, 0);
      assert.equal(readiness.required.claimed, 0);
      assert.equal(readiness.required.supported, 0);
      assert.equal(readiness.required.verified, readiness.required.total);
      assert.deepEqual(readiness.blockingSkills, []);
      assert.equal('score' in readiness, false);
      assert.equal('percentage' in readiness, false);
    });
  });

  // =========================================================================
  // 4. Staleness Consistency Scenarios
  // =========================================================================
  describe('4. Staleness Consistency Scenarios', () => {
    it('marks dataStatus as stale when profile changes after CareerTwin creation, then fresh upon regeneration', async () => {
      const { token } = await registerAndLogin('staleness_student');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [{ name: 'Node.js', level: 'intermediate' }],
        },
      });

      // Generate initial twin
      await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });

      // Verify initially fresh
      const { body: freshBody } = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(freshBody.data.readiness.dataStatus, 'fresh');

      // Update profile with a new skill after twin creation
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'Node.js', level: 'intermediate' },
            { name: 'Python', level: 'beginner' },
          ],
        },
      });

      // Readiness must now reflect stale dataStatus
      const { body: staleBody } = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(staleBody.data.readiness.dataStatus, 'stale');

      // Regenerate CareerTwin
      await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });

      // Readiness must now be fresh again
      const { body: refreshedBody } = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        token,
      );
      assert.equal(refreshedBody.data.readiness.dataStatus, 'fresh');
    });
  });
});
