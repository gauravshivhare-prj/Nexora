import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
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
 * GET /api/summary.
 *
 * The two cases that matter are an account with nothing in it and one with
 * everything, because the endpoint's whole job is to describe a position in
 * a pipeline — and a new student is legitimately at the start of it.
 *
 * The other thing worth pinning is what is *not* in the response: no
 * readiness score, no completion percentage, and no figure that is not
 * already produced by the domain service that owns it. A summary that
 * computed its own numbers could disagree with every page it summarises.
 */

const PASSWORD = 'Str0ngPassphrase';

const RESUME_TEXT = `Gaurav Shivhare
gaurav@example.com | Bhopal

SKILLS
Node.js, Express, MongoDB, SQL, JavaScript

PROJECTS
Nexora - a career readiness platform built with Node.js and Express.`;

const EXTRACTION = {
  basics: { fullName: 'Gaurav Shivhare', email: 'gaurav@example.com' },
  skills: [{ name: 'Node.js' }, { name: 'Express' }, { name: 'MongoDB' }],
  projects: [{ title: 'Nexora', technologies: ['Node.js', 'Express'] }],
};

describe('dashboard summary', () => {
  let server;
  let counter = 0;

  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: 'test-double',
      async complete() {
        return { text: JSON.stringify(EXTRACTION), model: 'test-model' };
      },
    });
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();
    useAiProvider('test-double');
  });

  async function signUp() {
    counter += 1;
    const email = `summary.${Date.now()}.${counter}@example.com`;

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

  const summary = (token) => getWithToken(server.baseUrl, '/api/summary', token);

  async function seedProfile(token) {
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: {
        career: { targetRole: 'Backend Developer' },
        skills: [{ name: 'MongoDB', level: 'intermediate' }, { name: 'SQL', level: 'beginner' }],
        projects: [{ title: 'Nexora', technologies: ['Node.js', 'Express'] }],
        certifications: [],
      },
    });
  }

  async function seedAnalysedResume(token) {
    const { body } = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: RESUME_TEXT, label: 'Backend CV' },
    });

    await sendWithToken(server.baseUrl, `/api/resumes/${body.data.resume.id}/analysis`, {
      method: 'POST',
      token,
    });
  }

  const buildTwin = (token) =>
    sendWithToken(server.baseUrl, '/api/career-twin', { method: 'POST', token });

  // ------------------------------------------------------------ ownership

  it('refuses an unauthenticated request', async () => {
    // No Authorization header at all. Passing an undefined token instead
    // would send "Bearer undefined", which is a *malformed* token and takes
    // a different branch — not the case this test is about.
    const { status, body } = await requestWithHeaders(server.baseUrl, '/api/summary');

    assert.equal(status, 401);
    assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
  });

  it('refuses a request with a malformed token', async () => {
    const { status, body } = await getWithToken(server.baseUrl, '/api/summary', 'not-a-token');

    assert.equal(status, 401);
    assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_INVALID);
  });

  it('describes the caller, not whoever has data', async () => {
    const busy = await signUp();
    await seedProfile(busy);
    await seedAnalysedResume(busy);
    await buildTwin(busy);

    const empty = await signUp();
    const { body } = await summary(empty);

    // A fresh account must see its own emptiness, not the other account's
    // work. Every query is scoped to req.auth.userId.
    assert.equal(body.data.profile.exists, false);
    assert.equal(body.data.careerTwin.exists, false);
    assert.equal(body.data.resumes.total, 0);
  });

  // ---------------------------------------------------------- empty user

  it('answers 200 with empty sections for a new account', async () => {
    const token = await signUp();
    const { status, body } = await summary(token);

    // Not a 404: a first visit is a normal state, and answering 404 would
    // make a client treat it as a failure.
    assert.equal(status, 200);

    const data = body.data;
    assert.equal(data.profile.exists, false);
    assert.equal(data.profile.skillCount, 0);
    assert.equal(data.resumes.total, 0);
    assert.equal(data.resumes.analysed, 0);
    assert.equal(data.careerTwin.exists, false);
    assert.equal(data.matches.exists, false);
    assert.deepEqual(data.matches.top, []);
    assert.equal(data.focusRole, null);
    assert.equal(data.skillGap, null);
    assert.equal(data.roadmap, null);
  });

  it('tells a new account to fill in its profile first', async () => {
    const token = await signUp();
    const { body } = await summary(token);

    assert.equal(body.data.nextStep.code, 'COMPLETE_PROFILE');
    assert.ok(body.data.nextStep.message.length > 0);
  });

  it('asks for a CareerTwin once the profile has something in it', async () => {
    const token = await signUp();
    await seedProfile(token);

    const { body } = await summary(token);
    assert.equal(body.data.profile.exists, true);
    assert.equal(body.data.profile.skillCount, 2);
    assert.equal(body.data.profile.projectCount, 1);
    assert.equal(body.data.profile.hasTargetRole, true);
    assert.equal(body.data.nextStep.code, 'BUILD_CAREER_TWIN');
  });

  // ------------------------------------------------------ populated user

  it('reports every section for a student who has done the work', async () => {
    const token = await signUp();
    await seedProfile(token);
    await seedAnalysedResume(token);
    await buildTwin(token);

    const { status, body } = await summary(token);
    assert.equal(status, 200);

    const data = body.data;
    assert.equal(data.profile.exists, true);
    assert.equal(data.resumes.total, 1);
    assert.equal(data.resumes.analysed, 1);

    assert.equal(data.careerTwin.exists, true);
    assert.ok(data.careerTwin.indicators.totalSkills > 0);
    assert.ok(data.careerTwin.generatedAt);

    assert.equal(data.matches.exists, true);
    assert.ok(data.matches.top.length > 0 && data.matches.top.length <= 3);
    assert.ok(data.focusRole.roleId);

    // Counts for the top role only — the per-role endpoints carry detail.
    assert.equal(data.skillGap.roleId, data.focusRole.roleId);
    assert.equal(typeof data.skillGap.summary.required.missing, 'number');
    assert.equal(data.roadmap.roleId, data.focusRole.roleId);
    assert.equal(typeof data.roadmap.summary.totalItems, 'number');
  });

  it('reuses the domain services rather than recomputing their numbers', async () => {
    const token = await signUp();
    await seedProfile(token);
    await seedAnalysedResume(token);
    await buildTwin(token);

    const { body: summaryBody } = await summary(token);
    const data = summaryBody.data;

    // The same figures, fetched the long way round. Any divergence means
    // the summary has grown an opinion of its own.
    const [twin, recommendations, gap, roadmap] = await Promise.all([
      getWithToken(server.baseUrl, '/api/career-twin', token),
      getWithToken(server.baseUrl, '/api/careers/recommendations?limit=3', token),
      getWithToken(server.baseUrl, `/api/careers/roles/${data.focusRole.roleId}/skill-gap`, token),
      getWithToken(server.baseUrl, `/api/careers/roles/${data.focusRole.roleId}/roadmap`, token),
    ]);

    assert.deepEqual(data.careerTwin.indicators, twin.body.data.careerTwin.indicators);
    assert.deepEqual(
      data.matches.top.map((match) => [match.roleId, match.score, match.band]),
      recommendations.body.data.matches.map((match) => [match.roleId, match.score, match.band]),
    );
    assert.deepEqual(data.skillGap.summary, gap.body.data.gap.summary);
    assert.deepEqual(data.roadmap.summary, roadmap.body.data.roadmap.summary);
  });

  it('passes the twin’s staleness through unchanged', async () => {
    const token = await signUp();
    await seedProfile(token);
    await buildTwin(token);

    const fresh = await summary(token);
    assert.equal(fresh.body.data.careerTwin.isStale, false);

    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token,
      payload: { personal: { city: 'Bhopal' } },
    });

    const { body } = await summary(token);
    assert.equal(body.data.careerTwin.isStale, true);
    assert.ok(body.data.careerTwin.staleReasons.length > 0);
    assert.equal(body.data.nextStep.code, 'REGENERATE_CAREER_TWIN');
  });

  // ------------------------------------------------- no invented numbers

  it('invents no readiness score or completion percentage', async () => {
    const token = await signUp();
    await seedProfile(token);
    await seedAnalysedResume(token);
    await buildTwin(token);

    const { body } = await summary(token);
    const serialised = JSON.stringify(body.data);

    // The match score is the one honest headline figure the product
    // computes, and it lives in matches[]. A second one here would compete
    // with it, and nothing computes a readiness or completion number at all.
    for (const forbidden of ['readiness', 'completionPercent', 'percentComplete', 'overallScore']) {
      assert.ok(!serialised.includes(forbidden), `the summary invented "${forbidden}"`);
    }
  });

  it('does not echo the owning user id back', async () => {
    const token = await signUp();
    await seedProfile(token);

    const { body } = await summary(token);

    // Same rule as every other public shape: the caller knows who they are,
    // and echoing an id invites a client to start passing it back.
    assert.ok(!JSON.stringify(body.data).includes('"user"'));
  });
});
