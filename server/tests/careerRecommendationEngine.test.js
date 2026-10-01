import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  CAREER_ROLES,
  findRole,
} from '../src/domain/careers/roleCatalogue.js';
import {
  rankRoles,
  scoreRoleMatch,
  validateRecommendation,
  validateRecommendationsList,
} from '../src/domain/careers/matchRole.js';
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
 * Task 09 — Career Recommendation Engine Correctness, Explainability & Validation Suite
 */

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let counter = 0;

describe('Task 09 — Career Recommendation Engine Suite', () => {
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
    const email = `rec.engine.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Recommendation Student',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { token: res.body.data.token };
  }

  describe('1. Traceable Explanations & Scoring Dimensions', () => {
    it('produces mathematical point contributions summing up to total score', () => {
      const twin = {
        skills: [
          { key: 'javascript', name: 'JavaScript', strength: 'supported', skillId: 'sk_javascript' },
          { key: 'nodejs', name: 'Node.js', strength: 'supported', skillId: 'sk_nodejs' },
          { key: 'sql', name: 'SQL', strength: 'claimed', skillId: 'sk_sql' },
        ],
        interests: ['Backend systems'],
        targetRoles: [{ title: 'Backend Developer', origin: 'student' }],
        academic: { degree: 'B.Tech', branch: 'Computer Science' },
      };

      const role = findRole('backend-developer');
      const match = scoreRoleMatch(twin, role);

      // Verify structure
      assert.ok(match.score > 0);
      assert.ok(match.traceableExplanation);
      assert.ok(match.prerequisitesStatus);

      // Verify contributing points sum to total score (accounting for rounding)
      const points = match.traceableExplanation.contributingPoints;
      const sumOfPoints = Object.values(points).reduce((acc, v) => acc + v, 0);
      assert.ok(
        Math.abs(Math.round(sumOfPoints) - match.score) <= 1,
        `Sum of points ${sumOfPoints} diverged from score ${match.score}`,
      );

      // Verify explanations
      assert.ok(match.matchedRequired.length > 0);
      assert.ok(match.missingRequired.length > 0);
      assert.ok(match.explanation.length > 0);
    });

    it('handles missing data cleanly without throwing or inventing scores', () => {
      // Empty student profile with missing academic info: returns neutral 50 background alignment (score 3)
      const emptyTwin = { skills: [], interests: [], targetRoles: [], academic: null };
      const role = findRole('backend-developer');
      const match = scoreRoleMatch(emptyTwin, role);

      assert.equal(match.dimensions.requiredSkills.value, 0);
      assert.equal(match.dimensions.preferredSkills.value, 0);
      assert.equal(match.dimensions.evidenceStrength.value, 0);
      assert.equal(match.dimensions.interestAlignment.value, 0);
      assert.equal(match.dimensions.backgroundAlignment.value, 50); // System design: neutral 50 when branch unspecified
      assert.equal(match.score, 3);
      assert.equal(match.traceableExplanation.totalPoints, 3);

      // Student with explicit non-matching academic branch: score is exactly 0
      const nonMatchingTwin = { skills: [], interests: [], targetRoles: [], academic: { branch: 'Civil Engineering' } };
      const nonMatch = scoreRoleMatch(nonMatchingTwin, role);
      assert.equal(nonMatch.score, 0);
      assert.equal(nonMatch.dimensions.backgroundAlignment.value, 0);
      assert.equal(nonMatch.traceableExplanation.totalPoints, 0);
    });
  });

  describe('2. Multi-tier Deterministic Tie-Breaking', () => {
    it('breaks score ties deterministically by required skills coverage then alphabetical title', () => {
      const twin = {
        skills: [
          { key: 'javascript', name: 'JavaScript', strength: 'supported' },
          { key: 'html', name: 'HTML', strength: 'supported' },
          { key: 'css', name: 'CSS', strength: 'supported' },
        ],
        interests: [],
        targetRoles: [],
        academic: null,
      };

      const res = rankRoles(twin, { limit: 10, includeBelowThreshold: true });
      assert.ok(res.matches.length > 0);

      // Assert descending score ordering
      for (let i = 0; i < res.matches.length - 1; i++) {
        const curr = res.matches[i];
        const next = res.matches[i + 1];
        assert.ok(
          curr.score >= next.score,
          `Role ${curr.title} (${curr.score}) ranked below ${next.title} (${next.score})`,
        );
      }
    });
  });

  describe('3. Independent Validation & Anti-Hallucination Layer', () => {
    const twin = {
      skills: [
        { key: 'nodejs', name: 'Node.js', strength: 'claimed' },
        { key: 'sql', name: 'SQL', strength: 'claimed' },
      ],
      interests: [],
      targetRoles: [],
      academic: null,
    };

    it('accepts valid, fully grounded role recommendations', () => {
      const role = findRole('backend-developer');
      const rawMatch = scoreRoleMatch(twin, role);
      const outcome = validateRecommendation(rawMatch, twin);

      assert.equal(outcome.isValid, true);
      assert.equal(outcome.action, 'accepted');
      assert.equal(outcome.audit.unsupportedSkills.length, 0);
    });

    it('detects hallucinated skills in AI proposals and applies penalty downgrade', () => {
      const role = findRole('backend-developer');
      const hallucinatedProposal = {
        roleId: 'backend-developer',
        score: 85,
        matchedRequired: [
          { skill: { name: 'Node.js', strength: 'claimed' } },
          { skill: { name: 'Kubernetes', strength: 'verified' } }, // Hallucination!
        ],
        matchedPreferred: [],
      };

      const outcome = validateRecommendation(hallucinatedProposal, twin);
      assert.equal(outcome.isValid, true);
      assert.equal(outcome.action, 'downgraded');
      assert.ok(outcome.audit.unsupportedSkills.includes('Kubernetes'));
      assert.ok(outcome.audit.downgradePenalty > 0);
      assert.ok(outcome.validatedMatch.score < 85);
    });

    it('rejects AI proposals where the majority of skills are ungrounded hallucinations', () => {
      const fakeProposal = {
        roleId: 'backend-developer',
        score: 95,
        matchedRequired: [
          { skill: { name: 'QuantumComputing' } },
          { skill: { name: 'RocketScience' } },
          { skill: { name: 'NeuroLink' } },
        ],
      };

      const outcome = validateRecommendation(fakeProposal, twin);
      assert.equal(outcome.isValid, false);
      assert.equal(outcome.action, 'rejected');
      assert.ok(outcome.rejectionReasons[0].includes('ungrounded hallucinations'));
    });

    it('rejects proposals targeting non-existent or unauthoritative roles', () => {
      const outcome = validateRecommendation({ roleId: 'fake-architect-role', score: 90 }, twin);
      assert.equal(outcome.isValid, false);
      assert.equal(outcome.action, 'rejected');
      assert.match(outcome.rejectionReasons[0], /does not exist in the authoritative catalogue/i);
    });
  });

  describe('4. End-to-End Recommendations API Integration', () => {
    it('returns grounded recommendations with traceable explanations from GET /api/careers/recommendations', async () => {
      const { token } = await registerAndLogin();

      // Seed student profile
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          career: { targetRole: 'Backend Developer' },
          skills: [
            { name: 'JavaScript', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' },
            { name: 'SQL', level: 'beginner' },
          ],
          projects: [{ title: 'REST API Service', technologies: ['Node.js', 'Express', 'SQL'] }],
        },
      });

      // Build CareerTwin
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      // Fetch recommendations
      const recRes = await getWithToken(server.baseUrl, '/api/careers/recommendations', token);
      assert.equal(recRes.status, 200);

      const matches = recRes.body.data.matches;
      assert.ok(matches.length > 0);

      const topMatch = matches[0];
      assert.ok(topMatch.score > 0);
      assert.ok(topMatch.traceableExplanation);
      assert.ok(topMatch.traceableExplanation.contributingPoints);
      assert.ok(topMatch.prerequisitesStatus);
      assert.equal(topMatch.validation?.isGrounded, true);
    });

    it('returns validated single role match from GET /api/careers/roles/:roleId/match', async () => {
      const { token } = await registerAndLogin();

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [{ name: 'React', level: 'beginner' }],
        },
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      const matchRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/frontend-developer/match',
        token,
      );
      assert.equal(matchRes.status, 200);

      const match = matchRes.body.data.match;
      assert.equal(match.roleId, 'frontend-developer');
      assert.ok(match.traceableExplanation);
      assert.ok(match.dimensions);
    });
  });
});
