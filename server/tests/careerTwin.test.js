import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

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
 * CareerTwin API.
 *
 * The behaviour worth protecting here is that the twin is built without any
 * AI involvement, so it works fully on a deployment with no provider — which
 * is how Nexora ships — and that the optional narrative can fail in every
 * way without damaging the twin it describes.
 */

const PASSWORD = 'Str0ngPassphrase';

const RESUME_TEXT = `Gaurav Shivhare
gaurav@example.com | Bhopal

SKILLS
Node.js, Express, MongoDB, Redis

PROJECTS
Nexora - a career readiness platform built with React and Express.`;

function createProviderDouble() {
  const state = {
    respond: () => JSON.stringify({ summary: 'You have claimed Node.js and MongoDB.' }),
    calls: 0,
  };

  return {
    state,
    provider: {
      name: 'twin-double',
      async complete(request) {
        state.calls += 1;
        state.lastRequest = request;

        const response = state.respond();
        if (response instanceof Error) throw response;

        return { text: response, model: 'twin-model-v1' };
      },
    },
  };
}

describe('career twin', () => {
  let server;
  let double;

  before(async () => {
    server = await startTestServer();
    double = createProviderDouble();
    registerAiProvider(double.provider);
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await mongoose.connection.collection('careertwins').deleteMany({});
    await clearResumes();
    await clearProfiles();
    await clearUsers();

    useAiProvider(null);
    double.state.respond = () => JSON.stringify({ summary: 'You have claimed Node.js and MongoDB.' });
    double.state.calls = 0;
  });

  const withProvider = () => useAiProvider('twin-double');

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

  const saveProfile = (token, payload) =>
    sendJsonWithToken(server.baseUrl, '/api/profile', { method: 'PATCH', token, payload });

  const read = (token) => getWithToken(server.baseUrl, '/api/career-twin', token);

  const generate = (token, query = '') =>
    sendWithToken(server.baseUrl, `/api/career-twin${query}`, { method: 'POST', token });

  /** A profile with enough in it to build a twin from. */
  const POPULATED = {
    academic: { degree: 'B.Tech', branch: 'Computer Science and Engineering', graduationYear: 2027 },
    career: { targetRole: 'Backend Developer', careerInterests: ['Distributed systems'] },
    skills: [
      { name: 'Node.js', level: 'advanced' },
      { name: 'MongoDB', level: 'intermediate' },
    ],
    projects: [{ title: 'Nexora', technologies: ['React', 'Express'] }],
  };

  // --------------------------------------------------------- authentication

  it('protects both routes', async () => {
    for (const method of ['GET', 'POST']) {
      const { status, body } = await requestWithHeaders(server.baseUrl, '/api/career-twin', {
        method,
      });

      assert.equal(status, 401, `${method} was not protected`);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
    }
  });

  // ------------------------------------------------------------ empty state

  describe('GET /api/career-twin', () => {
    it('reports that none exists rather than failing', async () => {
      const token = await signUp('notwin@example.com');

      const { status, body } = await read(token);

      assert.equal(status, 200);
      assert.equal(body.data.exists, false);
      assert.equal(body.data.careerTwin, null);
    });

    it('does not generate one as a side effect of reading', async () => {
      const token = await signUp('noside@example.com');
      await saveProfile(token, POPULATED);

      await read(token);
      const { body } = await read(token);

      // A read that wrote would make GET a mutation and hide staleness.
      assert.equal(body.data.exists, false);
    });
  });

  // ------------------------------------------------------------- generation

  describe('POST /api/career-twin', () => {
    it('refuses when there is nothing to build from', async () => {
      const token = await signUp('nodata@example.com');

      const { status, body } = await generate(token);

      // An empty twin would report zero skills as a finding about the
      // student, when it is only a finding about what they have entered.
      assert.equal(status, 409);
      assert.equal(body.errorCode, ERROR_CODES.CAREER_TWIN_NO_INPUT);
    });

    it('builds a twin with no AI provider configured', async () => {
      const token = await signUp('noai@example.com');
      await saveProfile(token, POPULATED);

      const { status, body } = await generate(token);
      const twin = body.data.careerTwin;

      // Nexora's shipped state. The twin must be complete anyway.
      assert.equal(status, 200);
      assert.equal(twin.skills.length, 4); // Node.js, MongoDB, React, Express
      assert.equal(twin.narrative, null);
      assert.ok(twin.generatedAt);
    });

    it('records evidence and strength for every skill', async () => {
      const token = await signUp('evidence@example.com');
      await saveProfile(token, POPULATED);

      const { body } = await generate(token);

      for (const skill of body.data.careerTwin.skills) {
        assert.ok(skill.evidence.length > 0, `${skill.name} has no evidence`);
        assert.ok(['claimed', 'supported', 'verified'].includes(skill.strength));
        assert.ok(skill.evidence[0].detail.length > 0);
      }

      const react = body.data.careerTwin.skills.find((skill) => skill.name === 'React');
      assert.equal(react.strength, 'supported');
    });

    it('never reports a verified skill, because nothing can verify one yet', async () => {
      const token = await signUp('unverified@example.com');
      await saveProfile(token, POPULATED);

      const { body } = await generate(token);

      // Assessments and interviews are Phase 8. Claiming otherwise would be
      // the overstatement the evidence model exists to prevent.
      assert.equal(body.data.careerTwin.indicators.verified, 0);
    });

    it('persists the twin, so a later read returns it', async () => {
      const token = await signUp('persist@example.com');
      await saveProfile(token, POPULATED);
      await generate(token);

      const { body } = await read(token);

      assert.equal(body.data.exists, true);
      assert.equal(body.data.careerTwin.skills.length, 4);
      assert.equal(body.data.careerTwin.isStale, false);
    });

    it('replaces the previous twin rather than adding one', async () => {
      const token = await signUp('replace@example.com');
      await saveProfile(token, POPULATED);
      await generate(token);

      await saveProfile(token, { skills: [{ name: 'Go', level: 'beginner' }] });
      const { body } = await generate(token);

      const names = body.data.careerTwin.skills.map((skill) => skill.name);
      assert.ok(names.includes('Go'));
      assert.ok(!names.includes('MongoDB'), 'the old skill list survived');
    });

    it('includes skills from an analysed resume', async () => {
      const token = await signUp('resume@example.com');
      await saveProfile(token, { skills: [{ name: 'Node.js', level: 'advanced' }] });

      // Analyse a resume so it contributes.
      withProvider();
      const analysisDouble = double.state.respond;
      double.state.respond = () =>
        JSON.stringify({ skills: [{ name: 'Redis' }, { name: 'Express' }] });

      const { body: created } = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
        method: 'POST',
        token,
        payload: { text: RESUME_TEXT, label: 'My CV' },
      });
      await sendWithToken(server.baseUrl, `/api/resumes/${created.data.resume.id}/analysis`, {
        method: 'POST',
        token,
      });

      double.state.respond = analysisDouble;
      useAiProvider(null);

      const { body } = await generate(token);
      const names = body.data.careerTwin.skills.map((skill) => skill.name);

      assert.ok(names.includes('Redis'), 'resume skill missing from the twin');
      assert.equal(body.data.careerTwin.indicators.analysedResumeCount, 1);
    });
  });

  // -------------------------------------------------------------- staleness

  describe('staleness', () => {
    it('reports a twin as stale after the profile changes', async () => {
      const token = await signUp('stale@example.com');
      await saveProfile(token, POPULATED);
      await generate(token);

      await saveProfile(token, { career: { targetRole: 'Data Engineer' } });

      const { body } = await read(token);

      assert.equal(body.data.careerTwin.isStale, true);
      assert.match(body.data.careerTwin.staleReasons[0], /profile has changed/);
    });

    it('is fresh again after regenerating', async () => {
      const token = await signUp('refresh@example.com');
      await saveProfile(token, POPULATED);
      await generate(token);
      await saveProfile(token, { career: { targetRole: 'Data Engineer' } });

      const { body } = await generate(token);

      assert.equal(body.data.careerTwin.isStale, false);
      assert.deepEqual(body.data.careerTwin.staleReasons, []);
    });
  });

  // -------------------------------------------------------------- ownership

  describe('ownership', () => {
    it('never returns one student the twin of another', async () => {
      const alice = await signUp('alice@example.com');
      const bob = await signUp('bob@example.com');

      await saveProfile(alice, POPULATED);
      await generate(alice);

      const { body } = await read(bob);

      assert.equal(body.data.exists, false);
    });

    it('builds each student\'s twin from their own data only', async () => {
      const alice = await signUp('alice2@example.com');
      const bob = await signUp('bob2@example.com');

      await saveProfile(alice, POPULATED);
      await saveProfile(bob, { skills: [{ name: 'Figma', level: 'advanced' }] });

      await generate(alice);
      const { body } = await generate(bob);

      const names = body.data.careerTwin.skills.map((skill) => skill.name);
      assert.deepEqual(names, ['Figma']);
    });
  });

  // -------------------------------------------------------------- narrative

  describe('narrative', () => {
    it('is absent unless asked for', async () => {
      withProvider();
      const token = await signUp('nonarrative@example.com');
      await saveProfile(token, POPULATED);

      const { body } = await generate(token);

      assert.equal(body.data.careerTwin.narrative, null);
      assert.equal(double.state.calls, 0, 'the model was called without being asked');
    });

    it('is written when asked for and a provider is configured', async () => {
      withProvider();
      const token = await signUp('narrative@example.com');
      await saveProfile(token, POPULATED);

      const { body } = await generate(token, '?narrative=true');
      const narrative = body.data.careerTwin.narrative;

      assert.equal(narrative.text, 'You have claimed Node.js and MongoDB.');
      assert.equal(narrative.provider, 'twin-double');
      assert.equal(narrative.model, 'twin-model-v1');
      // The payload says so, not just the documentation: a client must be
      // able to label it, and no later phase may treat it as computable fact.
      assert.equal(narrative.isModelWritten, true);
    });

    it('sends no personal details to the provider', async () => {
      withProvider();
      const token = await signUp('privacy@example.com');
      await saveProfile(token, {
        ...POPULATED,
        personal: { phone: '+91 98765 43210', city: 'Bhopal' },
      });

      await generate(token, '?narrative=true');
      const sent = `${double.state.lastRequest.system}\n${double.state.lastRequest.user}`;

      // A summary of what someone can do does not need to know who they are.
      assert.ok(!sent.includes('98765'), 'the phone number was sent');
      assert.ok(!sent.includes('privacy@example.com'), 'the email was sent');
      assert.ok(!sent.includes('Gaurav'), 'the name was sent');
    });

    it('still builds the twin when no provider is configured', async () => {
      const token = await signUp('nonprovider@example.com');
      await saveProfile(token, POPULATED);

      const { status, body } = await generate(token, '?narrative=true');

      // Asking for a summary that cannot be written is not an error.
      assert.equal(status, 200);
      assert.equal(body.data.careerTwin.narrative, null);
      assert.equal(body.data.careerTwin.skills.length, 4);
    });

    it('rejects a summary that credits a skill the student does not have', async () => {
      withProvider();
      double.state.respond = () =>
        JSON.stringify({ summary: 'You have a strong foundation in Node.js and Kubernetes.' });

      const token = await signUp('invented@example.com');
      await saveProfile(token, POPULATED);

      const { status, body } = await generate(token, '?narrative=true');

      assert.equal(status, 200);
      // Rejected whole, not edited: removing the untrue clause leaves a
      // sentence whose point rested on it.
      assert.equal(body.data.careerTwin.narrative, null);
      assert.equal(body.data.careerTwin.skills.length, 4, 'the twin was damaged by a bad summary');
    });

    it('survives a provider that returns nonsense', async () => {
      withProvider();
      double.state.respond = () => 'I cannot help with that.';

      const token = await signUp('nonsense@example.com');
      await saveProfile(token, POPULATED);

      const { status, body } = await generate(token, '?narrative=true');

      assert.equal(status, 200);
      assert.equal(body.data.careerTwin.narrative, null);
      assert.equal(body.data.careerTwin.skills.length, 4);
    });

    it('survives a provider that is down', async () => {
      withProvider();
      double.state.respond = () => new Error('connect ETIMEDOUT');

      const token = await signUp('down@example.com');
      await saveProfile(token, POPULATED);

      const { status, body } = await generate(token, '?narrative=true');

      // The twin is already complete and correct. Failing the whole
      // generation over a decoration would throw away good data.
      assert.equal(status, 200);
      assert.equal(body.data.careerTwin.narrative, null);
      assert.equal(body.data.careerTwin.skills.length, 4);
    });
  });
});
