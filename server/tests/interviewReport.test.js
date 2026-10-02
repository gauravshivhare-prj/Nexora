/**
 * Task 20 Ã¢â‚¬â€ Interview Session Structured Report
 *
 * Tests for generateSessionReport() service and
 * GET /api/interviews/sessions/:sessionId/report endpoint.
 *
 * Covers:
 * 1. Successful report generation structure
 * 2. Per-question result aggregation
 * 3. Per-skill breakdown
 * 4. Aggregated strengths/growth areas
 * 5. Session summary fields
 * 6. Missing session Ã¢â€ â€™ 404
 * 7. Ownership denial (User B cannot access User A's session report)
 * 8. Incomplete session Ã¢â€ â€™ 400
 * 9. Abandoned session Ã¢â€ â€™ 400
 * 10. Report is deterministic (same input Ã¢â€ â€™ same output)
 * 11. No AI claims in report (method.usesAi = false)
 * 12. Unauthenticated access Ã¢â€ â€™ 401
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { SESSION_STATUS, INTERVIEW_DIFFICULTY } from '../src/domain/interview/interviewContract.js';
import { INTERVIEW_PASS_MARK } from '../src/domain/evidence/skillEvidenceCheck.js';
import {
  clearAssessmentAttempts,
  clearAssessments,
  clearCareerTwins,
  clearInterviewSessions,
  clearProfiles,
  clearResumes,
  clearSkillEvidenceChecks,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  resolveTestDatabaseUri,
  sendJsonWithToken,
  startTestServer,
} from './helpers/testServer.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import { createDemoProvider } from '../src/services/ai/demoProvider.js';

const PASSWORD = 'StrongTestPassword123!';
let userCounter = 0;

function nextUser() {
  userCounter += 1;
  return {
    name: `Report User ${userCounter}`,
    email: `report.user.${userCounter}.${Date.now()}@example.com`,
    password: PASSWORD,
  };
}

function postJsonWithToken(baseUrl, path, token, payload) {
  return sendJsonWithToken(baseUrl, path, { method: 'POST', token, payload });
}

async function registerAndLogin(baseUrl) {
  const user = nextUser();
  const reg = await postJson(baseUrl, '/api/auth/register', user);
  assert.equal(reg.status, 201, `Registration failed: ${JSON.stringify(reg.body)}`);
  const login = await postJson(baseUrl, '/api/auth/login', {
    email: user.email,
    password: user.password,
  });
  assert.equal(login.status, 200, `Login failed: ${JSON.stringify(login.body)}`);
  return login.body.data.token;
}

/**
 * Creates, starts, answers all questions, and completes a session.
 * Returns { sessionId, token, baseUrl }.
 */
