import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { PROCESSING_STATUS, RESUME_LIMITS } from '../src/constants/resumePolicy.js';
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
 * Resume API.
 *
 * Analysis is exercised through a provider double registered at the same
 * boundary a real provider would use. That is the point of the boundary: a
 * test can make the model return malformed JSON, invent a skill, or fall over
 * entirely, and check that none of it reaches the database.
 *
 * Nexora ships with no provider, so the unconfigured case is also the default
 * one — and it is tested first.
 */

const PASSWORD = 'Str0ngPassphrase';

const RESUME_TEXT = `Gaurav Shivhare
gaurav@example.com | +91 98765 43210 | Bhopal

EDUCATION
Maulana Azad National Institute of Technology, B.Tech CSE, 2027, 8.4 CGPA

SKILLS
Node.js, Express, MongoDB, React

PROJECTS
Nexora - a career readiness platform built with React and Express.`;

/** A well-formed extraction of the resume above. */
const GOOD_EXTRACTION = {
  basics: { fullName: 'Gaurav Shivhare', email: 'gaurav@example.com', location: 'Bhopal' },
  education: [{ institution: 'Maulana Azad National Institute of Technology', endYear: 2027 }],
  skills: [{ name: 'Node.js' }, { name: 'MongoDB' }],
  projects: [{ title: 'Nexora', technologies: ['React', 'Express'] }],
};

/**
 * A provider double whose next response the test decides.
 *
 * Registered through the real `registerAiProvider`, so this exercises the
 * same resolution path a production adapter would.
 */
function createProviderDouble() {
  const state = { respond: () => JSON.stringify(GOOD_EXTRACTION), calls: 0 };

  return {
    state,
    provider: {
      name: 'test-double',
      async complete(request) {
        state.calls += 1;
        state.lastRequest = request;

        const response = state.respond();
        if (response instanceof Error) throw response;

        return { text: response, model: 'test-model-v1' };
      },
    },
  };
}

