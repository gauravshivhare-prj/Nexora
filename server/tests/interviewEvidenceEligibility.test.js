import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  CHECK_KINDS,
  CHECK_OUTCOMES,
  INTERVIEW_PASS_MARK,
  SkillEvidenceInputError,
  buildInterviewResult,
} from '../src/domain/evidence/skillEvidenceCheck.js';
import {
  EVIDENCE_STRENGTH,
} from '../src/domain/evidence/evidence.js';
import {
  INTERVIEW_DIFFICULTY,
} from '../src/domain/interview/interviewContract.js';
import { SkillEvidenceCheck } from '../src/models/SkillEvidenceCheck.model.js';
import { loadVerifiedEvidence } from '../src/services/skillEvidence.service.js';
import { evaluateSessionResults } from '../src/services/interviewEvaluation.service.js';
import { completeSession } from '../src/services/interviewSession.service.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import {
  clearCareerTwins,
  clearInterviewSessions,
  clearProfiles,
  clearResumes,
  clearSkillEvidenceChecks,
  clearUsers,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';

const PASSWORD = 'Str0ngPassword123!';
let counter = 0;

describe('TASK R13 — Evidence Eligibility & Institutional Anti-Bypass Suite', () => {
  let server;
  let mockEvaluationResponse;

  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: 'evidence-eligibility-mock-provider',
      async complete() {
        return {
          text: JSON.stringify(mockEvaluationResponse),
          model: 'mock-eligibility-model-r13',
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

    useAiProvider('evidence-eligibility-mock-provider');

    // Default mock response: 1.0 on all dimensions
    mockEvaluationResponse = {
      dimensions: {
        accuracy: 1.0,
        depth: 1.0,
        clarity: 1.0,
        relevance: 1.0,
      },
      feedback: 'Flawless answer demonstrating complete domain mastery.',
      strengths: ['Clear explanation', 'Sound architecture'],
      growthAreas: [],
      groundedSkills: ['Node.js'],
    };
  });

  async function createAccount(label, role = 'student') {
    counter += 1;
    const email = `eligibility_${label}_${Date.now()}_${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: `User ${label}`,
      email,
      password: PASSWORD,
    });

    const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });

    const token = loginRes.body.data.token;
    const userId = loginRes.body.data.user.id;

    if (role !== 'student') {
      const User = mongoose.model('User');
      await User.findByIdAndUpdate(userId, { role });
    }

    return { id: userId, token, email };
  }

  // =========================================================================
  // 1. Model-Level Policy Invariants (SkillEvidenceCheck Schema)
  // =========================================================================
  describe('1. Model-Level Policy Invariants (SkillEvidenceCheck Schema)', () => {
    it('rejects saving AI-evaluated interview check with eligibleForVerified: true', async () => {
      const user = await createAccount('model_ai_verified');

      const check = new SkillEvidenceCheck({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 1.0,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.UNCERTAIN,
        eligibleForVerified: true, // FORBIDDEN for AI
        evaluatedBy: 'ai',
        reference: 'session-123',
        completedAt: new Date(),
      });

      await assert.rejects(
        () => check.save(),
        /AI-evaluated interview evidence cannot be eligible for verified status|eligible for verified/i,
      );
    });

    it('rejects saving AI-evaluated interview check with outcome: pass', async () => {
      const user = await createAccount('model_ai_pass');

      const check = new SkillEvidenceCheck({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 1.0,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS, // FORBIDDEN for AI (must be uncertain)
        eligibleForVerified: false,
        evaluatedBy: 'ai',
        reference: 'session-123',
        completedAt: new Date(),
      });

      await assert.rejects(
        () => check.save(),
        /AI-evaluated interview evidence cannot have outcome "pass"|Invalid outcome/i,
      );
    });

    it('rejects saving human-evaluated interview check with score < passMark and eligibleForVerified: true', async () => {
      const user = await createAccount('model_human_fail_verified');

      const check = new SkillEvidenceCheck({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.60, // Below 0.75
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.FAIL,
        eligibleForVerified: true, // FORBIDDEN for failing score
        evaluatedBy: 'human',
        reference: 'session-456',
        completedAt: new Date(),
      });

      await assert.rejects(
        () => check.save(),
        /Failing human interview evaluation cannot be eligible for verified status|eligible for verified/i,
      );
    });

    it('rejects saving human-evaluated interview check with passMark lower than 0.75', async () => {
      const user = await createAccount('model_low_passmark');

      const check = new SkillEvidenceCheck({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.60,
        passMark: 0.50, // Below institutional 0.75 threshold
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session-low-passmark',
        completedAt: new Date(),
      });

      await assert.rejects(
        () => check.save(),
        /Failing human interview evaluation cannot be eligible for verified status|Invalid outcome/i,
      );
    });

    it('allows saving valid AI-evaluated interview check with outcome: uncertain and eligibleForVerified: false', async () => {
      const user = await createAccount('model_valid_ai');

      const check = await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.95,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.UNCERTAIN,
        eligibleForVerified: false,
        evaluatedBy: 'ai',
        reference: 'session-valid-ai',
        completedAt: new Date(),
      });

      assert.ok(check._id);
      assert.equal(check.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(check.eligibleForVerified, false);
      assert.equal(check.evaluatedBy, 'ai');
    });

    it('allows saving valid human-evaluated interview check with score >= 0.75', async () => {
      const user = await createAccount('model_valid_human');

      const check = await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.85,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'session-valid-human',
        completedAt: new Date(),
      });

      assert.ok(check._id);
      assert.equal(check.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(check.eligibleForVerified, true);
      assert.equal(check.evaluatedBy, 'human');
    });
  });

  // =========================================================================
  // 2. Domain-Level Evidence Invariants (buildInterviewResult)
  // =========================================================================
  describe('2. Domain-Level Evidence Invariants (buildInterviewResult)', () => {
    it('rejects passMark below institutional INTERVIEW_PASS_MARK threshold (0.75)', () => {
      assert.throws(
        () =>
          buildInterviewResult({
            skill: 'Node.js',
            score: 0.80,
            interviewId: 'custom-passmark',
            evaluatedBy: 'human',
            passMark: 0.70, // Below 0.75 threshold
          }),
        (err) => {
          assert.ok(err instanceof SkillEvidenceInputError);
          assert.match(err.message, /Interview pass mark cannot be lower than institutional threshold of 0.75/);
          return true;
        },
      );
    });

    it('forces AI interview evaluation to outcome: uncertain and eligibleForVerified: false for score = 1.0', () => {
      const result = buildInterviewResult({
        skill: 'Node.js',
        score: 1.0,
        interviewId: 'ai-perfect',
        evaluatedBy: 'ai',
      });

      assert.equal(result.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(result.eligibleForVerified, false);
      assert.equal(result.evidence, null);
    });

    it('evaluates human score of 0.74 as fail and eligibleForVerified: false', () => {
      const result = buildInterviewResult({
        skill: 'Node.js',
        score: 0.74,
        interviewId: 'human-barely-failing',
        evaluatedBy: 'human',
      });

      assert.equal(result.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(result.eligibleForVerified, false);
      assert.equal(result.evidence, null);
    });

    it('evaluates human score of 0.75 as pass and eligibleForVerified: true', () => {
      const result = buildInterviewResult({
        skill: 'Node.js',
        score: 0.75,
        interviewId: 'human-exact-passing',
        evaluatedBy: 'human',
      });

      assert.equal(result.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(result.eligibleForVerified, true);
      assert.ok(result.evidence);
      assert.equal(result.evidence.strength, 'verified');
    });
  });

  // =========================================================================
  // 3. Downstream Consumer Defense-in-Depth (loadVerifiedEvidence)
  // =========================================================================
  describe('3. Downstream Consumer Defense-in-Depth (loadVerifiedEvidence)', () => {
    it('loadVerifiedEvidence strictly excludes AI interview checks even if database has eligibleForVerified: true', async () => {
      const user = await createAccount('consumer_defense');

      // Use collection.insertOne to bypass Mongoose model validation and simulate legacy/tampered data
      const rawCollection = mongoose.connection.collection('skillevidencechecks');
      await rawCollection.insertOne({
        user: new mongoose.Types.ObjectId(user.id),
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 1.0,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true, // Forged / corrupted record
        evaluatedBy: 'ai', // AI EVALUATED!
        reference: 'forged-ai-session',
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Consumer query MUST defense-in-depth filter this out
      const verified = await loadVerifiedEvidence(user.id);
      assert.deepEqual(
        verified,
        [],
        'loadVerifiedEvidence must NEVER return an AI-evaluated interview check as verified',
      );
    });

    it('loadVerifiedEvidence excludes human checks with score below passMark', async () => {
      const user = await createAccount('consumer_failing_human');

      const rawCollection = mongoose.connection.collection('skillevidencechecks');
      await rawCollection.insertOne({
        user: new mongoose.Types.ObjectId(user.id),
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.50, // Failing
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.FAIL,
        eligibleForVerified: true, // Forged
        evaluatedBy: 'human',
        reference: 'forged-human-failing',
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const verified = await loadVerifiedEvidence(user.id);
      assert.deepEqual(verified, []);
    });

    it('loadVerifiedEvidence returns genuine human passing checks', async () => {
      const user = await createAccount('consumer_valid_human');

      await SkillEvidenceCheck.create({
        user: user.id,
        kind: CHECK_KINDS.INTERVIEW,
        skillKey: 'nodejs',
        skillName: 'Node.js',
        score: 0.85,
        passMark: INTERVIEW_PASS_MARK,
        outcome: CHECK_OUTCOMES.PASS,
        eligibleForVerified: true,
        evaluatedBy: 'human',
        reference: 'legit-human-interview',
        completedAt: new Date(),
      });

      const verified = await loadVerifiedEvidence(user.id);
      assert.equal(verified.length, 1);
      assert.equal(verified[0].skill, 'Node.js');
      assert.equal(verified[0].evidence.strength, 'verified');
    });
  });

  // =========================================================================
  // 4. Multi-Skill Session Completion Invariants
  // =========================================================================
  describe('4. Multi-Skill Session Completion Invariants', () => {
    it('sets skillScore to 0 for target skills with no evaluated questions and prevents false verification', () => {
      const sessionWithUnassessedSkill = {
        _id: '507f1f77bcf86cd799439011',
        targetSkills: ['Node.js', 'MongoDB'],
        questions: [
          {
            questionId: 'iq-node-001',
            targetSkill: 'Node.js',
            evaluation: { compositeScore: 0.95 },
          },
          // MongoDB has NO evaluated questions in this session
        ],
      };

      const result = evaluateSessionResults({
        session: sessionWithUnassessedSkill,
        evaluatorType: 'human',
      });

      assert.equal(result.evidenceResults.length, 2);

      const nodeEvidence = result.evidenceResults.find((e) => e.skillKey === 'nodejs');
      const mongoEvidence = result.evidenceResults.find((e) => e.skillKey === 'mongodb');

      assert.ok(nodeEvidence);
      assert.equal(nodeEvidence.score, 0.95);
      assert.equal(nodeEvidence.outcome, CHECK_OUTCOMES.PASS);
      assert.equal(nodeEvidence.eligibleForVerified, true);

      // MongoDB was never evaluated: its score must be 0, outcome fail, not verified
      assert.ok(mongoEvidence);
      assert.equal(mongoEvidence.score, 0);
      assert.equal(mongoEvidence.outcome, CHECK_OUTCOMES.FAIL);
      assert.equal(mongoEvidence.eligibleForVerified, false);
    });
  });

  // =========================================================================
  // 5. End-to-End API Anti-Bypass
  // =========================================================================
  describe('5. End-to-End API Anti-Bypass', () => {
    it('guarantees student cannot bypass AI advisory policy via request body tampering', async () => {
      const student = await createAccount('e2e_student');

      // Initialize profile
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token: student.token,
        payload: {
          skills: [{ name: 'Node.js', level: 'beginner' }],
          career: { targetRole: 'Backend Developer' },
        },
      });

      // Create session
      const createRes = await sendJsonWithToken(
        server.baseUrl,
        '/api/interviews/sessions',
        {
          method: 'POST',
          token: student.token,
          payload: {
            targetRole: 'Backend Developer',
            targetSkills: ['Node.js'],
            difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
            questionCount: 1,
          },
        },
      );
      assert.equal(createRes.status, 201);
      const session = createRes.body.data.session;

      // Start session
      await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/start`,
        { method: 'POST', token: student.token },
      );

      // Submit answer (gets 1.0 from mock AI provider)
      await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${session.questions[0].questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: { answerText: 'Deep explanation of libuv threadpool and event loop queues.' },
        },
      );

      // Student tries to send { evaluatorType: 'human' } to gain verified status
      const completeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/complete`,
        {
          method: 'POST',
          token: student.token,
          payload: {
            evaluatorType: 'human',
            bypassRoleCheck: true,
            eligibleForVerified: true,
          },
        },
      );

      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.body.data.session.evaluatorType, 'ai');
      assert.equal(completeRes.body.data.eligibleForVerified, false);
      assert.equal(completeRes.body.data.evidenceChecks[0].outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(completeRes.body.data.evidenceChecks[0].eligibleForVerified, false);
      assert.equal(completeRes.body.data.evidenceChecks[0].evaluatedBy, 'ai');

      // Database verification
      const check = await SkillEvidenceCheck.findOne({ user: student.id, reference: session.id });
      assert.ok(check);
      assert.equal(check.outcome, CHECK_OUTCOMES.UNCERTAIN);
      assert.equal(check.eligibleForVerified, false);
      assert.equal(check.evaluatedBy, 'ai');

      // CareerTwin build reflects advisory status, not verified
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
    });
  });
});
