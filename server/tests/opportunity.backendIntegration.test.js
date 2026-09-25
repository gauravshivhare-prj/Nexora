import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
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

const PASSWORD = 'Str0ngPassphrase1!';
let counter = 0;
let server;

describe('G14 — Opportunity Data Integration & Matcher Suite', () => {
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
    const email = `g14.${label}.${Date.now()}.${counter}@example.com`;
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
  // 1. Curated vs Live Metadata Contract
  // =========================================================================
  describe('1. Curated vs Live Metadata Contract', () => {
    it('accurately states curated_internal source without implying live external job feeds', async () => {
      const { token } = await registerAndLogin('meta_student');

      const { status, body } = await getWithToken(server.baseUrl, '/api/opportunities', token);

      assert.equal(status, 200);
      assert.deepEqual(body.data.opportunities, []);
      assert.equal(body.data.catalogue.source.type, 'curated_internal');
      assert.equal(body.data.catalogue.source.version, 1);
      assert.match(body.data.catalogue.source.asOf, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(body.data.method.deterministic, true);
      assert.equal(body.data.method.usesAi, false);
      assert.equal(body.data.method.requiresVerifiedEvidence, true);
      assert.equal(body.data.method.sourceStatus, 'curated_internal');
    });
  });

  // =========================================================================
  // 2. Verified Evidence Matching
  // =========================================================================
  describe('2. Verified Evidence Matching', () => {
    it('matches opportunity when student has verified evidence and targetRole set by title', async () => {
      const { token, userId } = await registerAndLogin('verified_match');

      // Set profile target role
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          career: { targetRole: 'Backend Developer' },
        },
      });

      // Add verified evidence checks for JavaScript and Node.js
      for (const skill of [
        { key: 'javascript', name: 'JavaScript' },
        { key: 'node.js', name: 'Node.js' },
      ]) {
        await SkillEvidenceCheck.create({
          user: userId,
          kind: 'assessment',
          skillKey: skill.key,
          skillName: skill.name,
          score: 0.9,
          passMark: 0.7,
          outcome: 'pass',
          eligibleForVerified: true,
          evaluatedBy: 'assessment-system',
          reference: 'asm_test',
          completedAt: new Date(),
        });
      }

      // Generate CareerTwin
      await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });

      const { status, body } = await getWithToken(server.baseUrl, '/api/opportunities', token);

      assert.equal(status, 200);
      assert.equal(body.data.opportunities.length, 1);
      const matched = body.data.opportunities[0];
      assert.equal(matched.id, 'curated_internal:backend-apprenticeship');
      assert.equal(matched.title, 'Backend apprenticeship');
      assert.deepEqual(matched.requiredSkills, ['JavaScript', 'Node.js']);
      assert.ok(matched.matchedEligibility.length >= 2);
    });

    it('matches opportunity when student targetRole is provided as role slug id', async () => {
      const { token, userId } = await registerAndLogin('slug_match');

      // Set profile target role using role slug id
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          career: { targetRole: 'backend-developer' },
        },
      });

      for (const skill of [
        { key: 'javascript', name: 'JavaScript' },
        { key: 'node.js', name: 'Node.js' },
      ]) {
        await SkillEvidenceCheck.create({
          user: userId,
          kind: 'assessment',
          skillKey: skill.key,
          skillName: skill.name,
          score: 0.9,
          passMark: 0.7,
          outcome: 'pass',
          eligibleForVerified: true,
          evaluatedBy: 'assessment-system',
          reference: 'asm_test',
          completedAt: new Date(),
        });
      }

      await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });

      const { status, body } = await getWithToken(server.baseUrl, '/api/opportunities', token);

      assert.equal(status, 200);
      assert.equal(body.data.opportunities.length, 1);
      assert.equal(body.data.opportunities[0].id, 'curated_internal:backend-apprenticeship');
    });

    it('does NOT match opportunities when skills are only claimed or supported (never verified)', async () => {
      const { token } = await registerAndLogin('supported_only');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          career: { targetRole: 'Backend Developer' },
          skills: [
            { name: 'JavaScript', level: 'advanced' },
            { name: 'Node.js', level: 'advanced' },
          ],
          projects: [{ title: 'Fullstack App', technologies: ['JavaScript', 'Node.js'] }],
        },
      });

      await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });

      const { status, body } = await getWithToken(server.baseUrl, '/api/opportunities', token);

      assert.equal(status, 200);
      // Project evidence only produces supported skills, which cannot satisfy verified_skills requirement
      assert.deepEqual(body.data.opportunities, []);
    });
  });

  // =========================================================================
  // 3. Query Filtering
  // =========================================================================
  describe('3. Query Filtering', () => {
    it('applies ?role= filter correctly', async () => {
      const { token, userId } = await registerAndLogin('filtered_student');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          career: { targetRole: 'Backend Developer' },
        },
      });

      for (const skill of [
        { key: 'javascript', name: 'JavaScript' },
        { key: 'node.js', name: 'Node.js' },
      ]) {
        await SkillEvidenceCheck.create({
          user: userId,
          kind: 'assessment',
          skillKey: skill.key,
          skillName: skill.name,
          score: 0.9,
          passMark: 0.7,
          outcome: 'pass',
          eligibleForVerified: true,
          evaluatedBy: 'assessment-system',
          reference: 'asm_test',
          completedAt: new Date(),
        });
      }

      await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token,
      });

      // Matching filter
      const { status: matchStatus, body: matchBody } = await getWithToken(
        server.baseUrl,
        '/api/opportunities?role=backend-developer',
        token,
      );
      assert.equal(matchStatus, 200);
      assert.equal(matchBody.data.opportunities.length, 1);

      // Non-matching filter
      const { status: noMatchStatus, body: noMatchBody } = await getWithToken(
        server.baseUrl,
        '/api/opportunities?role=data-analyst',
        token,
      );
      assert.equal(noMatchStatus, 200);
      assert.equal(noMatchBody.data.opportunities.length, 0);
    });
  });
});
