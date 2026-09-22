import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  PROCESSING_STALE_AFTER_MS,
  PROCESSING_STATUS,
} from '../src/constants/resumePolicy.js';
import { Resume } from '../src/models/index.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import { clientGoneSignal } from '../src/utils/requestSignal.js';
import {
  clearResumes,
  clearUsers,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';

/**
 * Recovery paths in the analysis pipeline.
 *
 * The happy path and the malformed-output cases are covered by
 * resume.test.js. What is tested here is what happens when a run does not
 * end tidily: the process dies holding `processing`, or the student
 * disconnects while a provider call is in flight. Both leave state behind,
 * and both have to leave the student a way forward.
 */

const PASSWORD = 'Str0ngPassphrase';

const RESUME_TEXT = `Gaurav Shivhare
gaurav@example.com | Bhopal

SKILLS
Node.js, MongoDB, React

PROJECTS
Nexora - a career readiness platform built with React.`;

const GOOD_EXTRACTION = {
  basics: { fullName: 'Gaurav Shivhare', email: 'gaurav@example.com' },
  skills: [{ name: 'Node.js' }, { name: 'MongoDB' }],
};

describe('resume analysis recovery', () => {
  let server;
  let counter = 0;

  /** What the provider double does on its next call. */
  let behaviour = { kind: 'ok', value: JSON.stringify(GOOD_EXTRACTION) };
  let lastSignal = null;
  let callCount = 0;

  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: 'test-double',
      async complete(request) {
        callCount += 1;
        lastSignal = request.signal ?? null;

        if (behaviour.kind === 'hang') {
          // Resolves only when the caller's signal aborts, which is what a
          // real provider call being cancelled looks like from here.
          await new Promise((resolve, reject) => {
            if (!request.signal) return reject(new Error('no signal was propagated'));
            request.signal.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          });
        }

        if (behaviour.kind === 'throw') throw new Error('provider exploded');

        return { text: behaviour.value, model: 'test-model' };
      },
    });
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    await clearResumes();
    await clearUsers();
    resetRateLimiters();
    useAiProvider('test-double');
    behaviour = { kind: 'ok', value: JSON.stringify(GOOD_EXTRACTION) };
    lastSignal = null;
    callCount = 0;
  });

  async function signUp() {
    counter += 1;
    const email = `recovery.${Date.now()}.${counter}@example.com`;

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

  async function createResume(token) {
    const { body } = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: RESUME_TEXT },
    });

    return body.data.resume.id;
  }

  const analyse = (token, id) =>
    sendWithToken(server.baseUrl, `/api/resumes/${id}/analysis`, { method: 'POST', token });

  // ------------------------------------------------- a run still in flight

  it('refuses a second analysis while one is genuinely running', async () => {
    const token = await signUp();
    const id = await createResume(token);

    // A fresh `processing` claim, as a live run would leave it.
    await Resume.updateOne(
      { _id: id },
      { $set: { 'analysis.status': PROCESSING_STATUS.PROCESSING, 'analysis.startedAt': new Date() } },
    );

    const { status, body } = await analyse(token, id);

    assert.equal(status, 409);
    assert.equal(body.errorCode, ERROR_CODES.RESUME_ANALYSIS_IN_PROGRESS);
    assert.equal(callCount, 0, 'the provider was called despite the conflict');
  });

  // ------------------------------------------------- an abandoned run

  it('lets an abandoned run be retried instead of stranding the resume', async () => {
    const token = await signUp();
    const id = await createResume(token);

    // What a crash or a deploy mid-analysis leaves behind: `processing`,
    // with a start time long past. Nothing is still running, so a 409 here
    // would tell the student to wait for something that will never finish.
    const longAgo = new Date(Date.now() - PROCESSING_STALE_AFTER_MS - 60_000);
    await Resume.updateOne(
      { _id: id },
      { $set: { 'analysis.status': PROCESSING_STATUS.PROCESSING, 'analysis.startedAt': longAgo } },
    );

    const { status, body } = await analyse(token, id);

    assert.equal(status, 200, 'an abandoned run left the resume permanently stuck');
    assert.equal(body.data.resume.analysis.status, PROCESSING_STATUS.COMPLETED);
    assert.equal(callCount, 1);
  });

  it('treats a processing claim with no start time as abandoned', async () => {
    const token = await signUp();
    const id = await createResume(token);

    // Written by something that did not follow this path. The safe reading
    // is the one that leaves a way forward rather than a permanent 409.
    await Resume.updateOne(
      { _id: id },
      {
        $set: { 'analysis.status': PROCESSING_STATUS.PROCESSING },
        $unset: { 'analysis.startedAt': '' },
      },
    );

    const { status } = await analyse(token, id);
    assert.equal(status, 200);
  });

  // ------------------------------------------------------- cancellation

  it('propagates a cancellation signal to the provider', async () => {
    const token = await signUp();
    const id = await createResume(token);

    await analyse(token, id);

    // The pipeline must hand the provider something it can abort on. Without
    // this, closing the tab still pays for the completion.
    assert.ok(lastSignal instanceof AbortSignal, 'no abort signal reached the provider');
    assert.equal(lastSignal.aborted, false);
  });

  it('records a failure when the provider throws, leaving a retry possible', async () => {
    const token = await signUp();
    const id = await createResume(token);

    behaviour = { kind: 'throw' };
    const failed = await analyse(token, id);
    assert.equal(failed.status, 503);
    assert.equal(failed.body.errorCode, ERROR_CODES.AI_PROVIDER_FAILED);

    // The status is FAILED, not PROCESSING — a failed run must not look like
    // a running one, or the retry below would be refused.
    const stored = await Resume.findById(id);
    assert.equal(stored.analysis.status, PROCESSING_STATUS.FAILED);
    assert.ok(stored.analysis.error, 'no reason was recorded');

    behaviour = { kind: 'ok', value: JSON.stringify(GOOD_EXTRACTION) };
    const retried = await analyse(token, id);
    assert.equal(retried.status, 200);
    assert.equal(retried.body.data.resume.analysis.status, PROCESSING_STATUS.COMPLETED);
    assert.equal(retried.body.data.resume.analysis.error, null);
  });

  // ------------------------------------------- the signal helper itself

  describe('clientGoneSignal', () => {
    it('does not abort when the response completed normally', () => {
      const listeners = new Map();
      const res = {
        writableEnded: false,
        once(event, handler) {
          listeners.set(event, handler);
        },
      };

      const signal = clientGoneSignal(res);

      // A healthy request: the reply is written, then the socket closes.
      res.writableEnded = true;
      listeners.get('close')();

      assert.equal(signal.aborted, false, 'a completed response was treated as a disconnect');
    });

    it('aborts when the socket closes before the reply was written', () => {
      const listeners = new Map();
      const res = {
        writableEnded: false,
        once(event, handler) {
          listeners.set(event, handler);
        },
      };

      const signal = clientGoneSignal(res);
      listeners.get('close')();

      assert.equal(signal.aborted, true);
    });
  });
});