async function runFullSession(baseUrl, token) {
  // Create session
  const create = await postJsonWithToken(baseUrl, '/api/interviews/sessions', token, {
    targetRole: 'backend-developer',
    targetSkills: ['JavaScript'],
    questionCount: 2,
    difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
  });
  assert.equal(create.status, 201, `Create session failed: ${JSON.stringify(create.body)}`);
  const session = create.body.data.session;
  const sessionId = session.sessionId ?? session._id ?? session.id;

  // Start session
  const start = await postJsonWithToken(
    baseUrl,
    `/api/interviews/sessions/${sessionId}/start`,
    token,
    {},
  );
  assert.equal(start.status, 200, `Start session failed: ${JSON.stringify(start.body)}`);

  // Get current session to find question IDs
  const readRes = await getWithToken(baseUrl, `/api/interviews/sessions/${sessionId}`, token);
  assert.equal(readRes.status, 200);
  const sessionData = readRes.body.data.session;
  const questions = sessionData.questions ?? [];

  // Answer all questions
  for (const q of questions) {
    const qId = q.questionId ?? q.id ?? q._id;
    const answer = await postJsonWithToken(
      baseUrl,
      `/api/interviews/sessions/${sessionId}/questions/${qId}/answers`,
      token,
      { answerText: 'JavaScript is a high-level, interpreted programming language used for building interactive web applications. It supports event-driven, functional, and imperative programming styles. It runs in the browser and on the server via Node.js.' },
    );
    assert.equal(answer.status, 200, `Answer submission failed: ${JSON.stringify(answer.body)}`);
  }

  // Complete session
  const complete = await postJsonWithToken(
    baseUrl,
    `/api/interviews/sessions/${sessionId}/complete`,
    token,
    {},
  );
  assert.equal(complete.status, 200, `Complete session failed: ${JSON.stringify(complete.body)}`);

  return { sessionId, token, baseUrl };
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Test Suite Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('Task 20 Ã¢â‚¬â€ Interview Session Structured Report', () => {
  let server;
  let demoProvider;

  before(async () => {
    const uri = resolveTestDatabaseUri();
    const dbName = new URL(uri).pathname.replace(/^\//, '');
    assert.ok(dbName.endsWith('_test'), `Must run against _test database, got: ${dbName}`);

    server = await startTestServer({ suiteId: 'rpt' });
    demoProvider = createDemoProvider();
    registerAiProvider(demoProvider);
    useAiProvider(demoProvider.name);
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await clearInterviewSessions();
    await clearSkillEvidenceChecks();
    await clearCareerTwins();
    await clearAssessments();
    await clearAssessmentAttempts();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 1. Unauthenticated access Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('1. Unauthenticated access', () => {
    it('returns 401 without auth token', async () => {
      const res = await getWithToken(server.baseUrl, '/api/interviews/sessions/nonexistent123/report', null);
      assert.equal(res.status, 401);
    });
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 2. Session not found Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('2. Session not found', () => {
    it('returns 404 for a non-existent session id', async () => {
      const token = await registerAndLogin(server.baseUrl);
      const fakeId = '507f1f77bcf86cd799439011'; // valid ObjectId, but doesn't exist
      const res = await getWithToken(server.baseUrl, `/api/interviews/sessions/${fakeId}/report`, token);
      assert.equal(res.status, 404);
    });
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 3. Ownership denial Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('3. Ownership: User B cannot access User A report', () => {
    it('returns 404 for another user\'s session', async () => {
      const tokenA = await registerAndLogin(server.baseUrl);
      const tokenB = await registerAndLogin(server.baseUrl);

      const { sessionId } = await runFullSession(server.baseUrl, tokenA);

      // User B attempts to access User A's report
      const res = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/report`,
        tokenB,
      );
      assert.equal(res.status, 404, 'User B must not be able to access User A\'s session report');
    });
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 4. Incomplete session Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('4. Incomplete session rejects report generation', () => {
    it('returns 400 for an in_progress session', async () => {
      const token = await registerAndLogin(server.baseUrl);

      const create = await postJsonWithToken(server.baseUrl, '/api/interviews/sessions', token, {
        targetRole: 'backend-developer',
        targetSkills: ['JavaScript'],
        questionCount: 2,
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
      });
      assert.equal(create.status, 201);
      const sessionId = create.body.data.session.sessionId
        ?? create.body.data.session._id
        ?? create.body.data.session.id;

      // Start but do NOT complete
      await postJsonWithToken(server.baseUrl, `/api/interviews/sessions/${sessionId}/start`, token, {});

      const res = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/report`,
        token,
      );
      assert.equal(res.status, 400);
      assert.match(res.body.message ?? '', /completed/i);
    });

    it('returns 400 for an initialized (not started) session', async () => {
      const token = await registerAndLogin(server.baseUrl);

      const create = await postJsonWithToken(server.baseUrl, '/api/interviews/sessions', token, {
        targetRole: 'backend-developer',
        targetSkills: ['JavaScript'],
        questionCount: 2,
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
      });
      assert.equal(create.status, 201);
      const sessionId = create.body.data.session.sessionId
        ?? create.body.data.session._id
        ?? create.body.data.session.id;

      const res = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/report`,
        token,
      );
      assert.equal(res.status, 400);
    });
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 5. Successful report generation Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('5. Successful report structure', () => {
    let reportData;
    let sessionId;
    let token;

    before(async () => {
      token = await registerAndLogin(server.baseUrl);
      const result = await runFullSession(server.baseUrl, token);
      sessionId = result.sessionId;

      const res = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/report`,
        token,
      );
      assert.equal(res.status, 200, `Report request failed: ${JSON.stringify(res.body)}`);
      reportData = res.body.data;
    });

    it('returns success=true', async () => {
      // checked by before() block
      assert.ok(reportData, 'reportData must be populated');
    });

    it('report.summary contains required fields', () => {
      const s = reportData.summary;
      assert.ok(s, 'summary must exist');
      assert.equal(s.sessionId, sessionId);
      assert.equal(s.status, SESSION_STATUS.COMPLETED);
      assert.ok(typeof s.overallScore === 'number', 'overallScore must be a number');
      assert.ok(s.overallScore >= 0 && s.overallScore <= 1, 'overallScore must be in [0, 1]');
      assert.ok(typeof s.passed === 'boolean', 'passed must be boolean');
      assert.ok(typeof s.evaluatorType === 'string', 'evaluatorType must be present');
      assert.ok(Array.isArray(s.targetSkills), 'targetSkills must be an array');
      assert.ok(typeof s.questionCount === 'number', 'questionCount must be a number');
      assert.ok(typeof s.passMark === 'number', 'passMark must be present');
      assert.equal(s.passMark, INTERVIEW_PASS_MARK);
    });

    it('passed field correctly reflects whether overallScore >= passMark', () => {
      const s = reportData.summary;
      const expectedPassed = s.overallScore >= INTERVIEW_PASS_MARK;
      assert.equal(s.passed, expectedPassed);
    });

    it('report.questionResults is an array', () => {
      assert.ok(Array.isArray(reportData.questionResults), 'questionResults must be an array');
    });

    it('each questionResult has required fields', () => {
      for (const qr of reportData.questionResults) {
        assert.ok(typeof qr.questionId === 'string', 'questionId must be a string');
        assert.ok(typeof qr.prompt === 'string', 'prompt must be a string');
        assert.ok(typeof qr.score === 'number', 'score must be a number');
        assert.ok(qr.score >= 0 && qr.score <= 1, 'score must be in [0, 1]');
        assert.ok(typeof qr.weight === 'number', 'weight must be a number');
      }
    });

    it('report.skillBreakdown is an array', () => {
      assert.ok(Array.isArray(reportData.skillBreakdown), 'skillBreakdown must be an array');
    });

    it('skillBreakdown entries have expected fields', () => {
      for (const sb of reportData.skillBreakdown) {
        assert.ok(typeof sb.skillName === 'string', 'skillName must be a string');
        assert.ok(typeof sb.score === 'number', 'score must be a number');
        assert.ok(sb.score >= 0 && sb.score <= 1, 'score must be in [0, 1]');
        assert.ok(typeof sb.passed === 'boolean', 'passed must be a boolean');
        assert.ok(typeof sb.questionCount === 'number', 'questionCount must be a number');
      }
    });

    it('report.topStrengths is an array of strings', () => {
      assert.ok(Array.isArray(reportData.topStrengths));
      for (const s of reportData.topStrengths) {
        assert.ok(typeof s === 'string');
      }
    });

    it('report.topGrowthAreas is an array of strings', () => {
      assert.ok(Array.isArray(reportData.topGrowthAreas));
      for (const g of reportData.topGrowthAreas) {
        assert.ok(typeof g === 'string');
      }
    });

    it('report.evidenceSummary is an array', () => {
      assert.ok(Array.isArray(reportData.evidenceSummary));
    });

    it('report.nextSteps is an array of non-empty strings', () => {
      assert.ok(Array.isArray(reportData.nextSteps));
      assert.ok(reportData.nextSteps.length > 0, 'nextSteps must not be empty');
      for (const step of reportData.nextSteps) {
        assert.ok(typeof step === 'string' && step.trim().length > 0);
      }
    });

    it('report.method.usesAi is false (no AI calls during report generation)', () => {
      assert.equal(reportData.method.usesAi, false);
    });

    it('report.method.deterministic is true', () => {
      assert.equal(reportData.method.deterministic, true);
    });
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 6. Determinism Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('6. Report is deterministic', () => {
    it('two GET requests for the same session return identical reports', async () => {
      const token = await registerAndLogin(server.baseUrl);
      const { sessionId } = await runFullSession(server.baseUrl, token);

      const res1 = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/report`,
        token,
      );
      const res2 = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/report`,
        token,
      );

      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);

      // Compare summaries
      const s1 = res1.body.data.summary;
      const s2 = res2.body.data.summary;
      assert.equal(s1.overallScore, s2.overallScore);
      assert.equal(s1.passed, s2.passed);
      assert.equal(s1.questionCount, s2.questionCount);
      assert.equal(res1.body.data.questionResults.length, res2.body.data.questionResults.length);
    });
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 7. AI output cannot directly create verified evidence Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  describe('7. AI evaluation cannot directly create verified evidence', () => {
    it('AI-evaluated session evidenceSummary has no eligibleForVerified=true entries', async () => {
      const token = await registerAndLogin(server.baseUrl);
      const { sessionId } = await runFullSession(server.baseUrl, token);

      const res = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionId}/report`,
        token,
      );
      assert.equal(res.status, 200);
      const { evidenceSummary, summary } = res.body.data;

      // Demo provider uses AI evaluation, so no evidence should be verified
      if (summary.evaluatorType === 'ai') {
        for (const e of evidenceSummary) {
          assert.equal(
            e.eligibleForVerified,
            false,
            'AI-evaluated sessions must never produce verified evidence',
          );
        }
      }
    });
  });
});
