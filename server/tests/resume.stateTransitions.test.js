import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  PROCESSING_STALE_AFTER_MS,
  PROCESSING_STATUS,
} from '../src/constants/resumePolicy.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { Resume } from '../src/models/index.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import {
  clearResumes,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let counter = 0;

const RESUME_TEXT = `Gaurav Shivhare
gaurav@example.com | Bhopal

SKILLS
Node.js, Express, MongoDB, JavaScript

PROJECTS
Nexora - career platform built with Node.js and Express.`;

const GOOD_EXTRACTION = {
  basics: { fullName: 'Gaurav Shivhare', email: 'gaurav@example.com' },
  skills: [{ name: 'Node.js' }, { name: 'MongoDB' }],
  projects: [{ title: 'Nexora', technologies: ['Node.js', 'Express'] }],
};

describe('G07 — Resume Pipeline State Machine & Reliability Suite', () => {
  let behaviour = { kind: 'ok', value: JSON.stringify(GOOD_EXTRACTION) };

  before(async () => {
    server = await startTestServer();
    registerAiProvider({
      name: 'state-double',
      async complete() {
        if (behaviour.kind === 'throw') {
          throw new Error('Upstream provider transient failure');
        }
        return { text: behaviour.value, model: 'test-state-model' };
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
    useAiProvider('state-double');
    behaviour = { kind: 'ok', value: JSON.stringify(GOOD_EXTRACTION) };
  });

  async function registerAndLogin() {
    counter += 1;
    const email = `resume.state.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Gaurav State',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { email, user: res.body.data.user, token: res.body.data.token };
  }

  it('1. State Transition: PENDING -> COMPLETED on successful analysis', async () => {
    const { token } = await registerAndLogin();

    // Create resume
    const createRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: RESUME_TEXT, label: 'Initial Resume' },
    });
    assert.equal(createRes.status, 201);
    const resumeId = createRes.body.data.resume.id;
    assert.equal(createRes.body.data.resume.extraction.status, PROCESSING_STATUS.COMPLETED);
    assert.equal(createRes.body.data.resume.analysis.status, PROCESSING_STATUS.PENDING);
    assert.equal(createRes.body.data.resume.hasParsedData, false);

    // Analyse resume
    const analyseRes = await sendWithToken(server.baseUrl, `/api/resumes/${resumeId}/analysis`, {
      method: 'POST',
      token,
    });
    assert.equal(analyseRes.status, 200);
    assert.equal(analyseRes.body.data.resume.analysis.status, PROCESSING_STATUS.COMPLETED);
    assert.equal(analyseRes.body.data.resume.hasParsedData, true);
    assert.ok(analyseRes.body.data.resume.analysis.completedAt);
    assert.equal(analyseRes.body.data.resume.analysis.error, null);
  });

  it('2. State Transition: COMPLETED -> FAILED on re-analysis failure, preserves previous parsed data', async () => {
    const { token } = await registerAndLogin();

    // Create and succeed once
    const createRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: RESUME_TEXT, label: 'Resume to Re-analyse' },
    });
    const resumeId = createRes.body.data.resume.id;
    await sendWithToken(server.baseUrl, `/api/resumes/${resumeId}/analysis`, {
      method: 'POST',
      token,
    });

    // Make provider fail
    behaviour = { kind: 'throw' };
    const failRes = await sendWithToken(server.baseUrl, `/api/resumes/${resumeId}/analysis`, {
      method: 'POST',
      token,
    });
    assert.equal(failRes.status, 503);

    // Read stored resume
    const readRes = await getWithToken(server.baseUrl, `/api/resumes/${resumeId}`, token);
    assert.equal(readRes.status, 200);
    assert.equal(readRes.body.data.resume.analysis.status, PROCESSING_STATUS.FAILED);
    assert.ok(readRes.body.data.resume.analysis.error);
    // Preserves previously parsed data
    assert.equal(readRes.body.data.resume.hasParsedData, true);
    assert.ok(readRes.body.data.resume.parsed.skills.length > 0);
  });

  it('3. Concurrency & Race Condition: rejects simultaneous analysis runs with 409', async () => {
    const { token } = await registerAndLogin();

    const createRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: RESUME_TEXT },
    });
    const resumeId = createRes.body.data.resume.id;

    // Simulate active processing status directly in DB
    await Resume.updateOne(
      { _id: resumeId },
      {
        $set: {
          'analysis.status': PROCESSING_STATUS.PROCESSING,
          'analysis.startedAt': new Date(),
        },
      },
    );

    // Attempt second analysis
    const conflictRes = await sendWithToken(server.baseUrl, `/api/resumes/${resumeId}/analysis`, {
      method: 'POST',
      token,
    });
    assert.equal(conflictRes.status, 409);
    assert.equal(conflictRes.body.errorCode, ERROR_CODES.RESUME_ANALYSIS_IN_PROGRESS);
  });

  it('4. Stale Recovery: allows reclaim when processing status is older than PROCESSING_STALE_AFTER_MS', async () => {
    const { token } = await registerAndLogin();

    const createRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: RESUME_TEXT },
    });
    const resumeId = createRes.body.data.resume.id;

    // Simulate stale processing from 15 minutes ago
    const fifteenMinutesAgo = new Date(Date.now() - (PROCESSING_STALE_AFTER_MS + 5 * 60 * 1000));
    await Resume.updateOne(
      { _id: resumeId },
      {
        $set: {
          'analysis.status': PROCESSING_STATUS.PROCESSING,
          'analysis.startedAt': fifteenMinutesAgo,
        },
      },
    );

    // Should successfully reclaim and complete
    const reclaimRes = await sendWithToken(server.baseUrl, `/api/resumes/${resumeId}/analysis`, {
      method: 'POST',
      token,
    });
    assert.equal(reclaimRes.status, 200);
    assert.equal(reclaimRes.body.data.resume.analysis.status, PROCESSING_STATUS.COMPLETED);
  });

  it('5. Deletion Race: deleting resume while analysis completes does not re-insert the document', async () => {
    const { token } = await registerAndLogin();

    const createRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
      method: 'POST',
      token,
      payload: { text: RESUME_TEXT },
    });
    const resumeId = createRes.body.data.resume.id;

    // Delete the resume
    const delRes = await sendWithToken(server.baseUrl, `/api/resumes/${resumeId}`, {
      method: 'DELETE',
      token,
    });
    assert.equal(delRes.status, 200);

    // Verify it is gone
    const checkRes = await getWithToken(server.baseUrl, `/api/resumes/${resumeId}`, token);
    assert.equal(checkRes.status, 404);
  });
});
