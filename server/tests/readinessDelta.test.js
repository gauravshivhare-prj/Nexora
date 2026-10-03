import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { computeReadinessDelta } from '../src/domain/readiness/computeReadinessDelta.js';
import {
  clearCareerTwins,
  clearProfiles,
  clearReadinessSnapshots,
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

describe('Task 24 — Readiness Explainability & Change Attribution Engine', () => {
  describe('computeReadinessDelta (Pure Domain Function — 12 Scenarios)', () => {
    it('Scenario 1: returns hasPrevious=false and zero delta when previous is null', () => {
      const current = {
        evidenceStatus: 'partial',
        score: { score: 45, band: 'developing' },
        blockingSkills: [{ key: 'nodejs', name: 'Node.js', status: 'missing' }],
      };

      const result = computeReadinessDelta(null, current);
      assert.equal(result.hasPrevious, false);
      assert.equal(result.scoreDelta, 0);
      assert.equal(result.currentScore, 45);
      assert.equal(result.previousScore, null);
      assert.equal(result.statusDelta.changed, false);
      assert.equal(result.statusDelta.direction, 'unchanged');
      assert.deepEqual(result.skills.improved, []);
      assert.deepEqual(result.skills.degraded, []);
      assert.ok(result.summary.includes('Initial readiness assessment established'));
    });

    it('Scenario 2: detects positive score delta when score improves', () => {
      const previous = {
        evidenceStatus: 'partial',
        score: 40,
        skillStates: [{ skillKey: 'nodejs', name: 'Node.js', status: 'claimed' }],
      };
      const current = {
        evidenceStatus: 'partial',
        score: { score: 65 },
        skillStates: [{ skillKey: 'nodejs', name: 'Node.js', status: 'supported' }],
      };

      const result = computeReadinessDelta(previous, current);
      assert.equal(result.hasPrevious, true);
      assert.equal(result.scoreDelta, 25);
      assert.equal(result.currentScore, 65);
      assert.equal(result.previousScore, 40);
      assert.equal(result.statusDelta.direction, 'improved');
      assert.ok(result.summary.includes('+25 points'));
    });

    it('Scenario 3: detects negative score delta when score degrades', () => {
      const previous = { evidenceStatus: 'supported', score: 75 };
      const current = { evidenceStatus: 'partial', score: { score: 55 } };

      const result = computeReadinessDelta(previous, current);
      assert.equal(result.hasPrevious, true);
      assert.equal(result.scoreDelta, -20);
      assert.equal(result.statusDelta.direction, 'degraded');
      assert.ok(result.summary.includes('-20 points'));
    });

    it('Scenario 4: marks direction unchanged when score and evidence status are unchanged', () => {
      const previous = { evidenceStatus: 'partial', score: 50 };
      const current = { evidenceStatus: 'partial', score: { score: 50 } };

      const result = computeReadinessDelta(previous, current);
      assert.equal(result.hasPrevious, true);
      assert.equal(result.scoreDelta, 0);
      assert.equal(result.statusDelta.direction, 'unchanged');
      assert.ok(result.summary.includes('held steady at 50'));
    });

    it('Scenario 5: detects evidenceStatus upgrade (partial -> supported)', () => {
      const previous = { evidenceStatus: 'partial', score: 55 };
      const current = { evidenceStatus: 'supported', score: { score: 70 } };

      const result = computeReadinessDelta(previous, current);
      assert.equal(result.statusDelta.changed, true);
      assert.equal(result.statusDelta.from, 'partial');
      assert.equal(result.statusDelta.to, 'supported');
      assert.equal(result.statusDelta.direction, 'improved');
      assert.ok(result.summary.includes('shifted from partial to supported'));
    });

    it('Scenario 6: detects evidenceStatus downgrade (verified -> supported)', () => {
      const previous = { evidenceStatus: 'verified', score: 95 };
      const current = { evidenceStatus: 'supported', score: { score: 85 } };

      const result = computeReadinessDelta(previous, current);
      assert.equal(result.statusDelta.changed, true);
      assert.equal(result.statusDelta.from, 'verified');
      assert.equal(result.statusDelta.to, 'supported');
      assert.equal(result.statusDelta.direction, 'degraded');
      assert.ok(result.summary.includes('shifted from verified to supported'));
    });

    it('Scenario 7: attributes individual skill advancement (missing -> supported)', () => {
      const previous = {
        score: 30,
        evidenceStatus: 'partial',
        skillStates: [{ skillKey: 'docker', name: 'Docker', status: 'missing' }],
      };
      const current = {
        score: { score: 50 },
        evidenceStatus: 'partial',
        skillStates: [{ skillKey: 'docker', name: 'Docker', status: 'supported' }],
      };

      const result = computeReadinessDelta(previous, current);
      assert.equal(result.skills.improved.length, 1);
      assert.equal(result.skills.improved[0].key, 'docker');
      assert.equal(result.skills.improved[0].from, 'missing');
      assert.equal(result.skills.improved[0].to, 'supported');
      assert.equal(result.skills.degraded.length, 0);
    });

    it('Scenario 8: attributes individual skill degradation (supported -> missing)', () => {
      const previous = {
        score: 60,
        evidenceStatus: 'supported',
        skillStates: [{ skillKey: 'sql', name: 'SQL', status: 'supported' }],
      };
      const current = {
        score: { score: 40 },
        evidenceStatus: 'partial',
        skillStates: [{ skillKey: 'sql', name: 'SQL', status: 'missing' }],
      };

      const result = computeReadinessDelta(previous, current);
      assert.equal(result.skills.degraded.length, 1);
      assert.equal(result.skills.degraded[0].key, 'sql');
      assert.equal(result.skills.degraded[0].from, 'supported');
      assert.equal(result.skills.degraded[0].to, 'missing');
    });

    it('Scenario 9: detects newly resolved blocking skills', () => {
      const previous = {
        score: 40,
        evidenceStatus: 'partial',
        blockingSkills: [
          { key: 'nodejs', name: 'Node.js', status: 'missing' },
          { key: 'sql', name: 'SQL', status: 'claimed' },
        ],
      };
      const current = {
        score: { score: 75 },
        evidenceStatus: 'partial',
        blockingSkills: [{ key: 'sql', name: 'SQL', status: 'claimed' }],
      };

      const result = computeReadinessDelta(previous, current);
      assert.equal(result.skills.newlyResolved.length, 1);
      assert.equal(result.skills.newlyResolved[0].key, 'nodejs');
      assert.ok(result.summary.includes('1 blocking skill resolved'));
    });

    it('Scenario 10: detects newly emerged blocking skills', () => {
      const previous = {
        score: 60,
        evidenceStatus: 'supported',
        blockingSkills: [],
      };
      const current = {
        score: { score: 45 },
        evidenceStatus: 'partial',
        blockingSkills: [{ key: 'security', name: 'Security', status: 'missing', reason: 'Role updated' }],
      };

      const result = computeReadinessDelta(previous, current);
      assert.equal(result.skills.newlyBlocking.length, 1);
      assert.equal(result.skills.newlyBlocking[0].key, 'security');
      assert.equal(result.skills.newlyBlocking[0].reason, 'Role updated');
      assert.ok(result.summary.includes('1 new skill require attention'));
    });

    it('Scenario 11: computes unchanged skills accurately across snapshots', () => {
      const previous = {
        score: 50,
        evidenceStatus: 'partial',
        skillStates: [
          { skillKey: 'javascript', name: 'JavaScript', status: 'supported' },
          { skillKey: 'git', name: 'Git', status: 'claimed' },
        ],
      };
      const current = {
        score: { score: 50 },
        evidenceStatus: 'partial',
        skillStates: [
          { skillKey: 'javascript', name: 'JavaScript', status: 'supported' },
          { skillKey: 'git', name: 'Git', status: 'claimed' },
        ],
      };

      const result = computeReadinessDelta(previous, current);
      assert.equal(result.skills.unchanged.length, 2);
      assert.equal(result.skills.improved.length, 0);
      assert.equal(result.skills.degraded.length, 0);
    });

    it('Scenario 12: handles empty/malformed inputs safely without throwing', () => {
      const result1 = computeReadinessDelta({}, {});
      assert.equal(typeof result1, 'object');
      assert.equal(result1.hasPrevious, true);

      const result2 = computeReadinessDelta(undefined, undefined);
      assert.equal(result2.hasPrevious, false);
      assert.equal(result2.scoreDelta, 0);
    });
  });

  describe('API Integration — Readiness Delta in Endpoint Responses', () => {
    let server;
    const PASSWORD = 'Str0ngPassword123!';

    before(async () => {
      server = await startTestServer({ suiteId: 'readiness_delta' });
    });

    after(async () => {
      await server.close();
    });

    beforeEach(async () => {
      resetRateLimiters();
      await clearReadinessSnapshots();
      await clearCareerTwins();
      await clearSkillEvidenceChecks();
      await clearResumes();
      await clearProfiles();
      await clearUsers();
    });

    it('attaches delta block to GET /api/careers/roles/:roleId/readiness?includeScore=true', async () => {
      await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Delta Student',
        email: 'delta-student@example.com',
        password: PASSWORD,
      });
      const { body: loginBody } = await postJson(server.baseUrl, '/api/auth/login', {
        email: 'delta-student@example.com',
        password: PASSWORD,
      });
      const token = loginBody.data.token;

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [{ name: 'JavaScript', level: 'intermediate' }],
        },
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // First readiness call -> establishes baseline snapshot
      const res1 = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness?includeScore=true',
        token,
      );
      assert.equal(res1.status, 200);
      const readiness1 = res1.body.data.readiness;
      assert.ok(readiness1.score, 'score must be present');
      assert.ok(readiness1.delta, 'delta must be present');
      assert.equal(readiness1.delta.hasPrevious, false, 'first call has no previous baseline');

      // Update profile with new verified/supported project
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'JavaScript', level: 'advanced' },
            { name: 'Node.js', level: 'advanced' },
          ],
          projects: [{ title: 'Backend API', technologies: ['Node.js', 'JavaScript'] }],
        },
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Second readiness call -> compares against the baseline snapshot
      const res2 = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness?includeScore=true',
        token,
      );
      assert.equal(res2.status, 200);
      const readiness2 = res2.body.data.readiness;
      assert.ok(readiness2.delta, 'delta must be present on second call');
      assert.equal(readiness2.delta.hasPrevious, true);
      assert.ok(readiness2.delta.scoreDelta >= 0, 'score should have improved or held steady');
      assert.ok(typeof readiness2.delta.summary === 'string');
    });
  });
});
