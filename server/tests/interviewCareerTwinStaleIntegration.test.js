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
import { isCareerTwinStale } from '../src/models/CareerTwin.model.js';
import { completeSession } from '../src/services/interviewSession.service.js';
import { CHECK_OUTCOMES } from '../src/domain/evidence/skillEvidenceCheck.js';
import { EVIDENCE_STRENGTH } from '../src/domain/evidence/evidence.js';
import { GAP_STATUS } from '../src/domain/skillGap/computeSkillGap.js';

describe('TASK R14 — CareerTwin & Readiness Stale Integration Suite', () => {
  let server;
  let mockEvaluationResponse;
  const PASSWORD = 'ValidPassword123!';

  before(async () => {
    server = await startTestServer();

    // Register deterministic test mock AI evaluator provider
    registerAiProvider({
      name: 'r14-staleness-mock-provider',
      async complete() {
        return {
          text: JSON.stringify(mockEvaluationResponse),
          model: 'mock-r14-evaluator',
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

    useAiProvider('r14-staleness-mock-provider');

    // Default mock evaluation: 1.0 (flawless pass)
    mockEvaluationResponse = {
      dimensions: {
        accuracy: 1.0,
        depth: 1.0,
        clarity: 1.0,
        relevance: 1.0,
      },
      feedback: 'Outstanding technical performance across all criteria.',
      strengths: ['Deep technical understanding'],
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

  async function createAndStartInterviewSession(token, role = 'Backend Developer', skills = ['Node.js']) {
    const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
      method: 'POST',
      token,
      payload: { targetRole: role, targetSkills: skills },
    });
    assert.equal(createRes.status, 201);
    const session = createRes.body.data.session;

    const startRes = await sendJsonWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${session.id}/start`,
      { method: 'POST', token },
    );
    assert.equal(startRes.status, 200);

    return startRes.body.data.session;
  }

  // =========================================================================
  // 1. isCareerTwinStale Unit Invariant Rules
  // =========================================================================
  describe('1. isCareerTwinStale Evidence Invariants', () => {
    it('detects staleness when latestEvidenceAt is strictly newer than generatedAt', () => {
      const generatedAt = new Date('2026-09-27T10:00:00.000Z');
      const twin = {
        generatedAt,
        sources: {
          profileUpdatedAt: generatedAt,
          analysedResumeIds: [],
          verifiedEvidenceCount: 0,
        },
      };

      const result = isCareerTwinStale(twin, {
        profileUpdatedAt: generatedAt,
        analysedResumeIds: [],
        latestAnalysisAt: null,
        latestEvidenceAt: new Date('2026-09-27T10:05:00.000Z'),
        verifiedEvidenceCount: 1,
      });

      assert.equal(result.isStale, true);
      assert.deepEqual(result.reasons, [
        'New skill evidence has been recorded since this was generated.',
      ]);
    });

    it('detects staleness when verifiedEvidenceCount changes even if timestamps are identical', () => {
      const generatedAt = new Date('2026-09-27T10:00:00.000Z');
      const twin = {
        generatedAt,
        sources: {
          profileUpdatedAt: generatedAt,
          analysedResumeIds: [],
          verifiedEvidenceCount: 0,
        },
      };

      const result = isCareerTwinStale(twin, {
        profileUpdatedAt: generatedAt,
        analysedResumeIds: [],
        latestAnalysisAt: null,
        latestEvidenceAt: generatedAt,
        verifiedEvidenceCount: 1,
      });

      assert.equal(result.isStale, true);
      assert.deepEqual(result.reasons, [
        'New skill evidence has been recorded since this was generated.',
      ]);
    });

    it('gracefully handles missing twin.sources.verifiedEvidenceCount and flags new evidence', () => {
      const generatedAt = new Date('2026-09-27T10:00:00.000Z');
      const twin = {
        generatedAt,
        sources: {
          profileUpdatedAt: generatedAt,
          analysedResumeIds: [],
          // verifiedEvidenceCount missing
        },
      };

      const result = isCareerTwinStale(twin, {
        profileUpdatedAt: generatedAt,
        analysedResumeIds: [],
        latestAnalysisAt: null,
        latestEvidenceAt: null,
        verifiedEvidenceCount: 1,
      });

      assert.equal(result.isStale, true);
      assert.deepEqual(result.reasons, [
        'New skill evidence has been recorded since this was generated.',
      ]);
    });

    it('reports isStale: false when evidence completed before twin was generated', () => {
      const generatedAt = new Date('2026-09-27T10:00:00.000Z');
      const twin = {
        generatedAt,
        sources: {
          profileUpdatedAt: generatedAt,
          analysedResumeIds: [],
          verifiedEvidenceCount: 1,
        },
      };

      const result = isCareerTwinStale(twin, {
        profileUpdatedAt: generatedAt,
        analysedResumeIds: [],
        latestAnalysisAt: null,
        latestEvidenceAt: new Date('2026-09-27T09:55:00.000Z'),
        verifiedEvidenceCount: 1,
      });

      assert.equal(result.isStale, false);
      assert.deepEqual(result.reasons, []);
    });
  });

  // =========================================================================
  // 2. AI-Only Interview Evidence (Advisory Only — Must NOT Invalidate Twin)
  // =========================================================================
  describe('2. AI-Evaluated Interview Evidence Isolation', () => {
    it('does not invalidate CareerTwin or Readiness after high-scoring AI evaluation', async () => {
      const student = await setupStudentWithProfile('ai_staleness_student');

      // Check initial CareerTwin: fresh
      const initialTwinRes = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(initialTwinRes.status, 200);
      assert.equal(initialTwinRes.body.data.careerTwin.isStale, false);

      // Check initial Readiness: fresh
      const initialReadinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(initialReadinessRes.status, 200);
      assert.equal(initialReadinessRes.body.data.readiness.dataStatus, 'fresh');

      // Check initial Summary: twin is not stale
      const initialSummaryRes = await getWithToken(server.baseUrl, '/api/summary', student.token);
      assert.equal(initialSummaryRes.status, 200);
      assert.equal(initialSummaryRes.body.data.careerTwin.isStale, false);

      // Complete AI-evaluated interview session with high score
      const session = await createAndStartInterviewSession(student.token, 'Backend Developer', ['Node.js']);
      const questionId = session.questions[0].questionId;

      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Deep explanation of asynchronous Node.js event loop.' },
        },
      );

      const completeRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        { method: 'POST', token: student.token },
      );
      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.data.eligibleForVerified, false);
      assert.equal(completeRes.body.data.evidenceChecks[0].outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(completeRes.body.data.evidenceChecks[0].evaluatedBy, 'ai');

      // Small pause to guarantee clock ticks
      await new Promise((resolve) => setTimeout(resolve, 20));

      // 1. CareerTwin must remain NOT stale
      const postAiTwinRes = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(postAiTwinRes.status, 200);
      assert.equal(postAiTwinRes.body.data.careerTwin.isStale, false);
      assert.deepEqual(postAiTwinRes.body.data.careerTwin.staleReasons, []);

      // 2. Readiness dataStatus must remain 'fresh'
      const postAiReadinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(postAiReadinessRes.status, 200);
      assert.equal(postAiReadinessRes.body.data.readiness.dataStatus, 'fresh');

      // 3. Summary nextStep must NOT ask to regenerate CareerTwin
      const postAiSummaryRes = await getWithToken(server.baseUrl, '/api/summary', student.token);
      assert.equal(postAiSummaryRes.status, 200);
      assert.equal(postAiSummaryRes.body.data.careerTwin.isStale, false);
      assert.notEqual(postAiSummaryRes.body.data.nextStep?.code, 'REGENERATE_CAREER_TWIN');
    });
  });

  // =========================================================================
  // 3. Failing Human Interview Evidence (Must NOT Invalidate Twin)
  // =========================================================================
  describe('3. Failing Human Interview Evidence Isolation', () => {
    it('does not invalidate CareerTwin or Readiness after failing human evaluation', async () => {
      const student = await setupStudentWithProfile('fail_staleness_student');

      mockEvaluationResponse = {
        dimensions: {
          accuracy: 0.3,
          depth: 0.3,
          clarity: 0.4,
          relevance: 0.4,
        },
        feedback: 'Incomplete and inaccurate answer failing passing thresholds.',
        strengths: [],
        growthAreas: ['Needs fundamental preparation'],
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
          payload: { answerText: 'Partial vague response failing passing criteria.' },
        },
      );

      // Complete session via authorized examiner with low score (0.35 < 0.75)
      const completeRes = await completeSession(student.id, session.id, {
        evaluatorType: 'human',
        bypassRoleCheck: true,
      });
      assert.equal(completeRes.eligibleForVerified, false);
      assert.equal(completeRes.evidenceChecks[0].outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(completeRes.evidenceChecks[0].eligibleForVerified, false);

      await new Promise((resolve) => setTimeout(resolve, 20));

      // CareerTwin and Readiness must remain fresh
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
    });
  });

  // =========================================================================
  // 4. Passing Human Interview Evidence (Correctly Invalidates Derived State)
  // =========================================================================
  describe('4. Verified Human Interview Evidence Invalidation', () => {
    it('correctly invalidates CareerTwin, Readiness, and Summary derived state', async () => {
      const student = await setupStudentWithProfile('pass_staleness_student');

      // Before interview: initial state
      const initialTwinRes = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(initialTwinRes.body.data.careerTwin.isStale, false);

      const initialReadinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(initialReadinessRes.body.data.readiness.dataStatus, 'fresh');
      assert.equal(initialReadinessRes.body.data.readiness.required.verified, 0);

      // Start and complete human interview with score >= 0.75
      const session = await createAndStartInterviewSession(student.token, 'Backend Developer', ['Node.js']);
      const questionId = session.questions[0].questionId;

      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Verified thorough explanation of event loop and libuv thread pool.' },
        },
      );

      // Wait a tick so evidence completion timestamp is strictly greater than initial twin generation
      await new Promise((resolve) => setTimeout(resolve, 25));

      const completeRes = await completeSession(student.id, session.id, {
        evaluatorType: 'human',
        bypassRoleCheck: true,
      });
      assert.equal(completeRes.eligibleForVerified, true);
      assert.equal(completeRes.evidenceChecks[0].outcome, CHECK_OUTCOMES.PASS);
      assert.equal(completeRes.evidenceChecks[0].eligibleForVerified, true);

      // 1. Verify CareerTwin derived state is invalidated
      const staleTwinRes = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(staleTwinRes.status, 200);
      assert.equal(staleTwinRes.body.data.careerTwin.isStale, true);
      assert.match(
        String(staleTwinRes.body.data.careerTwin.staleReasons),
        /New skill evidence has been recorded since this was generated/,
      );

      // 2. Verify Career Readiness derived state is invalidated
      const staleReadinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(staleReadinessRes.status, 200);
      assert.equal(staleReadinessRes.body.data.readiness.dataStatus, 'stale');
      assert.ok(staleReadinessRes.body.data.readiness.basedOn.careerTwinGeneratedAt);

      // 3. Verify Summary nextStep reflects stale CareerTwin
      const staleSummaryRes = await getWithToken(server.baseUrl, '/api/summary', student.token);
      assert.equal(staleSummaryRes.status, 200);
      assert.equal(staleSummaryRes.body.data.careerTwin.isStale, true);
      assert.equal(staleSummaryRes.body.data.nextStep.code, 'REGENERATE_CAREER_TWIN');
      assert.match(
        staleSummaryRes.body.data.nextStep.message,
        /Your data has changed since your CareerTwin was built\. Regenerate it\./,
      );

      // =======================================================================
      // 5. Regeneration consumes verified evidence and restores freshness
      // =======================================================================
      await new Promise((resolve) => setTimeout(resolve, 25));
      const refreshTwinRes = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token: student.token,
      });
      assert.equal(refreshTwinRes.status, 200);
      const refreshedTwin = refreshTwinRes.body.data.careerTwin;

      // Freshness restored
      assert.equal(refreshedTwin.isStale, false);
      assert.deepEqual(refreshedTwin.staleReasons, []);

      // Skill promoted to verified
      const nodeSkill = refreshedTwin.skills.find((s) => s.key === 'nodejs');
      assert.ok(nodeSkill);
      assert.equal(nodeSkill.strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(nodeSkill.evidence[0].source, 'interview');
      assert.equal(nodeSkill.evidence[0].strength, 'verified');
      assert.equal(refreshedTwin.indicators.verified, 1);

      // Readiness dataStatus returns to fresh
      const freshReadinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(freshReadinessRes.status, 200);
      const refreshedReadiness = freshReadinessRes.body.data.readiness;
      assert.equal(refreshedReadiness.dataStatus, 'fresh');
      assert.equal(refreshedReadiness.required.verified, 1);

      // Node.js is no longer blocking
      const nodeBlocker = refreshedReadiness.blockingSkills.find((s) => s.key === 'nodejs');
      assert.equal(nodeBlocker, undefined);

      // Summary nextStep moves on from REGENERATE_CAREER_TWIN
      const freshSummaryRes = await getWithToken(server.baseUrl, '/api/summary', student.token);
      assert.equal(freshSummaryRes.status, 200);
      assert.equal(freshSummaryRes.body.data.careerTwin.isStale, false);
      assert.notEqual(freshSummaryRes.body.data.nextStep.code, 'REGENERATE_CAREER_TWIN');
    });
  });

  // =========================================================================
  // 5. Multi-Skill Selective Invalidation
  // =========================================================================
  describe('5. Multi-Skill Session Selective Invalidation', () => {
    it('invalidates derived state when at least one skill passes and updates correctly upon refresh', async () => {
      const student = await setupStudentWithProfile('multi_staleness_student');

      // Interview session targeting Node.js and SQL
      const session = await createAndStartInterviewSession(
        student.token,
        'Backend Developer',
        ['Node.js', 'SQL'],
      );

      // Only answer the Node.js question; omit SQL question
      const nodeQuestion = session.questions.find((q) => q.targetSkill === 'Node.js');
      assert.ok(nodeQuestion);

      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${nodeQuestion.questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Verified in-depth Node.js event architecture.' },
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 25));

      // Complete via human evaluator
      const completeRes = await completeSession(student.id, session.id, {
        evaluatorType: 'human',
        bypassRoleCheck: true,
      });

      const nodeCheck = completeRes.evidenceChecks.find((c) => c.skillKey === 'nodejs');
      const sqlCheck = completeRes.evidenceChecks.find((c) => c.skillKey === 'sql');

      assert.ok(nodeCheck);
      assert.equal(nodeCheck.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(nodeCheck.eligibleForVerified, true);

      assert.ok(sqlCheck);
      assert.equal(sqlCheck.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(sqlCheck.eligibleForVerified, false);

      // CareerTwin and Readiness must be stale due to the verified Node.js check
      const readTwin = await getWithToken(server.baseUrl, '/api/career-twin', student.token);
      assert.equal(readTwin.body.data.careerTwin.isStale, true);

      const readReadiness = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      assert.equal(readReadiness.body.data.readiness.dataStatus, 'stale');

      // Regenerate twin
      await new Promise((resolve) => setTimeout(resolve, 25));
      const refreshTwin = await sendWithToken(server.baseUrl, '/api/career-twin', {
        method: 'POST',
        token: student.token,
      });
      assert.equal(refreshTwin.body.data.careerTwin.isStale, false);

      // Node.js is verified, SQL remains claimed
      const skills = refreshTwin.body.data.careerTwin.skills;
      assert.equal(skills.find((s) => s.key === 'nodejs').strength, EVIDENCE_STRENGTH.VERIFIED);
      assert.equal(skills.find((s) => s.key === 'sql').strength, EVIDENCE_STRENGTH.CLAIMED);

      // In refreshed readiness: Node.js verified, SQL remains in blockingSkills
      const refreshedReadinessRes = await getWithToken(
        server.baseUrl,
        '/api/careers/roles/backend-developer/readiness',
        student.token,
      );
      const readiness = refreshedReadinessRes.body.data.readiness;
      assert.equal(readiness.dataStatus, 'fresh');
      assert.equal(readiness.required.verified, 1);
      assert.ok(readiness.blockingSkills.some((s) => s.key === 'sql'));
      assert.ok(!readiness.blockingSkills.some((s) => s.key === 'nodejs'));
    });
  });

  // =========================================================================
  // 6. Abandoned Sessions Must Not Invalidate Derived State
  // =========================================================================
  describe('6. Abandoned Session State Isolation', () => {
    it('abandoned interview session generates no evidence and does not invalidate derived state', async () => {
      const student = await setupStudentWithProfile('abandon_staleness_student');

      const session = await createAndStartInterviewSession(student.token, 'Backend Developer', ['Node.js']);

      // Abandon session
      const abandonRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/abandon`,
        { method: 'POST', token: student.token },
      );
      assert.equal(abandonRes.status, 200);

      await new Promise((resolve) => setTimeout(resolve, 20));

      // CareerTwin and Readiness must remain fresh
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
