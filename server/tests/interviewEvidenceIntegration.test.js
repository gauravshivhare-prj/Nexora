import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  CHECK_OUTCOMES,
  CHECK_KINDS,
  INTERVIEW_PASS_MARK,
} from '../src/domain/evidence/skillEvidenceCheck.js';
import {
  EVIDENCE_SOURCES,
  EVIDENCE_STRENGTH,
} from '../src/domain/evidence/evidence.js';
import {
  SESSION_STATUS,
  EVALUATOR_TYPES,
} from '../src/domain/interview/interviewContract.js';
import { computeSkillGap, GAP_STATUS } from '../src/domain/skillGap/computeSkillGap.js';
import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import { completeSession } from '../src/services/interviewSession.service.js';
import { loadVerifiedEvidence } from '../src/services/skillEvidence.service.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import { InterviewSession } from '../src/models/InterviewSession.model.js';
import { User } from '../src/models/User.model.js';
import {
  clearCareerTwins,
  clearInterviewSessions,
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

const PASSWORD = 'Str0ngPassphrase!';
const MOCK_PROVIDER_NAME = 'mock-evidence-integration-provider';

describe('R11 — Interview Evidence Integration & Anti-Bypass Regressions', () => {
  let server;
  let counter = 0;
  let mockEvaluationResponse;

  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: MOCK_PROVIDER_NAME,
      async complete() {
        return {
          text: JSON.stringify(mockEvaluationResponse),
          model: 'test-evidence-mock-model',
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

    useAiProvider(MOCK_PROVIDER_NAME);

    // Default mock response: flawless score of 1.0 on all dimensions
    mockEvaluationResponse = {
      dimensions: {
        accuracy: 1.0,
        depth: 1.0,
        clarity: 1.0,
        relevance: 1.0,
      },
      feedback: 'Outstanding technical answer demonstrating mastery of the subject matter.',
      strengths: ['Exemplary architectural understanding', 'Comprehensive edge case coverage'],
      growthAreas: [],
      groundedSkills: ['Node.js'],
    };
  });

  async function createAccount(label, role = 'student') {
    counter += 1;
    const email = `evidence.${label}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: `User ${label}`,
      email,
      password: PASSWORD,
    });

    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });

    const token = body.data.token;
    const userDoc = await User.findOne({ email });

    if (role !== 'student') {
      userDoc.role = role;
      await userDoc.save();
    }

    return { id: String(userDoc._id), email, token, userDoc };
  }

  async function createAndStartInterviewSession(token, roleTitle = 'Backend Developer', targetSkills = ['Node.js']) {
    const createRes = await sendJsonWithToken(
      server.baseUrl,
      '/api/interviews/sessions',
      {
        method: 'POST',
        token,
        payload: {
          targetRole: roleTitle,
          targetSkills,
          difficulty: 'intermediate',
          questionCount: 1,
        },
      },
    );
    assert.equal(createRes.status, 201);
    const session = createRes.body.data.session;

    const startRes = await sendWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${session.id}/start`,
      { method: 'POST', token },
    );
    assert.equal(startRes.status, 200);

    return session;
  }

  // =========================================================================
  // Vector 1: Raw AI Claims Cannot Create Verified Skills (Verification Policy)
  // =========================================================================
  describe('Vector 1: Raw AI Claims Cannot Create Verified Skills', () => {
    it('forces AI interview evaluation to outcome: uncertain and eligibleForVerified: false despite perfect 1.0 score', async () => {
      const student = await createAccount('ai_perfect_student');

      // Setup profile with claimed Node.js
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token: student.token,
        payload: {
          skills: [{ name: 'Node.js', level: 'beginner' }],
          career: { targetRole: 'Backend Developer' },
        },
      });

      // Initialize, start, and answer 1 question
      const session = await createAndStartInterviewSession(student.token, 'Backend Developer', ['Node.js']);
      const questionId = session.questions[0].questionId;

      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'A comprehensive node event loop and thread pool analysis.' },
        },
      );
      assert.equal(answerRes.status, 200);

      // Complete session via student-facing API
      const completeRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        { method: 'POST', token: student.token },
      );
      assert.equal(completeRes.status, 200);

      const data = completeRes.body.data;
      assert.equal(data.overallScore, 1.0);
      assert.equal(data.session.evaluatorType, 'ai');
      assert.equal(data.eligibleForVerified, false);
      assert.ok(data.evidenceChecks.length > 0);
      assert.equal(data.evidenceChecks[0].outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(data.evidenceChecks[0].eligibleForVerified, false);
      assert.equal(data.evidenceChecks[0].evaluatedBy, 'ai');

      // Database verification
      const dbCheck = await SkillEvidenceCheck.findOne({
        user: student.id,
        reference: session.id,
      });
      assert.ok(dbCheck);
      assert.equal(dbCheck.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(dbCheck.eligibleForVerified, false);
      assert.equal(dbCheck.evaluatedBy, 'ai');

      // Verified evidence query returns empty
      const verifiedEvidence = await loadVerifiedEvidence(student.id);
      assert.deepEqual(verifiedEvidence, []);

      // CareerTwin generation: skill remains 'claimed', not 'verified'
      const twinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token: student.token,
      });
      assert.equal(twinRes.status, 200);
      const twin = twinRes.body.data.careerTwin;
      const nodeSkill = twin.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeSkill);
      assert.equal(nodeSkill.strength, EVIDENCE_STRENGTH.CLAIMED);
      assert.equal(twin.indicators.verified, 0);

      // Skill-gap analysis: Node.js remains 'claimed', NOT 'verified'
      const backendRole = findRole('backend-developer');
      const gap = computeSkillGap(twin, backendRole);
      const nodeGap = gap.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeGap);
      assert.equal(nodeGap.status, GAP_STATUS.CLAIMED);
      assert.ok(nodeGap.suggestedEvidence.length > 0);
      assert.equal(gap.summary.required.verified, 0);
    });

    it('rejects student attempting to bypass policy by passing evaluatorType: human in completion body', async () => {
      const student = await createAccount('sneaky_student');
      const session = await createAndStartInterviewSession(student.token, 'Backend Developer', ['Node.js']);
      const questionId = session.questions[0].questionId;

      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Detailed answer with node streams and buffer optimization.' },
        },
      );

      // Student sends { evaluatorType: 'human' } in body to trick server
      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        {
          method: 'POST',
          token: student.token,
          payload: { evaluatorType: 'human' },
        },
      );
      assert.equal(completeRes.status, 200);

      // Evaluator type is forced to 'ai' because caller is a student
      assert.equal(completeRes.body.data.session.evaluatorType, 'ai');
      assert.equal(completeRes.body.data.eligibleForVerified, false);

      const dbCheck = await SkillEvidenceCheck.findOne({
        user: student.id,
        reference: session.id,
      });
      assert.equal(dbCheck.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(dbCheck.eligibleForVerified, false);
      assert.equal(dbCheck.evaluatedBy, 'ai');
    });

    it('sanitizes forged verification fields sent to direct evidence endpoint POST /api/skill-evidence/interviews', async () => {
      const student = await createAccount('direct_forger', 'admin');

      // Malicious payload claiming pass, verified, and score 1.0 under AI evaluator
      const forgedRes = await sendJsonWithToken(
        server.baseUrl,
        '/api/skill-evidence/interviews',
        {
          method: 'POST',
          token: student.token,
          payload: {
            skill: 'Node.js',
            score: 1.0,
            interviewId: 'forged-ai-interview',
            evaluatedBy: 'ai',
            outcome: 'pass',
            eligibleForVerified: true,
          },
        },
      );
      assert.equal(forgedRes.status, 201);
      assert.equal(forgedRes.body.data.interview.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(forgedRes.body.data.interview.eligibleForVerified, false);

      // Database check
      const check = await SkillEvidenceCheck.findOne({ user: student.id, reference: 'forged-ai-interview' });
      assert.equal(check.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(check.eligibleForVerified, false);

      // Load verified evidence remains empty
      const verified = await loadVerifiedEvidence(student.id);
      assert.deepEqual(verified, []);
    });

    it('rejects unsupported evaluator types on direct evidence submission', async () => {
      const student = await createAccount('unsupported_evaluator_user', 'admin');

      const res = await sendJsonWithToken(
        server.baseUrl,
        '/api/skill-evidence/interviews',
        {
          method: 'POST',
          token: student.token,
          payload: {
            skill: 'Node.js',
            score: 1.0,
            interviewId: 'bad-evaluator-interview',
            evaluatedBy: 'self-declared-proctor',
          },
        },
      );
      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
      assert.match(res.body.message, /evaluatedBy must be "human" or "ai"/);
    });

    it('rejects uncanonical skill claims on direct interview evidence submission', async () => {
      const student = await createAccount('uncanonical_skill_user', 'admin');

      const res = await sendJsonWithToken(
        server.baseUrl,
        '/api/skill-evidence/interviews',
        {
          method: 'POST',
          token: student.token,
          payload: {
            skill: 'magical-vibe-coding',
            score: 0.95,
            interviewId: 'uncanonical-interview',
            evaluatedBy: 'human',
          },
        },
      );
      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.VALIDATION_ERROR);
      assert.match(res.body.message, /Unknown canonical skill/);
    });
  });

  // =========================================================================
  // Vector 2: Valid Human-Evaluated Interview Integration & Staleness
  // =========================================================================
  describe('Vector 2: Valid Human-Evaluated Interview Integration & Staleness', () => {
    it('promotes skill to verified, triggers CareerTwin staleness, and satisfies skill-gap', async () => {
      const student = await createAccount('human_pass_student');

      // 1. Initial student profile with claimed Node.js
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token: student.token,
        payload: {
          skills: [{ name: 'Node.js', level: 'beginner' }],
          career: { targetRole: 'Backend Developer' },
        },
      });

      // 2. Generate initial CareerTwin before interview
      const initialTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token: student.token,
      });
      assert.equal(initialTwinRes.status, 200);
      const initialTwin = initialTwinRes.body.data.careerTwin;
      assert.equal(initialTwin.skills.find((s) => s.key === 'nodejs').strength, EVIDENCE_STRENGTH.CLAIMED);
      assert.equal(initialTwin.indicators.verified, 0);
      assert.equal(initialTwin.isStale, false);

      // 3. Complete an interview session with authorized human evaluator (score >= 0.75)
      const session = await createAndStartInterviewSession(student.token, 'Backend Developer', ['Node.js']);
      const questionId = session.questions[0].questionId;

      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Verified robust answer examined and verified.' },
        },
      );

      // Complete session via authorized human evaluation (score = 1.0 >= 0.75)
      const completedResult = await completeSession(student.id, session.id, {
        evaluatorType: 'human',
        bypassRoleCheck: true,
      });

      assert.equal(completedResult.eligibleForVerified, true);
      assert.equal(completedResult.evidenceChecks[0].outcome, CHECK_OUTCOMES.PASS);
      assert.equal(completedResult.evidenceChecks[0].eligibleForVerified, true);
      assert.equal(completedResult.evidenceChecks[0].evaluatedBy, 'human');

      // 4. Stored CareerTwin detects staleness on read
      // Sleep 15ms so timestamp moves beyond initial generatedAt
      await new Promise((resolve) => setTimeout(resolve, 20));
      const readTwinRes = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(readTwinRes.status, 200);
      assert.equal(readTwinRes.body.data.careerTwin.isStale, true);
      assert.match(
        String(readTwinRes.body.data.careerTwin.staleReasons),
        /New skill evidence has been recorded since this was generated/,
      );

      // 5. Regenerating CareerTwin consumes verified evidence
      const refreshedTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token: student.token,
      });
      assert.equal(refreshedTwinRes.status, 200);
      const refreshedTwin = refreshedTwinRes.body.data.careerTwin;

      assert.equal(refreshedTwin.isStale, false);
      const verifiedNode = refreshedTwin.skills.find((s) => s.key === 'nodejs');
      assert.ok(verifiedNode);
      assert.equal(verifiedNode.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(refreshedTwin.indicators.verified, 1);
      assert.equal(verifiedNode.evidence[0].source, 'interview');
      assert.equal(verifiedNode.evidence[0].strength, 'verified');
      assert.match(verifiedNode.evidence[0].detail, /Passed interview for Node.js/);

      // 6. Skill-gap for Backend Developer verifies Node.js
      const backendRole = findRole('backend-developer');
      const gap = computeSkillGap(refreshedTwin, backendRole);
      const nodeGap = gap.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeGap);
      assert.equal(nodeGap.status, GAP_STATUS.VERIFIED);
      assert.deepEqual(nodeGap.suggestedEvidence, []);
      assert.equal(gap.summary.required.verified, 1);
      assert.match(nodeGap.reason, /Passed interview for Node.js/);
    });

    it('records human interview result via API when caller is an authorized admin', async () => {
      const admin = await createAccount('admin_examiner', 'admin');
      const session = await createAndStartInterviewSession(admin.token, 'Backend Developer', ['Node.js']);
      const questionId = session.questions[0].questionId;

      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: admin.token,
          payload: { answerText: 'Admin evaluated candidate response.' },
        },
      );

      // Admin calls complete endpoint with evaluatorType: 'human'
      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        {
          method: 'POST',
          token: admin.token,
          payload: { evaluatorType: 'human' },
        },
      );

      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.data.session.evaluatorType, 'human');
      assert.equal(completeRes.body.data.eligibleForVerified, true);
      assert.equal(completeRes.body.data.evidenceChecks[0].outcome, CHECK_OUTCOMES.PASS);
      assert.equal(completeRes.body.data.evidenceChecks[0].eligibleForVerified, true);
    });
  });

  // =========================================================================
  // Vector 3: Failing Human Evaluation (< 0.75) Does Not Grant Verified Status
  // =========================================================================
  describe('Vector 3: Failing Human Evaluation Rules', () => {
    it('sets outcome: fail and eligibleForVerified: false when human evaluation score is below 0.75', async () => {
      const student = await createAccount('failing_human_student');

      // Setup mock evaluation with low score (0.50)
      mockEvaluationResponse = {
        dimensions: {
          accuracy: 0.50,
          depth: 0.50,
          clarity: 0.50,
          relevance: 0.50,
        },
        feedback: 'Inaccurate conceptual explanation.',
        strengths: [],
        growthAreas: ['Study fundamental node event loop mechanics'],
        groundedSkills: ['Node.js'],
      };

      const session = await createAndStartInterviewSession(student.token, 'Backend Developer', ['Node.js']);
      const questionId = session.questions[0].questionId;

      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Vague answer with incomplete details.' },
        },
      );

      // Complete with human evaluator
      const completed = await completeSession(student.id, session.id, {
        evaluatorType: 'human',
        bypassRoleCheck: true,
      });

      assert.equal(completed.overallScore, 0.50);
      assert.equal(completed.eligibleForVerified, false);
      assert.equal(completed.evidenceChecks[0].outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(completed.evidenceChecks[0].eligibleForVerified, false);
      assert.equal(completed.evidenceChecks[0].evaluatedBy, 'human');

      // Database verification
      const check = await SkillEvidenceCheck.findOne({
        user: student.id,
        reference: session.id,
      });
      assert.equal(check.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(check.eligibleForVerified, false);

      // loadVerifiedEvidence is empty
      const verified = await loadVerifiedEvidence(student.id);
      assert.deepEqual(verified, []);
    });

    it('rejects direct POST /api/skill-evidence/interviews with failing score and forged eligibleForVerified: true', async () => {
      const student = await createAccount('failing_direct_student', 'admin');

      const res = await sendJsonWithToken(
        server.baseUrl,
        '/api/skill-evidence/interviews',
        {
          method: 'POST',
          token: student.token,
          payload: {
            skill: 'Node.js',
            score: 0.60, // Below 0.75
            interviewId: 'failing-human-interview',
            evaluatedBy: 'human',
            eligibleForVerified: true, // Forged claim
            outcome: 'pass', // Forged claim
          },
        },
      );

      assert.equal(res.status, 201);
      assert.equal(res.body.data.interview.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(res.body.data.interview.eligibleForVerified, false);

      const check = await SkillEvidenceCheck.findOne({ user: student.id, reference: 'failing-human-interview' });
      assert.equal(check.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(check.eligibleForVerified, false);
    });
  });

  // =========================================================================
  // Vector 4: State Lifecycle, Idempotency & Tenant Isolation (IDOR)
  // =========================================================================
  describe('Vector 4: State Lifecycle & Tenant Isolation', () => {
    it('prevents duplicate completion of an already completed session (idempotent)', async () => {
      const student = await createAccount('double_complete_user');
      const session = await createAndStartInterviewSession(student.token, 'Backend Developer', ['Node.js']);
      const questionId = session.questions[0].questionId;

      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Detailed answer for double completion check.' },
        },
      );

      // First complete succeeds
      const firstRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        { method: 'POST', token: student.token },
      );
      assert.equal(firstRes.status, 200);

      // Count evidence checks in db
      const countBefore = await SkillEvidenceCheck.countDocuments({ user: student.id });
      assert.equal(countBefore, 1);

      // Second complete fails with 400 INTERVIEW_INVALID_STATE
      const secondRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        { method: 'POST', token: student.token },
      );
      assert.equal(secondRes.status, 400);
      assert.equal(secondRes.body.errorCode, ERROR_CODES.INTERVIEW_INVALID_STATE);

      // Zero new evidence checks created
      const countAfter = await SkillEvidenceCheck.countDocuments({ user: student.id });
      assert.equal(countAfter, 1);
    });

    it('concurrent completions create evidence exactly once', async () => {
      const student = await createAccount('concurrent_complete_user');
      const session = await createAndStartInterviewSession(student.token, 'Backend Developer', ['Node.js']);
      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${session.questions[0].questionId}/answers`,
        { method: 'POST', token: student.token, payload: { answerText: 'Answer before a racing completion.' } },
      );

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          sendWithToken(server.baseUrl, `/api/interviews/sessions/${session.id}/complete`, {
            method: 'POST',
            token: student.token,
          }),
        ),
      );

      assert.equal(responses.filter((r) => r.status === 200).length, 1);
      for (const r of responses.filter((res) => res.status !== 200)) {
        assert.equal(r.status, 400);
        assert.equal(r.body.errorCode, ERROR_CODES.INTERVIEW_INVALID_STATE);
      }
      assert.equal(await SkillEvidenceCheck.countDocuments({ user: student.id }), 1);
    });

    it('concurrent answers to the same question are recorded exactly once', async () => {
      const student = await createAccount('concurrent_answer_user');
      const session = await createAndStartInterviewSession(student.token, 'Backend Developer', ['Node.js']);
      const questionId = session.questions[0].questionId;

      const responses = await Promise.all(
        Array.from({ length: 4 }, (_, i) =>
          sendJsonWithToken(
            server.baseUrl,
            `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
            { method: 'POST', token: student.token, payload: { answerText: `Racing answer number ${i}.` } },
          ),
        ),
      );

      assert.equal(responses.filter((r) => r.status === 200).length, 1);
      for (const r of responses.filter((res) => res.status !== 200)) {
        assert.equal(r.status, 409);
        assert.equal(r.body.errorCode, ERROR_CODES.CONFLICT);
      }

      const stored = await InterviewSession.findById(session.id).lean();
      assert.equal(stored.attemptCount, 1);
      assert.equal(stored.questions[0].answer.attemptNumber, 1);
    });

    it('rejects completion of an abandoned session without creating evidence checks', async () => {
      const student = await createAccount('abandon_user');
      const session = await createAndStartInterviewSession(student.token, 'Backend Developer', ['Node.js']);

      // Abandon session
      const abandonRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/abandon`,
        { method: 'POST', token: student.token },
      );
      assert.equal(abandonRes.status, 200);

      // Attempt to complete abandoned session
      const completeRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        { method: 'POST', token: student.token },
      );
      assert.equal(completeRes.status, 400);
      assert.equal(completeRes.body.errorCode, ERROR_CODES.INTERVIEW_INVALID_STATE);

      const checks = await SkillEvidenceCheck.find({ user: student.id });
      assert.equal(checks.length, 0);
    });

    it('denies User B from completing User A session and denies reading User A evidence checks', async () => {
      const userA = await createAccount('user_a');
      const userB = await createAccount('user_b');

      const sessionA = await createAndStartInterviewSession(userA.token, 'Backend Developer', ['Node.js']);
      const questionId = sessionA.questions[0].questionId;

      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionA.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: userA.token,
          payload: { answerText: 'User A answers questions.' },
        },
      );

      // User B attempts to complete User A session
      const attackRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionA.id}/complete`,
        { method: 'POST', token: userB.token },
      );
      assert.equal(attackRes.status, 404);
      assert.equal(attackRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);

      // User A completes their own session
      const completeRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${sessionA.id}/complete`,
        { method: 'POST', token: userA.token },
      );
      assert.equal(completeRes.status, 200);

      // User B lists evidence checks: cannot see User A checks
      const userBChecksRes = await getWithToken(server.baseUrl, '/api/skill-evidence', userB.token);
      assert.equal(userBChecksRes.status, 200);
      assert.deepEqual(userBChecksRes.body.data.checks, []);

      // User A sees their own check
      const userAChecksRes = await getWithToken(server.baseUrl, '/api/skill-evidence', userA.token);
      assert.equal(userAChecksRes.status, 200);
      assert.equal(userAChecksRes.body.data.checks.length, 1);
      assert.equal(userAChecksRes.body.data.checks[0].reference, sessionA.id);
    });
  });
});
