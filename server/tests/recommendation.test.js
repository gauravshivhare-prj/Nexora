import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { CAREER_ROLES } from '../src/domain/careers/roleCatalogue.js';
import { useAiProvider } from '../src/services/ai/aiProvider.js';
import {
  clearProfiles,
  clearResumes,
  clearUsers,
  getWithToken,
  postJson,
  requestWithHeaders,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';

/**
 * Career recommendation API.
 *
 * The matching itself is covered as a pure function in careerMatch.test.js.
 * These tests are about the seam: that a recommendation is scoped to the
 * caller, that it refuses to guess when the prerequisite is missing, and
 * that every response carries the method that produced it.
 */

const PASSWORD = 'Str0ngPassphrase';

/** A profile that should match Backend Developer well. */
const BACKEND_PROFILE = {
  academic: { branch: 'Computer Science and Engineering', graduationYear: 2027 },
  career: { targetRole: 'Backend Developer', careerInterests: ['Distributed systems'] },
  skills: [
    { name: 'JavaScript', level: 'advanced' },
    { name: 'Node.js', level: 'advanced' },
    { name: 'SQL', level: 'intermediate' },
    { name: 'REST APIs', level: 'intermediate' },
  ],
  projects: [{ title: 'Nexora', technologies: ['Express.js', 'MongoDB', 'Node.js'] }],
};

describe('career recommendations', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    useAiProvider(null);
    await mongoose.connection.collection('careertwins').deleteMany({});
    await clearResumes();
    await clearProfiles();
    await clearUsers();
  });

  async function signUp(email) {
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav Shivhare',
      email,
      password: PASSWORD,
    });

    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });

    return body.data.token;
  }

  /** Registers, saves a profile and generates a CareerTwin. */
  async function studentWith(email, profile = BACKEND_PROFILE) {
    const token = await signUp(email);

    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: profile,
    });
    await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

    return token;
  }

  const recommend = (token, query = '') =>
    getWithToken(server.baseUrl, `/api/careers/recommendations${query}`, token);

  const roleMatch = (token, roleId) =>
    getWithToken(server.baseUrl, `/api/careers/roles/${roleId}/match`, token);

  // --------------------------------------------------------- authentication

  it('protects every route', async () => {
    const paths = [
      '/api/careers/roles',
      '/api/careers/recommendations',
      '/api/careers/roles/backend-developer/match',
    ];

    for (const path of paths) {
      const { status, body } = await requestWithHeaders(server.baseUrl, path);

      assert.equal(status, 401, `${path} was not protected`);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
    }
  });

  // ------------------------------------------------------------- catalogue

  describe('GET /api/careers/roles', () => {
    it('returns the catalogue with its source stated', async () => {
      const token = await signUp('roles@example.com');

      const { status, body } = await getWithToken(server.baseUrl, '/api/careers/roles', token);

      assert.equal(status, 200);
      assert.equal(body.data.roles.length, CAREER_ROLES.length);
      assert.equal(body.data.source.type, 'curated');
      // The honesty of the catalogue is part of its payload, not only its
      // documentation.
      assert.match(body.data.source.description, /Not derived from job-market data/);
    });

    it('works before a student has a CareerTwin', async () => {
      const token = await signUp('rolesearly@example.com');

      const { status } = await getWithToken(server.baseUrl, '/api/careers/roles', token);

      assert.equal(status, 200);
    });
  });

  // ------------------------------------------------------- prerequisites

  describe('prerequisites', () => {
    it('refuses to recommend without a CareerTwin', async () => {
      const token = await signUp('notwin@example.com');

      const { status, body } = await recommend(token);

      // Guessing from an empty twin would produce advice about nobody.
      assert.equal(status, 409);
      assert.equal(body.errorCode, ERROR_CODES.CAREER_TWIN_NOT_FOUND);
      assert.match(body.message, /Generate your CareerTwin first/);
    });

    it('refuses a single role match without a CareerTwin', async () => {
      const token = await signUp('notwin2@example.com');

      const { status, body } = await roleMatch(token, 'backend-developer');

      assert.equal(status, 409);
      assert.equal(body.errorCode, ERROR_CODES.CAREER_TWIN_NOT_FOUND);
    });
  });

  // -------------------------------------------------------- recommendations

  describe('GET /api/careers/recommendations', () => {
    it('ranks a backend student\'s best fit first', async () => {
      const token = await studentWith('backend@example.com');

      const { status, body } = await recommend(token);

      assert.equal(status, 200);
      assert.ok(body.data.matches.length > 0);
      assert.equal(body.data.matches[0].roleId, 'backend-developer');
      assert.ok(body.data.matches[0].score >= 75);
    });

    it('explains every match it returns', async () => {
      const token = await studentWith('explain@example.com');

      const { body } = await recommend(token);

      for (const match of body.data.matches) {
        assert.ok(match.explanation.length > 0, `${match.roleId} has no explanation`);
        assert.ok(Array.isArray(match.matchedRequired));
        assert.ok(Array.isArray(match.missingRequired));
        assert.ok(match.band, `${match.roleId} has no band`);
      }
    });

    it('names the missing skills, not just a score', async () => {
      const token = await studentWith('missing@example.com', {
        skills: [{ name: 'Python', level: 'advanced' }, { name: 'SQL', level: 'advanced' }],
      });

      const { body } = await recommend(token, '?includeAll=true&limit=20');
      const analyst = body.data.matches.find((match) => match.roleId === 'data-analyst');

      assert.ok(analyst.missingRequired.length > 0);
      assert.ok(analyst.matchedRequired.some((skill) => skill.name === 'SQL'));
    });

    it('returns the weights and versions that produced the scores', async () => {
      const token = await studentWith('method@example.com');

      const { body } = await recommend(token);

      // The weights are a judgement, not a measurement. Shipping them with
      // the result is what makes the judgement reviewable.
      assert.equal(body.data.method.usesAi, false);
      assert.equal(body.data.method.deterministic, true);
      assert.ok(body.data.method.weights.requiredSkills > 0);
      assert.ok(Number.isInteger(body.data.method.weightsVersion));
      assert.ok(Number.isInteger(body.data.method.version));
    });

    it('makes no claim about salary or demand', async () => {
      const token = await studentWith('nostats@example.com');

      const { body } = await recommend(token);

      // Scoped to the matches. The `method` block is allowed to *mention*
      // these words, because what it says about them is a disclaimer.
      const serialised = JSON.stringify(body.data.matches).toLowerCase();
      for (const forbidden of ['salary', 'lpa', 'openings', 'demand', 'hiring', 'job market']) {
        assert.ok(!serialised.includes(forbidden), `a match mentions "${forbidden}"`);
      }

      assert.match(
        body.data.method.catalogueSource.description,
        /no salary, demand or hiring statistics/,
        'the response no longer states what the catalogue is not',
      );
    });

    it('returns the same answer twice', async () => {
      const token = await studentWith('stable@example.com');

      const first = await recommend(token);
      const second = await recommend(token);

      assert.deepEqual(
        first.body.data.matches.map((match) => [match.roleId, match.score]),
        second.body.data.matches.map((match) => [match.roleId, match.score]),
      );
    });

    it('honours the limit', async () => {
      const token = await studentWith('limit@example.com');

      const { body } = await recommend(token, '?limit=2');

      assert.ok(body.data.matches.length <= 2);
    });

    it('rejects a nonsensical limit', async () => {
      const token = await studentWith('badlimit@example.com');

      const { status, body } = await recommend(token, '?limit=999');

      assert.equal(status, 400);
      assert.equal(body.errorCode, ERROR_CODES.VALIDATION_ERROR);
    });

    it('recommends nothing, rather than something weak, to an unmatched student', async () => {
      const token = await studentWith('unmatched@example.com', {
        skills: [{ name: 'Tally', level: 'advanced' }],
      });

      const { status, body } = await recommend(token);

      assert.equal(status, 200);
      assert.deepEqual(body.data.matches, []);
      assert.match(body.message, /No roles matched strongly enough/);
    });

    it('returns weak matches when explicitly asked for them', async () => {
      const token = await studentWith('all@example.com', {
        skills: [{ name: 'Tally', level: 'advanced' }],
      });

      const { body } = await recommend(token, '?includeAll=true&limit=20');

      assert.equal(body.data.matches.length, CAREER_ROLES.length);
    });
  });

  // ------------------------------------------------------------ one role

  describe('GET /api/careers/roles/:roleId/match', () => {
    it('scores the student against a named role', async () => {
      const token = await studentWith('named@example.com');

      const { status, body } = await roleMatch(token, 'devops-engineer');

      // A role that missed the top list is not a dead end.
      assert.equal(status, 200);
      assert.equal(body.data.match.roleId, 'devops-engineer');
      assert.ok(body.data.match.missingRequired.length > 0);
    });

    it('answers 404 for a role that is not in the catalogue', async () => {
      const token = await studentWith('norole@example.com');

      const { status, body } = await roleMatch(token, 'astronaut');

      assert.equal(status, 404);
      assert.equal(body.errorCode, ERROR_CODES.CAREER_ROLE_NOT_FOUND);
    });
  });

  // ------------------------------------------------------------ ownership

  describe('ownership', () => {
    it('scores each student against their own twin only', async () => {
      const backend = await studentWith('owner1@example.com');
      const designer = await studentWith('owner2@example.com', {
        skills: [
          { name: 'Figma', level: 'advanced' },
          { name: 'UI Design', level: 'advanced' },
          { name: 'UX Research', level: 'intermediate' },
        ],
      });

      const backendResult = await recommend(backend);
      const designerResult = await recommend(designer);

      assert.equal(backendResult.body.data.matches[0].roleId, 'backend-developer');
      assert.equal(designerResult.body.data.matches[0].roleId, 'ui-ux-designer');
    });

    it('reflects a regenerated twin on the next request', async () => {
      const token = await studentWith('changed@example.com');

      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: {
          skills: [
            { name: 'Figma', level: 'advanced' },
            { name: 'UI Design', level: 'advanced' },
            { name: 'UX Research', level: 'advanced' },
          ],
          projects: [],
          career: { targetRole: 'UI/UX Designer' },
        },
      });
      await sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

      const { body } = await recommend(token);

      // Nothing is cached, so a new twin is reflected immediately.
      assert.equal(body.data.matches[0].roleId, 'ui-ux-designer');
    });
  });
});
