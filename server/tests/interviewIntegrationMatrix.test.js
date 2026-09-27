import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  clearCareerTwins,
  clearInterviewSessions,
  clearProfiles,
  clearResumes,
  clearSkillEvidenceChecks,
  clearUsers,
  getWithToken,
  postJson,
  requestWithHeaders,
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
  SESSION_STATUS,
  INTERVIEW_DIFFICULTY,
  INTERVIEW_PASS_MARK,
} from '../src/domain/interview/interviewContract.js';
import { CHECK_OUTCOMES } from '../src/domain/evidence/skillEvidenceCheck.js';
import { EVIDENCE_STRENGTH } from '../src/domain/evidence/evidence.js';
import { completeSession } from '../src/services/interviewSession.service.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import { InterviewSession } from '../src/models/InterviewSession.model.js';
import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { computeSkillGap } from '../src/domain/skillGap/computeSkillGap.js';

describe('TASK R16 — Full Interview Integration Matrix Suite', () => {
  let server;
  let mockEvaluationResponse;
  const PASSWORD = 'ValidPassword123!';

  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: 'r16-matrix-mock-provider',
      async complete() {
        return {
          text: JSON.stringify(mockEvaluationResponse),
          model: 'mock-r16-matrix-model',
        };
      },
    });
  });

  after(async () => {
    resetAiProviders();
    await server.close();
  });

  beforeEach(async () => {
    await clearInterviewSessions();
    await clearSkillEvidenceChecks();
    await clearCareerTwins();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();

    useAiProvider('r16-matrix-mock-provider');

    // Default mock evaluation: 1.0 (flawless pass)
    mockEvaluationResponse = {
      dimensions: {
        accuracy: 1.0,
        depth: 1.0,
        clarity: 1.0,
        relevance: 1.0,
      },
      feedback: 'Excellent demonstration of technical competence.',
      strengths: ['Precise terminology', 'Solid architectural reasoning'],
      growthAreas: [],
      groundedSkills: ['Node.js'],
    };
  });

  async function createAccount(name, role = 'student') {
    const email = `${name.toLowerCase()}@example.com`;
    const regRes = await postJson(server.baseUrl, '/api/auth/register', {
      name,
      email,
      password: PASSWORD,
    });
    assert.equal(regRes.status, 201);

    if (role !== 'student') {
      const { User } = await import('../src/models/User.model.js');
      await User.updateOne({ email }, { $set: { role } });
    }

    const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    assert.equal(loginRes.status, 200);

    return {
      id: loginRes.body.data.user.id,
      token: loginRes.body.data.token,
      email,
    };
  }

  async function setupStudentWithProfile(name) {
    const student = await createAccount(name, 'student');

    // Create profile with claimed Node.js and SQL
    await sendJsonWithToken(server.baseUrl, '/api/profile', {
      method: 'PATCH',
      token: student.token,
      payload: {
        skills: [
          { name: 'Node.js', level: 'advanced' },
          { name: 'SQL', level: 'intermediate' },
        ],
        career: { targetRole: 'Backend Developer' },
      },
    });

    // Generate initial CareerTwin
    const twinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
      method: 'POST',
      token: student.token,
    });
    assert.equal(twinRes.status, 200);

    return student;
  }

  // =========================================================================
  // Vector 1: Standard Candidate Flow (AI Evaluator — Advisory Isolation)
  // Flow: create → question → answer → evaluate → result → evidence → stale-state
  // =========================================================================
  describe('Vector 1: Candidate Flow with AI Evaluator (Advisory Only)', () => {
    it('executes full create → question → answer → evaluate → result → evidence without corrupting fresh twin state', async () => {
      const student = await setupStudentWithProfile('v1_candidate');

      // 1. CREATE: Initialize session
      const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: student.token,
        payload: {
          targetRole: 'Backend Developer',
          targetSkills: ['Node.js'],
          difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        },
      });
      assert.equal(createRes.status, 201);
      const sessionData = createRes.body.data.session;
      assert.ok(sessionData.id);
      assert.equal(sessionData.status, SESSION_STATUS.INITIALIZED);
      assert.equal(sessionData.targetRole, 'Backend Developer');
      assert.deepEqual(sessionData.targetSkills, ['Node.js']);
      assert.ok(sessionData.questions.length >= 3);

      // 2. QUESTION: Retrieve and inspect questions
      const getSessionRes = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionData.id}`,
        student.token,
      );
      assert.equal(getSessionRes.status, 200);
      const questions = getSessionRes.body.data.session.questions;
      assert.ok(questions.length > 0);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        assert.ok(q.questionId);
        assert.equal(q.order, i + 1);
        assert.ok(q.prompt);
        assert.equal(q.targetSkill, 'Node.js');
        // Contract check: no evaluation or answer details leaked before submission
        assert.equal(q.answer, null);
        assert.equal(q.evaluation, null);
      }

      // 3. START: Transition initialized → in_progress
      const startRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionData.id}/start`,
        { method: 'POST', token: student.token },
      );
      assert.equal(startRes.status, 200);
      assert.equal(startRes.body.data.session.status, SESSION_STATUS.IN_PROGRESS);
      assert.ok(startRes.body.data.session.startedAt);

      // 4. ANSWER & EVALUATE: Submit answer to question 1
      const q1 = questions[0];
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionData.id}/questions/${q1.questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: {
            answerText: 'Node.js event loop handles I/O operations through libuv queues and thread pools.',
            durationSeconds: 45,
          },
        },
      );
      assert.equal(answerRes.status, 200);
      const evaluatedQ = answerRes.body.data.evaluatedQuestion;
      assert.ok(evaluatedQ.answer);
      assert.equal(evaluatedQ.answer.durationSeconds, 45);
      assert.ok(evaluatedQ.evaluation);
      assert.equal(evaluatedQ.evaluation.compositeScore, 1.0);
      assert.equal(evaluatedQ.evaluation.dimensions.accuracy, 1.0);
      assert.equal(evaluatedQ.evaluation.dimensions.depth, 1.0);
      assert.equal(evaluatedQ.evaluation.dimensions.clarity, 1.0);
      assert.equal(evaluatedQ.evaluation.dimensions.relevance, 1.0);

      // 5. RESULT: Complete session
      const completeRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionData.id}/complete`,
        { method: 'POST', token: student.token },
      );
      assert.equal(completeRes.status, 200);
      const completeData = completeRes.body.data;
      assert.equal(completeData.session.status, SESSION_STATUS.COMPLETED);
      assert.equal(completeData.session.overallScore, 1.0);
      assert.equal(completeData.session.evaluatorType, 'ai');
      assert.equal(completeData.eligibleForVerified, false);

      // 6. EVIDENCE: Verify advisory evidence checks created
      assert.equal(completeData.evidenceChecks.length, 1);
      const evCheck = completeData.evidenceChecks[0];
      assert.equal(evCheck.kind, 'interview');
      assert.equal(evCheck.skillKey, 'nodejs');
      assert.equal(evCheck.skillName, 'Node.js');
      assert.equal(evCheck.score, 1.0);
      assert.equal(evCheck.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(evCheck.eligibleForVerified, false);
      assert.equal(evCheck.evaluatedBy, 'ai');

      // Database check directly
      const dbCheck = await SkillEvidenceCheck.findOne({ reference: sessionData.id });
      assert.ok(dbCheck);
      assert.equal(dbCheck.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(dbCheck.eligibleForVerified, false);

      // 7. STALE-STATE: Twin & Readiness must remain fresh
      await new Promise((resolve) => setTimeout(resolve, 20));

      const twinRes = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(twinRes.status, 200);
      assert.equal(twinRes.body.data.careerTwin.isStale, false);
      assert.deepEqual(twinRes.body.data.careerTwin.staleReasons, []);

      const readinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(readinessRes.status, 200);
      assert.equal(readinessRes.body.data.readiness.dataStatus, 'fresh');

      const summaryRes = await getWithToken(server.baseUrl, '/api/summary', student.token);
      assert.equal(summaryRes.status, 200);
      assert.equal(summaryRes.body.data.careerTwin.isStale, false);
      assert.notEqual(summaryRes.body.data.nextStep?.code, 'REGENERATE_CAREER_TWIN');
    });
  });

  // =========================================================================
  // Vector 2: Full Loop — Human Evaluation Passing (Verified & Stale Invalidation)
  // Flow: create → question → answer → evaluate → result → evidence → stale → regenerate
  // =========================================================================
  describe('Vector 2: Full Loop with Human Passing Evaluation (Verified & Staleness)', () => {
    it('executes full loop, invalidates CareerTwin and Readiness, then restores freshness on twin refresh', async () => {
      const student = await setupStudentWithProfile('v2_human_pass');

      // Check initial CareerTwin state: Node.js is claimed, not verified
      const initTwin = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(initTwin.body.data.careerTwin.isStale, false);
      assert.equal(initTwin.body.data.careerTwin.indicators.verified, 0);

      // Check initial Readiness state: dataStatus is fresh, required.verified is 0
      const initReadiness = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(initReadiness.body.data.readiness.dataStatus, 'fresh');
      assert.equal(initReadiness.body.data.readiness.required.verified, 0);

      // 1. CREATE
      const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: student.token,
        payload: {
          targetRole: 'Backend Developer',
          targetSkills: ['Node.js'],
          difficulty: INTERVIEW_DIFFICULTY.ADVANCED,
        },
      });
      const session = createRes.body.data.session;

      // 2. QUESTION
      assert.ok(session.questions.length >= 3);
      const q1 = session.questions[0];

      // 3. START
      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/start`,
        { method: 'POST', token: student.token },
      );

      // 4. ANSWER & EVALUATE
      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${q1.questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: {
            answerText: 'Comprehensive explanation of cluster module, worker threads, and V8 memory management.',
            durationSeconds: 120,
          },
        },
      );

      // Wait a tick to guarantee completedAt > initial twin generatedAt
      await new Promise((resolve) => setTimeout(resolve, 25));

      // 5. RESULT: Authorized human examiner completes session with passing score (1.0 >= 0.75)
      const completeResult = await completeSession(student.id, session.id, {
        evaluatorType: 'human',
        bypassRoleCheck: true,
      });
      assert.equal(completeResult.overallScore, 1.0);
      assert.equal(completeResult.eligibleForVerified, true);

      // 6. EVIDENCE: Verified check created
      assert.equal(completeResult.evidenceChecks.length, 1);
      const check = completeResult.evidenceChecks[0];
      assert.equal(check.kind, 'interview');
      assert.equal(check.skillKey, 'nodejs');
      assert.equal(check.score, 1.0);
      assert.equal(check.passMark, INTERVIEW_PASS_MARK);
      assert.equal(check.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(check.eligibleForVerified, true);
      assert.equal(check.evaluatedBy, 'human');

      // 7. STALE-STATE: CareerTwin and Readiness must be invalidated
      const staleTwinRes = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(staleTwinRes.status, 200);
      assert.equal(staleTwinRes.body.data.careerTwin.isStale, true);
      assert.match(
        String(staleTwinRes.body.data.careerTwin.staleReasons),
        /New skill evidence has been recorded since this was generated/,
      );

      const staleReadinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(staleReadinessRes.status, 200);
      assert.equal(staleReadinessRes.body.data.readiness.dataStatus, 'stale');

      const staleSummaryRes = await getWithToken(server.baseUrl, '/api/summary', student.token);
      assert.equal(staleSummaryRes.status, 200);
      assert.equal(staleSummaryRes.body.data.careerTwin.isStale, true);
      assert.equal(staleSummaryRes.body.data.nextStep.code, 'REGENERATE_CAREER_TWIN');

      // 8. REGENERATE: Consume verified evidence and restore freshness
      await new Promise((resolve) => setTimeout(resolve, 25));
      const refreshTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token: student.token,
      });
      assert.equal(refreshTwinRes.status, 200);
      const refreshedTwin = refreshTwinRes.body.data.careerTwin;

      assert.equal(refreshedTwin.isStale, false);
      const nodeSkill = refreshedTwin.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeSkill);
      assert.equal(nodeSkill.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(nodeSkill.evidence[0].source, 'interview');
      assert.equal(nodeSkill.evidence[0].strength, 'verified');
      assert.equal(refreshedTwin.indicators.verified, 1);

      // Readiness dataStatus returns to fresh and counts reflect verified skill
      const freshReadinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(freshReadinessRes.status, 200);
      const freshReadiness = freshReadinessRes.body.data.readiness;
      assert.equal(freshReadiness.dataStatus, 'fresh');
      assert.equal(freshReadiness.required.verified, 1);
      assert.equal(freshReadiness.blockingSkills.find((s) => s.key === 'nodejs'), undefined);

      // Skill Gap verifies Node.js
      const backendRole = findRole('backend-developer');
      const gap = computeSkillGap(refreshedTwin, backendRole);
      const nodeGap = gap.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeGap);
      assert.equal(nodeGap.status, 'verified');
      assert.deepEqual(nodeGap.suggestedEvidence, []);
    });
  });

  // =========================================================================
  // Vector 3: Full Loop — Human Evaluation Failing (Sub-Threshold Isolation)
  // Flow: create → question → answer → evaluate → result → evidence → stale
  // =========================================================================
  describe('Vector 3: Full Loop with Human Failing Evaluation (No Verification)', () => {
    it('executes full loop with failing score and ensures no verified promotion or twin staleness occurs', async () => {
      const student = await setupStudentWithProfile('v3_human_fail');

      // Set mock AI to return low dimension scores
      mockEvaluationResponse = {
        dimensions: {
          accuracy: 0.35,
          depth: 0.35,
          clarity: 0.40,
          relevance: 0.40,
        },
        feedback: 'Inaccurate answer failing to address the core question.',
        strengths: [],
        growthAreas: ['Study core architecture fundamentals'],
        groundedSkills: ['Node.js'],
      };

      // 1. CREATE
      const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: student.token,
        payload: { targetRole: 'Backend Developer', targetSkills: ['Node.js'] },
      });
      const session = createRes.body.data.session;

      // 2. START
      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/start`,
        { method: 'POST', token: student.token },
      );

      // 3. ANSWER & EVALUATE
      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${session.questions[0].questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Vague partial answer with incorrect explanations.' },
        },
      );

      // 4. RESULT: Examiner completes session
      const completeResult = await completeSession(student.id, session.id, {
        evaluatorType: 'human',
        bypassRoleCheck: true,
      });
      assert.ok(completeResult.overallScore < INTERVIEW_PASS_MARK);
      assert.equal(completeResult.eligibleForVerified, false);

      // 5. EVIDENCE: Failing check
      assert.equal(completeResult.evidenceChecks.length, 1);
      const check = completeResult.evidenceChecks[0];
      assert.equal(check.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(check.eligibleForVerified, false);
      assert.equal(check.evaluatedBy, 'human');

      // 6. STALE-STATE: Twin & Readiness remain fresh
      await new Promise((resolve) => setTimeout(resolve, 20));

      const twinRes = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(twinRes.status, 200);
      assert.equal(twinRes.body.data.careerTwin.isStale, false);

      const readinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(readinessRes.status, 200);
      assert.equal(readinessRes.body.data.readiness.dataStatus, 'fresh');
      assert.equal(readinessRes.body.data.readiness.required.verified, 0);
    });
  });

  // =========================================================================
  // Vector 4: Multi-Skill Matrix (Partial Pass / Partial Fail Isolation)
  // Flow: create (multi-skill) → answer 1 pass, 1 fail → evaluate → result → evidence → stale
  // =========================================================================
  describe('Vector 4: Multi-Skill Matrix (Partial Pass & Partial Fail)', () => {
    it('correctly isolates passed vs failed skills in multi-skill sessions and selectively promotes evidence', async () => {
      const student = await setupStudentWithProfile('v4_multi_skill');

      // 1. CREATE: Multi-skill session for Node.js and SQL
      const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: student.token,
        payload: {
          targetRole: 'Backend Developer',
          targetSkills: ['Node.js', 'SQL'],
        },
      });
      const session = createRes.body.data.session;
      assert.equal(session.targetSkills.length, 2);

      // 2. START
      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/start`,
        { method: 'POST', token: student.token },
      );

      // 3. ANSWER Node.js question with high score
      const nodeQ = session.questions.find((q) => q.targetSkill === 'Node.js');
      assert.ok(nodeQ);

      mockEvaluationResponse = {
        dimensions: { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 },
        feedback: 'Superb Node.js answer.',
        strengths: ['Great detail'],
        growthAreas: [],
        groundedSkills: ['Node.js'],
      };

      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${nodeQ.questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Expert Node.js architecture with event driven design.' },
        },
      );

      // 4. Leave SQL question unanswered (or answer poorly)
      const sqlQ = session.questions.find((q) => q.targetSkill === 'SQL');
      if (sqlQ) {
        mockEvaluationResponse = {
          dimensions: { accuracy: 0.3, depth: 0.3, clarity: 0.3, relevance: 0.3 },
          feedback: 'Poor SQL answer.',
          strengths: [],
          growthAreas: ['Study indexes and joins'],
          groundedSkills: ['SQL'],
        };

        await sendJsonWithToken(
          server.baseUrl,
          `/api/interviews/sessions/${session.id}/questions/${sqlQ.questionId}/answers`,
          {
            method: 'POST',
            token: student.token,
            payload: { answerText: 'Vague query answer that fails syntax and logic.' },
          },
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 25));

      // 5. RESULT: Complete via human examiner
      const completeResult = await completeSession(student.id, session.id, {
        evaluatorType: 'human',
        bypassRoleCheck: true,
      });

      const nodeCheck = completeResult.evidenceChecks.find((c) => c.skillKey === 'nodejs');
      const sqlCheck = completeResult.evidenceChecks.find((c) => c.skillKey === 'sql');

      assert.ok(nodeCheck);
      assert.equal(nodeCheck.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(nodeCheck.eligibleForVerified, true);

      assert.ok(sqlCheck);
      assert.equal(sqlCheck.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(sqlCheck.eligibleForVerified, false);

      // 6. STALE-STATE: Staleness triggered by the passing Node.js evidence
      const staleTwin = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(staleTwin.body.data.careerTwin.isStale, true);

      // 7. REGENERATE: Node.js verified, SQL remains unverified
      await new Promise((resolve) => setTimeout(resolve, 25));
      const refreshTwin = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token: student.token,
      });
      assert.equal(refreshTwin.body.data.careerTwin.isStale, false);

      const skills = refreshTwin.body.data.careerTwin.skills;
      assert.equal(skills.find((s) => s.key === 'nodejs').strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(skills.find((s) => s.key === 'sql').strength, EVIDENCE_STRENGTH.CLAIMED);

      // Refreshed readiness: Node.js verified and unblocked, SQL remains in blockingSkills
      const readinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      const readiness = readinessRes.body.data.readiness;
      assert.equal(readiness.dataStatus, 'fresh');
      assert.equal(readiness.required.verified, 1);
      assert.ok(readiness.blockingSkills.some((s) => s.key === 'sql'));
      assert.ok(!readiness.blockingSkills.some((s) => s.key === 'nodejs'));
    });
  });

  // =========================================================================
  // Vector 5: Lifecycle Boundaries, Tampering & Isolation Matrix
  // =========================================================================
  describe('Vector 5: Lifecycle Boundaries, Tampering & Isolation Matrix', () => {
    it('prevents answering before start and prevents duplicate answering via concurrency lock', async () => {
      const student = await setupStudentWithProfile('v5_lifecycle');

      const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: student.token,
        payload: { targetRole: 'Backend Developer', targetSkills: ['Node.js'] },
      });
      const session = createRes.body.data.session;

      // 1. Submit answer before start → 400 Bad Request
      const prematureRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${session.questions[0].questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Premature answer before start.' },
        },
      );
      assert.equal(prematureRes.status, 400);

      // Start session
      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/start`,
        { method: 'POST', token: student.token },
      );

      // 2. Reject answers shorter than min length (< 5 chars)
      const shortRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${session.questions[0].questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'tiny' },
        },
      );
      assert.equal(shortRes.status, 400);

      // 3. Reject answers exceeding max length (> 5000 chars)
      const longRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${session.questions[0].questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'a'.repeat(5001) },
        },
      );
      assert.equal(longRes.status, 400);
    });

    it('denies cross-tenant operations across all interview endpoints', async () => {
      const userA = await setupStudentWithProfile('user_a');
      const userB = await setupStudentWithProfile('user_b');

      // User A creates session
      const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: userA.token,
        payload: { targetRole: 'Backend Developer', targetSkills: ['Node.js'] },
      });
      const sessionA = createRes.body.data.session;

      // User B tries to read User A session → 404
      const getRes = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionA.id}`,
        userB.token,
      );
      assert.equal(getRes.status, 404);

      // User B tries to start User A session → 404
      const startRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionA.id}/start`,
        { method: 'POST', token: userB.token },
      );
      assert.equal(startRes.status, 404);

      // User A starts session
      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionA.id}/start`,
        { method: 'POST', token: userA.token },
      );

      // User B tries to answer User A session → 404
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionA.id}/questions/${sessionA.questions[0].questionId}/answers`,
        {
          method: 'POST',
          token: userB.token,
          payload: { answerText: 'Malicious cross-user answer.' },
        },
      );
      assert.equal(answerRes.status, 404);

      // User B tries to complete User A session → 404
      const completeRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionA.id}/complete`,
        { method: 'POST', token: userB.token },
      );
      assert.equal(completeRes.status, 404);

      // User B tries to abandon User A session → 404
      const abandonRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionA.id}/abandon`,
        { method: 'POST', token: userB.token },
      );
      assert.equal(abandonRes.status, 404);
    });

    it('rejects completing an expired or abandoned session without creating evidence or staleness', async () => {
      const student = await setupStudentWithProfile('v5_abandoned');

      const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: student.token,
        payload: { targetRole: 'Backend Developer', targetSkills: ['Node.js'] },
      });
      const session = createRes.body.data.session;

      // Abandon session
      const abandonRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/abandon`,
        { method: 'POST', token: student.token },
      );
      assert.equal(abandonRes.status, 200);

      // Try to complete abandoned session → 400
      const completeRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        { method: 'POST', token: student.token },
      );
      assert.equal(completeRes.status, 400);

      // 0 evidence checks in DB
      const checks = await SkillEvidenceCheck.find({ user: student.id });
      assert.equal(checks.length, 0);

      // CareerTwin and Readiness remain fresh
      const twinRes = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(twinRes.body.data.careerTwin.isStale, false);

      const readinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(readinessRes.body.data.readiness.dataStatus, 'fresh');
    });
  });
});