describe('resumes', () => {
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
    await clearResumes();
    await clearProfiles();
    await clearUsers();

    // Every test starts with NO provider selected — Nexora's shipped state.
    // A test that needs analysis opts in explicitly.
    useAiProvider(null);
    double.state.respond = () => JSON.stringify(GOOD_EXTRACTION);
    double.state.calls = 0;
  });

  /** Selects the provider double for the current test. */
  const withProvider = () => useAiProvider('test-double');

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

  const create = (token, payload = { text: RESUME_TEXT }) =>
    sendJsonWithToken(server.baseUrl, '/api/resumes', { method: 'POST', token, payload });

  const list = (token) => getWithToken(server.baseUrl, '/api/resumes', token);

  const read = (token, id) => getWithToken(server.baseUrl, `/api/resumes/${id}`, token);

  const destroy = (token, id) =>
    sendWithToken(server.baseUrl, `/api/resumes/${id}`, { method: 'DELETE', token });

  const analyse = (token, id) =>
    sendWithToken(server.baseUrl, `/api/resumes/${id}/analysis`, { method: 'POST', token });

  /** Creates a resume and returns its id. */
  async function createResume(token) {
    const { body } = await create(token);
    return body.data.resume.id;
  }

  const errorFor = (body, field) => body.details?.find((detail) => detail.field === field);

  // --------------------------------------------------------- authentication

  describe('authentication', () => {
    it('refuses every route without a token', async () => {
      const routes = [
        ['GET', '/api/resumes'],
        ['POST', '/api/resumes'],
        ['GET', '/api/resumes/000000000000000000000000'],
        ['DELETE', '/api/resumes/000000000000000000000000'],
        ['POST', '/api/resumes/000000000000000000000000/analysis'],
      ];

      for (const [method, path] of routes) {
        const { status, body } = await requestWithHeaders(server.baseUrl, path, { method });

        assert.equal(status, 401, `${method} ${path} was not protected`);
        assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
      }
    });
  });

  // -------------------------------------------------------------- creation

  describe('POST /api/resumes', () => {
    it('stores a resume and marks extraction complete but analysis pending', async () => {
      const token = await signUp('create@example.com');

      const { status, body } = await create(token);
      const resume = body.data.resume;

      assert.equal(status, 201);
      assert.equal(resume.source, 'pasted_text');
      assert.equal(resume.extractedText, RESUME_TEXT);
      assert.equal(resume.extraction.status, PROCESSING_STATUS.COMPLETED);
      assert.equal(resume.analysis.status, PROCESSING_STATUS.PENDING);
      assert.equal(resume.parsed, null);
      assert.equal(resume.hasParsedData, false);
    });

    it('does not call the AI when a resume is stored', async () => {
      withProvider();
      const token = await signUp('nocall@example.com');

      await create(token);

      // Storing a document and spending money on a model are separate
      // decisions. Creating must never trigger the second.
      assert.equal(double.state.calls, 0);
    });

    it('accepts an optional label', async () => {
      const token = await signUp('label@example.com');

      const { body } = await create(token, { text: RESUME_TEXT, label: 'Internship 2026' });

      assert.equal(body.data.resume.label, 'Internship 2026');
    });

    it('rejects an empty body', async () => {
      const token = await signUp('empty@example.com');

      const { status, body } = await create(token, {});

      assert.equal(status, 400);
      assert.ok(errorFor(body, 'text'));
    });

    it('rejects text that is too short to be a resume', async () => {
      const token = await signUp('short@example.com');

      const { status, body } = await create(token, { text: 'Gaurav' });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'text').message, /at least/);
    });

    it('rejects text beyond the stored limit', async () => {
      const token = await signUp('long@example.com');

      const { status, body } = await create(token, { text: 'a'.repeat(RESUME_LIMITS.text.max + 1) });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'text').message, /at most/);
    });

    it('rejects file upload, which is not built yet, rather than ignoring it', async () => {
      const token = await signUp('upload@example.com');

      const { status, body } = await create(token, { text: RESUME_TEXT, source: 'file_upload' });

      assert.equal(status, 400);
      assert.match(errorFor(body, 'source').message, /not available yet/);
    });

    it('rejects an unrecognised field', async () => {
      const token = await signUp('unknownfield@example.com');

      const { status, body } = await create(token, { text: RESUME_TEXT, user: 'someone-else' });

      assert.equal(status, 400);
      assert.ok(errorFor(body, 'user'));
    });

    it('enforces the per-user limit', async () => {
      const token = await signUp('limit@example.com');

      for (let index = 0; index < RESUME_LIMITS.perUser; index += 1) {
        const { status } = await create(token);
        assert.equal(status, 201);
      }

      const { status, body } = await create(token);

      assert.equal(status, 409);
      assert.match(body.message, /up to 10 resumes/);
    });
  });

  // -------------------------------------------------------------- ownership

  describe('ownership', () => {
    it('lists only the caller\'s own resumes', async () => {
      const alice = await signUp('alice@example.com');
      const bob = await signUp('bob@example.com');

      await create(alice, { text: RESUME_TEXT, label: "Alice's" });

      const { body } = await list(bob);

      assert.equal(body.data.count, 0);
      assert.deepEqual(body.data.resumes, []);
    });

    it('answers 404, not 403, for a resume belonging to someone else', async () => {
      const alice = await signUp('alice2@example.com');
      const bob = await signUp('bob2@example.com');

      const id = await createResume(alice);
      const { status, body } = await read(bob, id);

      // "Not yours" and "not there" must look identical, or the endpoint
      // becomes a way to discover which ids exist.
      assert.equal(status, 404);
      assert.equal(body.errorCode, ERROR_CODES.RESUME_NOT_FOUND);
    });

    it('refuses to delete another student\'s resume, and leaves it intact', async () => {
      const alice = await signUp('alice3@example.com');
      const bob = await signUp('bob3@example.com');

      const id = await createResume(alice);

      const { status } = await destroy(bob, id);
      assert.equal(status, 404);

      const stillThere = await read(alice, id);
      assert.equal(stillThere.status, 200);
    });

    it('refuses to analyse another student\'s resume', async () => {
      withProvider();
      const alice = await signUp('alice4@example.com');
      const bob = await signUp('bob4@example.com');

      const id = await createResume(alice);
      const { status } = await analyse(bob, id);

      assert.equal(status, 404);
      assert.equal(double.state.calls, 0, 'the AI was called for a resume the caller does not own');
    });

    it('treats a malformed id as not found rather than a bad request', async () => {
      const token = await signUp('badid@example.com');

      // A 400 "invalid identifier" would tell a caller their id was merely
      // misspelled, which is a different answer from "not yours".
      const { status, body } = await read(token, 'not-an-object-id');

      assert.equal(status, 404);
      assert.equal(body.errorCode, ERROR_CODES.RESUME_NOT_FOUND);
    });
  });

  // ------------------------------------------------------------- retrieval

  describe('GET /api/resumes', () => {
    it('returns an empty list, not an error, for a new account', async () => {
      const token = await signUp('none@example.com');

      const { status, body } = await list(token);

      assert.equal(status, 200);
      assert.equal(body.data.count, 0);
    });

    it('omits the full text from the list', async () => {
      const token = await signUp('summary@example.com');
      await create(token);

      const { body } = await list(token);

      // Ten resumes would otherwise transfer ten full documents to render
      // ten rows.
      assert.equal(body.data.resumes[0].extractedText, undefined);
      assert.equal(body.data.resumes[0].textLength, RESUME_TEXT.length);
    });

    it('returns the newest first', async () => {
      const token = await signUp('order@example.com');

      await create(token, { text: RESUME_TEXT, label: 'First' });
      await create(token, { text: RESUME_TEXT, label: 'Second' });

      const { body } = await list(token);

      assert.equal(body.data.resumes[0].label, 'Second');
    });
  });

  describe('DELETE /api/resumes/:id', () => {
    it('deletes a resume', async () => {
      const token = await signUp('delete@example.com');
      const id = await createResume(token);

      const { status } = await destroy(token, id);
      assert.equal(status, 200);

      const { status: afterStatus } = await read(token, id);
      assert.equal(afterStatus, 404);
    });

    it('answers 404 when it has already gone', async () => {
      const token = await signUp('delete2@example.com');
      const id = await createResume(token);

      await destroy(token, id);
      const { status } = await destroy(token, id);

      assert.equal(status, 404);
    });
  });

  // -------------------------------------------------------------- analysis

  describe('POST /api/resumes/:id/analysis — no provider', () => {
    it('answers 503 and says so, rather than inventing data', async () => {
      const token = await signUp('noprovider@example.com');
      const id = await createResume(token);

      const { status, body } = await analyse(token, id);

      assert.equal(status, 503);
      assert.equal(body.errorCode, ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED);
      assert.match(body.message, /no AI provider is configured/);
    });

    it('leaves the resume untouched when there is nothing to analyse with', async () => {
      const token = await signUp('noprovider2@example.com');
      const id = await createResume(token);

      await analyse(token, id);

      const { body } = await read(token, id);

      // Not marked failed: nothing was attempted, and a failure the student
      // did not cause would be misleading.
      assert.equal(body.data.resume.analysis.status, PROCESSING_STATUS.PENDING);
      assert.equal(body.data.resume.parsed, null);
    });

    it('answers 503 when the configured provider is not registered', async () => {
      useAiProvider('a-provider-nobody-registered');

      const token = await signUp('unregistered@example.com');
      const id = await createResume(token);

      const { status, body } = await analyse(token, id);

      assert.equal(status, 503);
      assert.equal(body.errorCode, ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED);
    });
  });

  describe('POST /api/resumes/:id/analysis — success', () => {
    it('stores validated, grounded data and records what produced it', async () => {
      withProvider();
      const token = await signUp('analyse@example.com');
      const id = await createResume(token);

      const { status, body } = await analyse(token, id);
      const resume = body.data.resume;

      assert.equal(status, 200);
      assert.equal(resume.analysis.status, PROCESSING_STATUS.COMPLETED);
      assert.ok(resume.analysis.completedAt);
      assert.equal(resume.analysis.error, null);

      assert.deepEqual(resume.parsed.skills, [{ name: 'Node.js' }, { name: 'MongoDB' }]);
      assert.equal(resume.parsed.basics.email, 'gaurav@example.com');
      assert.deepEqual(resume.warnings, []);

      // An output must always be traceable to what produced it.
      assert.equal(resume.analysedBy.provider, 'test-double');
      assert.equal(resume.analysedBy.model, 'test-model-v1');
      assert.equal(resume.analysedBy.schemaVersion, 1);
    });

    it('persists the result, so a later read returns it', async () => {
      withProvider();
      const token = await signUp('persist@example.com');
      const id = await createResume(token);

      await analyse(token, id);
      const { body } = await read(token, id);

      assert.equal(body.data.resume.hasParsedData, true);
      assert.equal(body.data.resume.parsed.skills.length, 2);
    });

    it('sends the resume text to the provider, and nothing else', async () => {
      withProvider();
      const token = await signUp('prompt@example.com');
      const id = await createResume(token);

      await analyse(token, id);

      assert.ok(double.state.lastRequest.user.includes(RESUME_TEXT));
      assert.match(double.state.lastRequest.system, /Return ONLY a JSON object/);
    });

    it('reads a response the model wrapped in a code fence', async () => {
      withProvider();
      double.state.respond = () => '```json\n' + JSON.stringify(GOOD_EXTRACTION) + '\n```';

      const token = await signUp('fenced@example.com');
      const id = await createResume(token);

      const { status, body } = await analyse(token, id);

      assert.equal(status, 200);
      assert.equal(body.data.resume.parsed.skills.length, 2);
    });

    it('can be run again, replacing the previous result', async () => {
      withProvider();
      const token = await signUp('rerun@example.com');
      const id = await createResume(token);

      await analyse(token, id);
      double.state.respond = () => JSON.stringify({ skills: [{ name: 'Express' }] });
      const { body } = await analyse(token, id);

      assert.deepEqual(body.data.resume.parsed.skills, [{ name: 'Express' }]);
      assert.equal(double.state.calls, 2);
    });
  });

  describe('POST /api/resumes/:id/analysis — untrusted output', () => {
    it('drops an invented skill and tells the student it did', async () => {
      withProvider();
      double.state.respond = () =>
        JSON.stringify({
          skills: [{ name: 'Node.js' }, { name: 'Docker' }, { name: 'Kubernetes' }],
        });

      const token = await signUp('invented@example.com');
      const id = await createResume(token);

      const { status, body } = await analyse(token, id);
      const resume = body.data.resume;

      assert.equal(status, 200);
      // The resume never mentions Docker or Kubernetes.
      assert.deepEqual(resume.parsed.skills, [{ name: 'Node.js' }]);
      assert.equal(resume.warnings.length, 2);
      assert.ok(resume.warnings.some((warning) => /Docker/.test(warning)));
      assert.match(body.message, /dropped as unverifiable/);
    });

    it('fails, and stores nothing, when the response is not JSON', async () => {
      withProvider();
      double.state.respond = () => 'I am unable to help with that request.';

      const token = await signUp('notjson@example.com');
      const id = await createResume(token);

      const { status, body } = await analyse(token, id);

      assert.equal(status, 502);
      assert.equal(body.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);

      const { body: after } = await read(token, id);
      assert.equal(after.data.resume.analysis.status, PROCESSING_STATUS.FAILED);
      assert.ok(after.data.resume.analysis.error);
      assert.equal(after.data.resume.parsed, null, 'untrusted output was stored');
    });

    it('fails when a section has the wrong type', async () => {
      withProvider();
      double.state.respond = () => JSON.stringify({ skills: 'Node.js, MongoDB' });

      const token = await signUp('wrongshape@example.com');
      const id = await createResume(token);

      const { status, body } = await analyse(token, id);

      assert.equal(status, 502);
      assert.equal(body.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);

      const { body: after } = await read(token, id);
      assert.equal(after.data.resume.parsed, null);
    });

    it('never stores a proficiency level the model invented', async () => {
      withProvider();
      double.state.respond = () =>
        JSON.stringify({ skills: [{ name: 'Node.js', proficiency: 'expert' }] });

      const token = await signUp('proficiency@example.com');
      const id = await createResume(token);

      const { body } = await analyse(token, id);

      // A resume says someone listed a skill, not how good they are at it.
      assert.deepEqual(body.data.resume.parsed.skills, [{ name: 'Node.js' }]);
    });

    it('keeps the previous good result when a re-analysis fails', async () => {
      withProvider();
      const token = await signUp('keepold@example.com');
      const id = await createResume(token);

      await analyse(token, id);

      double.state.respond = () => 'not json at all';
      const { status } = await analyse(token, id);
      assert.equal(status, 502);

      const { body } = await read(token, id);

      // The old reading was valid when it was made. Deleting it because a
      // later attempt failed would be strictly worse than keeping it beside
      // a visible failure.
      assert.equal(body.data.resume.analysis.status, PROCESSING_STATUS.FAILED);
      assert.equal(body.data.resume.parsed.skills.length, 2);
      assert.equal(body.data.resume.analysedBy.model, 'test-model-v1');
    });

    it('does not leak the resume back through an error message', async () => {
      withProvider();
      double.state.respond = () => `Gaurav Shivhare gaurav@example.com is a strong candidate.`;

      const token = await signUp('leak@example.com');
      const id = await createResume(token);

      const { body } = await analyse(token, id);
      const { body: after } = await read(token, id);

      // Errors are logged and stored. Personal data must not travel in one.
      assert.ok(!body.message.includes('gaurav@example.com'));
      assert.ok(!after.data.resume.analysis.error.includes('gaurav@example.com'));
    });
  });

  describe('POST /api/resumes/:id/analysis — provider failure', () => {
    it('answers 503 and records the failure when the provider throws', async () => {
      withProvider();
      double.state.respond = () => new Error('connect ECONNREFUSED 10.0.0.1:443');

      const token = await signUp('providerdown@example.com');
      const id = await createResume(token);

      const { status, body } = await analyse(token, id);

      assert.equal(status, 503);
      assert.equal(body.errorCode, ERROR_CODES.AI_PROVIDER_FAILED);
      // The provider's own message can carry request ids and internals.
      assert.ok(!body.message.includes('ECONNREFUSED'));

      const { body: after } = await read(token, id);
      assert.equal(after.data.resume.analysis.status, PROCESSING_STATUS.FAILED);
      assert.equal(after.data.resume.parsed, null);
    });

    it('answers 503 when the provider resolves with no text', async () => {
      withProvider();
      const token = await signUp('notext@example.com');
      const id = await createResume(token);

      // A provider that resolves with the wrong shape is as broken as one
      // that throws, and must not surface later as a confusing parse failure.
      const original = double.provider.complete;
      double.provider.complete = async () => ({ model: 'test-model-v1' });

      const { status, body } = await analyse(token, id);
      double.provider.complete = original;

      assert.equal(status, 503);
      assert.equal(body.errorCode, ERROR_CODES.AI_PROVIDER_FAILED);
    });
  });
});
