import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  clearInterviewSessions,
  clearSkillEvidenceChecks,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import {
  ALLOWED_SESSION_TRANSITIONS,
  EVALUATOR_TYPES,
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_DIFFICULTY,
  INTERVIEW_ERROR_CODES,
  INTERVIEW_PASS_MARK,
  SESSION_STATUS,
  canTransitionSession,
} from '../src/domain/interview/interviewContract.js';
import {
  toInterviewEvaluation,
  toInterviewEvidenceCheck,
  toInterviewEvidenceResult,
  toInterviewQuestion,
  toInterviewSession,
  resolveInterviewError,
  resolveInterviewEvidenceStatus,
  INTERVIEW_EVIDENCE_STATUS,
} from '../../client/src/services/interview.service.js';
import { InterviewSession } from '../src/models/InterviewSession.model.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';

describe('TASK R19 — Frontend Contract Handoff Verification Suite', () => {
  let server;
  let mockEvaluationResponse;
  const PASSWORD = 'ValidPassword123!';

  before(async () => {
    // Explicitly enforce the isolated database for Task R19
    process.env.MONGODB_URI_TEST =
      process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/nexora_radhika_r19_test';
    server = await startTestServer();

    registerAiProvider({
      name: 'r19-handoff-mock-provider',
      async complete() {
        return {
          text: JSON.stringify(mockEvaluationResponse),
          model: 'mock-r19-handoff-model',
        };
      },
    });
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    await clearUsers();
    await clearInterviewSessions();
    await clearSkillEvidenceChecks();
    resetRateLimiters();

    useAiProvider('r19-handoff-mock-provider');

    mockEvaluationResponse = {
      score: 0.85,
      dimensions: {
        accuracy: 0.85,
        depth: 0.85,
        clarity: 0.85,
        relevance: 0.85,
      },
      feedback: 'Good solid answer covering key concepts.',
      strengths: ['Clear terminology and flow.'],
      growthAreas: ['Could elaborate on edge cases.'],
      groundedSkills: ['Node.js'],
    };
  });

  async function registerAndLogin(name = 'Handoff Candidate', role = 'student') {
    const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}@example.com`;
    const regRes = await postJson(server.baseUrl, '/api/auth/register', {
      name,
      email,
      password: PASSWORD,
    });
    assert.equal(regRes.status, 201, `Failed to register user: ${regRes.body?.message}`);

    const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    assert.equal(loginRes.status, 200, `Failed to login user: ${loginRes.body?.message}`);

    return { token: loginRes.body.data.token, user: loginRes.body.data.user };
  }

  function postAuthJson(path, token, payload) {
    return sendJsonWithToken(server.baseUrl, path, { method: 'POST', token, payload });
  }

  function postAuth(path, token) {
    return sendWithToken(server.baseUrl, path, { method: 'POST', token });
  }

  function getAuth(path, token) {
    return getWithToken(server.baseUrl, path, token);
  }

  describe('1. Exact DTO Shapes and Secret Stripping Across All Endpoints', () => {
    it('POST /api/interviews/sessions returns sanitized session matching client DTO contract', async () => {
      const { token } = await registerAndLogin();

      const createRes = await postAuthJson('/api/interviews/sessions', token, {
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        difficulty: 'intermediate',
        questionCount: 2,
      });

      assert.equal(createRes.status, 201);
      assert.equal(createRes.body.success, true);
      assert.equal(createRes.body.message, 'Interview session initialized');

      const rawSession = createRes.body.data.session;
      assert.ok(rawSession, 'Expected session object in data');
      assert.ok(rawSession.id, 'Session must have id');
      assert.equal(rawSession.status, SESSION_STATUS.INITIALIZED);
      assert.equal(rawSession.targetRole, 'Backend Developer');
      assert.equal(rawSession.targetSkills[0], 'Node.js');
      assert.equal(rawSession.questionCount, 2);
      assert.equal(rawSession.currentQuestionIndex, 0);
      assert.equal(rawSession.attemptCount, 0);
      assert.equal(rawSession.questions.length, 2);

      // Security & Contract invariant: user (owner ID) and Mongoose version __v must never be exposed
      assert.equal(rawSession.user, undefined, 'Must not expose owner user ID');
      assert.equal(rawSession.__v, undefined, 'Must not expose Mongoose __v');
      assert.equal(rawSession._id, undefined, 'Must not expose raw MongoDB _id');

      // Client normalizer roundtrip check
      const clientSession = toInterviewSession(rawSession);
      assert.equal(clientSession.id, rawSession.id);
      assert.equal(clientSession.sessionId, rawSession.id);
      assert.equal(clientSession.status, SESSION_STATUS.INITIALIZED);
      assert.equal(clientSession.timeLimitMinutes, 30);
      assert.equal(clientSession.user, undefined);
      assert.equal(clientSession.targetSkills[0].name, 'Node.js');
      assert.equal(clientSession.targetSkills[0].key, 'nodejs');

      // Question shape verification
      const q = rawSession.questions[0];
      assert.ok(q.id || q.questionId, 'Question must have identifier');
      assert.equal(q.order, 1);
      assert.ok(q.prompt, 'Question must have prompt');
      assert.equal(q.targetSkill, 'Node.js');
      assert.equal(q.answer, null);
      assert.equal(q.evaluation, null);

      const clientQ = toInterviewQuestion(q);
      assert.equal(clientQ.questionId, q.questionId);
      assert.equal(clientQ.prompt, q.prompt);
    });

    it('GET /api/interviews/sessions and GET .../:id return sanitized DTOs with count', async () => {
      const { token } = await registerAndLogin();

      const createRes = await postAuthJson('/api/interviews/sessions', token, {
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        difficulty: 'intermediate',
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;

      // List endpoint
      const listRes = await getAuth('/api/interviews/sessions', token);
      assert.equal(listRes.status, 200);
      assert.equal(listRes.body.success, true);
      assert.equal(listRes.body.data.count, 1);
      assert.equal(listRes.body.data.sessions.length, 1);
      assert.equal(listRes.body.data.sessions[0].id, sessionId);
      assert.equal(listRes.body.data.sessions[0].user, undefined);

      // Read endpoint
      const readRes = await getAuth(`/api/interviews/sessions/${sessionId}`, token);
      assert.equal(readRes.status, 200);
      assert.equal(readRes.body.success, true);
      assert.equal(readRes.body.data.session.id, sessionId);
      assert.equal(readRes.body.data.session.user, undefined);

      const normalized = toInterviewSession(readRes.body.data.session);
      assert.equal(normalized.id, sessionId);
    });

    it('Complete session returns exact evidenceChecks and evidenceResults DTOs', async () => {
      const { token } = await registerAndLogin();

      const createRes = await postAuthJson('/api/interviews/sessions', token, {
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        difficulty: 'intermediate',
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      await postAuth(`/api/interviews/sessions/${sessionId}/start`, token);

      const answerRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        token,
        {
          answerText: 'Node.js is an event-driven asynchronous JavaScript runtime built on Chrome V8 engine.',
          durationSeconds: 45,
        },
      );
      assert.equal(answerRes.status, 200);
      assert.ok(answerRes.body.data.evaluatedQuestion);
      const evalDto = toInterviewEvaluation(answerRes.body.data.evaluatedQuestion.evaluation);
      assert.equal(evalDto.compositeScore, 0.85);

      const completeRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/complete`,
        token,
        {},
      );

      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.success, true);
      const data = completeRes.body.data;

      assert.equal(data.session.status, SESSION_STATUS.COMPLETED);
      assert.equal(typeof data.overallScore, 'number');
      assert.equal(data.eligibleForVerified, false, 'AI-only evaluation cannot be eligible for verified');

      // Evidence results
      assert.ok(Array.isArray(data.evidenceResults));
      assert.equal(data.evidenceResults.length, 1);
      const rawResult = data.evidenceResults[0];
      const evResult = toInterviewEvidenceResult(rawResult);
      assert.equal(evResult.skillKey, 'nodejs');
      assert.equal(evResult.outcome, 'uncertain');
      assert.equal(evResult.evidenceStrength, 'supported');
      assert.equal(evResult.eligibleForVerified, false);
      assert.equal(evResult.evaluatedBy, 'ai');

      // Evidence checks (persisted SkillEvidenceCheck records)
      assert.ok(Array.isArray(data.evidenceChecks));
      assert.equal(data.evidenceChecks.length, 1);
      const rawCheck = data.evidenceChecks[0];
      const evCheck = toInterviewEvidenceCheck(rawCheck);
      assert.ok(evCheck.id, 'SkillEvidenceCheck must have id');
      assert.equal(evCheck.user, undefined, 'SkillEvidenceCheck must not expose owner ID in public DTO');
      assert.equal(evCheck.kind, 'interview');
      assert.equal(evCheck.skillKey, 'nodejs');
      assert.equal(evCheck.passMark, INTERVIEW_PASS_MARK);
      assert.equal(evCheck.outcome, 'uncertain');
      assert.equal(evCheck.eligibleForVerified, false);
      assert.equal(evCheck.evaluatedBy, 'ai');
      assert.equal(evCheck.reference, sessionId);

      // Verify UI evidence status resolution
      const uiEvidenceStatus = resolveInterviewEvidenceStatus({
        overallScore: data.overallScore,
        evaluatorType: data.session.evaluatorType,
        eligibleForVerified: data.eligibleForVerified,
        status: data.session.status,
      });
      assert.equal(uiEvidenceStatus.statusKey, INTERVIEW_EVIDENCE_STATUS.ADVISORY_SUPPORTED);
      assert.equal(uiEvidenceStatus.isVerified, false);
      assert.equal(uiEvidenceStatus.isSupported, true);
      assert.equal(uiEvidenceStatus.isPassing, true);
    });
  });

  describe('2. Error Semantics Parity and Canonical Codes', () => {
    it('returns INTERVIEW_SESSION_NOT_FOUND (404) for non-existent session', async () => {
      const { token } = await registerAndLogin();
      const fakeId = '6ab6ba1aa278c6e17a603509';

      const res = await getAuth(`/api/interviews/sessions/${fakeId}`, token);
      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.equal(res.body.errorCode, INTERVIEW_ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);

      const resolved = resolveInterviewError({ errorCode: res.body.errorCode, status: res.status });
      assert.equal(resolved.code, INTERVIEW_ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);
      assert.equal(resolved.title, 'Session Not Found');
      assert.equal(resolved.retryable, false);
    });

    it('returns INTERVIEW_INVALID_STATE (400) when performing forbidden transitions', async () => {
      const { token } = await registerAndLogin();

      const createRes = await postAuthJson('/api/interviews/sessions', token, {
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        difficulty: 'intermediate',
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;

      // Abandon from initialized is allowed
      const abandonRes = await postAuth(
        `/api/interviews/sessions/${sessionId}/abandon`,
        token,
      );
      assert.equal(abandonRes.status, 200);

      // Starting an already abandoned session is invalid
      const startRes = await postAuth(
        `/api/interviews/sessions/${sessionId}/start`,
        token,
      );
      assert.equal(startRes.status, 400);
      assert.equal(startRes.body.errorCode, INTERVIEW_ERROR_CODES.INTERVIEW_INVALID_STATE);

      // Completing an abandoned session is invalid
      const completeRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/complete`,
        token,
        {},
      );
      assert.equal(completeRes.status, 400);
      assert.equal(completeRes.body.errorCode, INTERVIEW_ERROR_CODES.INTERVIEW_INVALID_STATE);
    });

    it('returns INTERVIEW_SESSION_EXPIRED (400) when interacting with expired session', async () => {
      const { token } = await registerAndLogin();

      const createRes = await postAuthJson('/api/interviews/sessions', token, {
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        difficulty: 'intermediate',
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      await postAuth(`/api/interviews/sessions/${sessionId}/start`, token);

      // Expire session in database
      await InterviewSession.updateOne(
        { _id: sessionId },
        { $set: { expiresAt: new Date(Date.now() - 60000) } },
      );

      // Attempting to submit answer
      const answerRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        token,
        {
          answerText: 'Expired session answer submission test.',
          durationSeconds: 20,
        },
      );
      assert.equal(answerRes.status, 400);
      assert.equal(answerRes.body.errorCode, INTERVIEW_ERROR_CODES.INTERVIEW_SESSION_EXPIRED);

      // Attempting to complete
      const completeRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/complete`,
        token,
        {},
      );
      assert.equal(completeRes.status, 400);
      assert.equal(completeRes.body.errorCode, INTERVIEW_ERROR_CODES.INTERVIEW_SESSION_EXPIRED);

      const resolved = resolveInterviewError({ errorCode: completeRes.body.errorCode, status: completeRes.status });
      assert.equal(resolved.code, INTERVIEW_ERROR_CODES.INTERVIEW_SESSION_EXPIRED);
      assert.equal(resolved.title, 'Session Expired');
    });

    it('returns BAD_REQUEST (400) for missing or invalid parameters', async () => {
      const { token } = await registerAndLogin();

      // Missing targetRole
      const badCreate = await postAuthJson('/api/interviews/sessions', token, {
        targetSkills: ['Node.js'],
      });
      assert.equal(badCreate.status, 400);
      assert.equal(badCreate.body.success, false);

      // Non-existent role
      const badRole = await postAuthJson('/api/interviews/sessions', token, {
        targetRole: 'non-existent-astronaut',
        targetSkills: ['Node.js'],
      });
      assert.equal(badRole.status, 400);
      assert.equal(badRole.body.errorCode, INTERVIEW_ERROR_CODES.CAREER_ROLE_NOT_FOUND);
    });
  });

  describe('3. Institutional Evidence Policy Enforcement', () => {
    it('AI evaluation can NEVER obtain verified status even with perfect score', async () => {
      const { token } = await registerAndLogin();

      const createRes = await postAuthJson('/api/interviews/sessions', token, {
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        difficulty: 'intermediate',
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      await postAuth(`/api/interviews/sessions/${sessionId}/start`, token);

      // Perfect score from AI
      mockEvaluationResponse.score = 1.0;
      mockEvaluationResponse.dimensions = { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 };

      await postAuthJson(
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        token,
        {
          answerText: 'Exceptional, complete, flawless technical explanation of Node.js event loop.',
          durationSeconds: 60,
        },
      );

      const completeRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/complete`,
        token,
        {},
      );

      assert.equal(completeRes.status, 200);
      const data = completeRes.body.data;
      assert.equal(data.overallScore, 1.0);
      assert.equal(data.eligibleForVerified, false);

      const savedCheck = await SkillEvidenceCheck.findOne({ reference: sessionId });
      assert.ok(savedCheck);
      assert.equal(savedCheck.score, 1.0);
      assert.equal(savedCheck.outcome, 'uncertain');
      assert.equal(savedCheck.eligibleForVerified, false);
      assert.equal(savedCheck.evaluatedBy, 'ai');

      const uiEvidence = resolveInterviewEvidenceStatus({
        overallScore: data.overallScore,
        evaluatorType: data.session.evaluatorType,
        eligibleForVerified: data.eligibleForVerified,
        status: data.session.status,
      });
      assert.equal(uiEvidence.statusKey, INTERVIEW_EVIDENCE_STATUS.ADVISORY_SUPPORTED);
      assert.equal(uiEvidence.isVerified, false);
    });

    it('Failing evaluation (<75%) produces unverified below pass outcome', async () => {
      const { token } = await registerAndLogin();

      const createRes = await postAuthJson('/api/interviews/sessions', token, {
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        difficulty: 'intermediate',
        questionCount: 1,
      });
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].questionId;

      await postAuth(`/api/interviews/sessions/${sessionId}/start`, token);

      mockEvaluationResponse.score = 0.50;
      mockEvaluationResponse.dimensions = { accuracy: 0.5, depth: 0.5, clarity: 0.5, relevance: 0.5 };

      await postAuthJson(
        `/api/interviews/sessions/${sessionId}/questions/${questionId}/answers`,
        token,
        {
          answerText: 'Partial superficial answer with errors.',
          durationSeconds: 15,
        },
      );

      const completeRes = await postAuthJson(
        `/api/interviews/sessions/${sessionId}/complete`,
        token,
        {},
      );

      assert.equal(completeRes.status, 200);
      const data = completeRes.body.data;
      assert.equal(data.overallScore, 0.50);
      assert.equal(data.eligibleForVerified, false);

      const savedCheck = await SkillEvidenceCheck.findOne({ reference: sessionId });
      assert.ok(savedCheck);
      assert.equal(savedCheck.score, 0.50);
      assert.equal(savedCheck.outcome, 'uncertain');
      assert.equal(savedCheck.eligibleForVerified, false);

      const uiEvidence = resolveInterviewEvidenceStatus({
        overallScore: data.overallScore,
        evaluatorType: data.session.evaluatorType,
        eligibleForVerified: data.eligibleForVerified,
        status: data.session.status,
      });
      assert.equal(uiEvidence.statusKey, INTERVIEW_EVIDENCE_STATUS.UNVERIFIED_BELOW_PASS);
      assert.equal(uiEvidence.isPassing, false);
    });
  });
});
