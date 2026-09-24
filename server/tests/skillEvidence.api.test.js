import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
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

const PASSWORD = 'Str0ngPassphrase';
let counter = 0;
let server;

describe('skill evidence API contract', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearSkillEvidenceChecks();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();
  });

  async function signUp(label, role = 'student') {
    counter += 1;
    const email = `evidence.${label}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: label,
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    if (role !== 'student') {
      await mongoose.connection.collection('users').updateOne({ email }, { $set: { role } });
    }
    return body.data.token;
  }

  it('forbids students from recording their own results directly', async () => {
    const student = await signUp('self-grader');

    const assessment = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/assessments', {
      method: 'POST',
      token: student,
      payload: { skill: 'docker', score: 1, assessmentId: 'self-graded' },
    });
    assert.equal(assessment.status, 403);
    assert.equal(assessment.body.success, false);
    assert.equal(assessment.body.errorCode, 'FORBIDDEN');

    const interview = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/interviews', {
      method: 'POST',
      token: student,
      payload: { skill: 'python', score: 1, interviewId: 'self-graded', evaluatedBy: 'human' },
    });
    assert.equal(interview.status, 403);
    assert.equal(interview.body.errorCode, 'FORBIDDEN');

    assert.equal(await mongoose.connection.collection('skillevidencechecks').countDocuments(), 0);
  });

  it('requires authentication and keeps results owner-scoped', async () => {
    const anonymous = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/assessments', {
      method: 'POST',
      payload: { skill: 'Docker', score: 1, assessmentId: 'a-anonymous' },
    });
    assert.equal(anonymous.status, 401);

    const owner = await signUp('owner', 'admin');
    const stranger = await signUp('stranger');
    const created = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/assessments', {
      method: 'POST',
      token: owner,
      payload: {
        skill: 'docker',
        score: 0.9,
        assessmentId: 'assessment-owner-1',
        completedAt: '2026-09-22T00:00:00.000Z',
      },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.data.assessment.eligibleForVerified, true);
    assert.equal(created.body.data.assessment.skillKey, 'docker');

    const strangerResults = await getWithToken(server.baseUrl, '/api/skill-evidence', stranger);
    assert.equal(strangerResults.status, 200);
    assert.deepEqual(strangerResults.body.data.checks, []);
  });

  it('keeps AI interview claims uncertain and feeds only eligible results to CareerTwin', async () => {
    const token = await signUp('reviewer', 'admin');
    const interview = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/interviews', {
      method: 'POST',
      token,
      payload: {
        skill: 'Python',
        score: 1,
        interviewId: 'interview-ai-1',
        evaluatedBy: 'ai',
      },
    });
    assert.equal(interview.status, 201);
    assert.equal(interview.body.data.interview.outcome, 'uncertain');
    assert.equal(interview.body.data.interview.eligibleForVerified, false);

    const human = await sendJsonWithToken(server.baseUrl, '/api/skill-evidence/interviews', {
      method: 'POST',
      token,
      payload: {
        skill: 'Python',
        score: 0.75,
        interviewId: 'interview-human-1',
        evaluatedBy: 'human',
      },
    });
    assert.equal(human.status, 201);
    assert.equal(human.body.data.interview.eligibleForVerified, true);

    const twin = await sendWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token,
    });
    assert.equal(twin.status, 200);
    const python = twin.body.data.careerTwin.skills.find((skill) => skill.key === 'python');
    assert.equal(python.strength, 'verified');
    assert.equal(python.evidence[0].reference, 'interview-human-1');
  });
});
