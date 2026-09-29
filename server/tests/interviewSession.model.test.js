import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_DIFFICULTY,
  INTERVIEW_QUESTION_TYPES,
  SESSION_STATUS,
} from '../src/domain/interview/interviewContract.js';
import {
  InterviewSession,
  toPublicInterviewQuestion,
  toPublicInterviewSession,
} from '../src/models/InterviewSession.model.js';
import {
  clearInterviewSessions,
  clearUsers,
  postJson,
  resetRateLimiters,
  startTestServer,
} from './helpers/testServer.js';

const PASSWORD = 'Str0ngPassphrase';
let server;
let testUserId;

describe('R3 — InterviewSession Model & Ownership Suite', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearInterviewSessions();
    await clearUsers();
    resetRateLimiters();

    const email = `session.owner.${Date.now()}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Session Owner',
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    testUserId = new mongoose.Types.ObjectId(body.data.user.id);
  });

  describe('1. Model Creation & Ownership', () => {
    it('creates and saves a valid interview session with proper ownership', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js', 'MongoDB'],
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        questionCount: 3,
      });

      await session.save();

      assert.ok(session._id);
      assert.equal(session.user.toString(), testUserId.toString());
      assert.equal(session.status, SESSION_STATUS.INITIALIZED);
      assert.equal(session.targetRole, 'Backend Engineer');
      assert.deepEqual(session.targetSkills, ['Node.js', 'MongoDB']);
      assert.equal(session.questionCount, 3);
      assert.equal(session.currentQuestionIndex, 0);
      assert.equal(session.attemptCount, 0);
      assert.equal(session.contractVersion, INTERVIEW_CONTRACT_VERSION);
      assert.ok(session.expiresAt instanceof Date);
      assert.equal(session.startedAt, null);
      assert.equal(session.completedAt, null);
    });

    it('rejects session creation when owner user is missing', async () => {
      const session = new InterviewSession({
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
      });

      await assert.rejects(
        async () => session.save(),
        /Owner user id is required/,
      );
    });

    it('declares expected ownership and lifecycle indexes', () => {
      const indexes = InterviewSession.schema.indexes();
      const hasUserCreatedAtIndex = indexes.some(
        ([idx]) => idx.user === 1 && idx.createdAt === -1,
      );
      const hasUserStatusIndex = indexes.some(
        ([idx]) => idx.user === 1 && idx.status === 1,
      );
      const hasStatusExpiresAtIndex = indexes.some(
        ([idx]) => idx.status === 1 && idx.expiresAt === 1,
      );

      assert.equal(hasUserCreatedAtIndex, true);
      assert.equal(hasUserStatusIndex, true);
      assert.equal(hasStatusExpiresAtIndex, true);
    });
  });

  describe('2. Lifecycle Status Transitions & Timestamps', () => {
    it('allows valid state progression initialized -> in_progress -> completed', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Frontend Engineer',
        targetSkills: ['React', 'JavaScript'],
        questionCount: 2,
      });
      await session.save();

      // Transition to in_progress
      session.status = SESSION_STATUS.IN_PROGRESS;
      await session.save();

      assert.equal(session.status, SESSION_STATUS.IN_PROGRESS);
      assert.ok(session.startedAt instanceof Date);
      assert.equal(session.completedAt, null);

      // Transition to completed
      session.status = SESSION_STATUS.COMPLETED;
      await session.save();

      assert.equal(session.status, SESSION_STATUS.COMPLETED);
      assert.ok(session.completedAt instanceof Date);
    });

    it('rejects invalid state transition from initialized directly to completed', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
      });
      await session.save();

      session.status = SESSION_STATUS.COMPLETED;
      await assert.rejects(
        async () => session.save(),
        /Invalid session lifecycle transition from "initialized" to "completed"/,
      );
    });

    it('rejects state transitions once a terminal state is reached', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
      });
      await session.save();

      session.status = SESSION_STATUS.ABANDONED;
      await session.save();
      assert.ok(session.completedAt instanceof Date);

      // Attempt to restart abandoned session
      session.status = SESSION_STATUS.IN_PROGRESS;
      await assert.rejects(
        async () => session.save(),
        /Invalid session lifecycle transition from "abandoned" to "in_progress"/,
      );

      // Verify timed_out auto-sets completedAt and prevents transitions
      const timedOutSession = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
      });
      await timedOutSession.save();
      timedOutSession.status = SESSION_STATUS.TIMED_OUT;
      await timedOutSession.save();
      assert.ok(timedOutSession.completedAt instanceof Date);

      timedOutSession.status = SESSION_STATUS.IN_PROGRESS;
      await assert.rejects(
        async () => timedOutSession.save(),
        /Invalid session lifecycle transition from "timed_out" to "in_progress"/,
      );

      // Verify failed auto-sets completedAt and prevents transitions
      const failedSession = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
      });
      await failedSession.save();
      failedSession.status = SESSION_STATUS.FAILED;
      await failedSession.save();
      assert.ok(failedSession.completedAt instanceof Date);

      failedSession.status = SESSION_STATUS.IN_PROGRESS;
      await assert.rejects(
        async () => failedSession.save(),
        /Invalid session lifecycle transition from "failed" to "in_progress"/,
      );
    });
  });

  describe('3. Target Role, Skills & Difficulty Validation', () => {
    it('rejects missing or empty targetRole', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: '   ',
        targetSkills: ['Node.js'],
      });

      await assert.rejects(
        async () => session.save(),
        /Target role is required/,
      );
    });

    it('rejects targetSkills when skill is non-canonical or unrecognized', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Fullstack',
        targetSkills: ['Node.js', 'InventedFakeSkill999'],
      });

      await assert.rejects(
        async () => session.save(),
        /All target skills must be recognizable canonical skills/,
      );
    });

    it('rejects targetSkills when list exceeds maximum of 5 skills', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Fullstack',
        targetSkills: ['Node.js', 'React', 'MongoDB', 'Python', 'Docker', 'AWS'],
      });

      await assert.rejects(
        async () => session.save(),
        /Target skills must contain between 1 and 5 skills/,
      );
    });

    it('rejects invalid difficulty values', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Fullstack',
        targetSkills: ['Node.js'],
        difficulty: 'extreme_impossible',
      });

      await assert.rejects(
        async () => session.save(),
        /Difficulty must be one of: beginner, intermediate, advanced/,
      );
    });

    it('rejects questionCount outside allowed bounds (1 to 10)', async () => {
      const sessionTooHigh = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend',
        targetSkills: ['Node.js'],
        questionCount: 15,
      });
      await assert.rejects(
        async () => sessionTooHigh.save(),
        /Question count cannot exceed 10/,
      );

      const sessionTooLow = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend',
        targetSkills: ['Node.js'],
        questionCount: 0,
      });
      await assert.rejects(
        async () => sessionTooLow.save(),
        /Question count cannot be less than 1/,
      );
    });
  });

  describe('4. Question References, Answers & Attempt Limits', () => {
    it('accepts well-formed question references with answer and evaluation', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
        questionCount: 1,
        questions: [
          {
            questionId: 'q-101',
            order: 1,
            type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
            prompt: 'Explain event loop execution phases in Node.js runtime.',
            targetSkill: 'Node.js',
            difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
            rubricCriteria: ['timers phase', 'poll phase', 'microtasks queue'],
            answer: {
              answerText: 'The event loop has timer, pending, idle, poll, check, and close phases.',
              submittedAt: new Date(),
              durationSeconds: 45,
              attemptNumber: 1,
            },
            evaluation: {
              dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.8, relevance: 0.95 },
              compositeScore: 0.875,
              feedback: 'Demonstrates clear grasp of event loop phases.',
              strengths: ['Accurate phase naming'],
              growthAreas: ['Mention nextTick priority'],
              groundedSkills: ['Node.js'],
              evaluatedAt: new Date(),
            },
          },
        ],
      });

      await session.save();
      assert.equal(session.questions.length, 1);
      assert.equal(session.questions[0].questionId, 'q-101');
      assert.equal(session.questions[0].evaluation.compositeScore, 0.875);
    });

    it('rejects questions count exceeding session questionCount limit', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
        questionCount: 1,
        questions: [
          {
            questionId: 'q-1',
            order: 1,
            type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
            prompt: 'Explain Node.js event loop phases in detail.',
            targetSkill: 'Node.js',
          },
          {
            questionId: 'q-2',
            order: 2,
            type: INTERVIEW_QUESTION_TYPES.SCENARIO,
            prompt: 'How do you mitigate memory leaks in Node.js streams?',
            targetSkill: 'Node.js',
          },
        ],
      });

      await assert.rejects(
        async () => session.save(),
        /Number of questions cannot exceed questionCount/,
      );
    });

    it('rejects question with non-canonical targetSkill', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
        questions: [
          {
            questionId: 'q-1',
            order: 1,
            type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
            prompt: 'Explain this non canonical skill question.',
            targetSkill: 'ImaginarySkillXYZ',
          },
        ],
      });

      await assert.rejects(
        async () => session.save(),
        /Question target skill must be a recognized canonical skill/,
      );
    });

    it('rejects question prompt that is too short', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
        questions: [
          {
            questionId: 'q-1',
            order: 1,
            type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
            prompt: 'Short',
            targetSkill: 'Node.js',
          },
        ],
      });

      await assert.rejects(
        async () => session.save(),
        /Question prompt is too short/,
      );
    });

    it('enforces total attempt limit across the session', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
        maxAttemptsTotal: 3,
        attemptCount: 4,
      });

      await assert.rejects(
        async () => session.save(),
        /Attempt count \(4\) exceeds maximum allowed attempts \(3\)/,
      );
    });
  });

  describe('5. Security, Secrets Exclusion & Public Serialization', () => {
    it('never persists raw provider secrets or credentials', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
        providerMetadata: {
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          promptTokens: 120,
          completionTokens: 85,
          latencyMs: 340,
          contractVersion: 1,
          apiKey: 'AIzaSySECRETKEY_SHOULD_BE_DROPPED',
          clientSecret: 'TOP_SECRET',
        },
      });

      await session.save();

      const doc = await InterviewSession.findById(session._id).lean();
      assert.equal(doc.providerMetadata.provider, 'gemini');
      assert.equal(doc.providerMetadata.model, 'gemini-1.5-flash');
      assert.equal(doc.providerMetadata.apiKey, undefined);
      assert.equal(doc.providerMetadata.clientSecret, undefined);
    });

    it('toPublicInterviewSession never echoes owner user id or internal mongo fields', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js', 'MongoDB'],
        questionCount: 2,
        providerMetadata: {
          provider: 'gemini',
          model: 'gemini-1.5-flash',
          promptTokens: 100,
          completionTokens: 50,
          latencyMs: 250,
        },
      });
      await session.save();

      const publicDto = toPublicInterviewSession(session);

      assert.equal(publicDto.id, session._id.toString());
      assert.equal(publicDto.user, undefined);
      assert.equal(publicDto._id, undefined);
      assert.equal(publicDto.__v, undefined);
      assert.equal(publicDto.targetRole, 'Backend Engineer');
      assert.deepEqual(publicDto.targetSkills, ['Node.js', 'MongoDB']);
      assert.equal(publicDto.providerMetadata.provider, 'gemini');
      assert.equal(publicDto.providerMetadata.promptTokens, undefined); // Token counts internal
      assert.equal(publicDto.providerMetadata.latencyMs, 250);
    });

    it('toObject transform strips user, _id, and __v from serialized documents', async () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend Engineer',
        targetSkills: ['Node.js'],
      });
      await session.save();

      const obj = session.toObject();
      assert.equal(obj.id, session._id.toString());
      assert.equal(obj.user, undefined);
      assert.equal(obj._id, undefined);
      assert.equal(obj.__v, undefined);
    });

    it('toPublicInterviewQuestion serializes clean question DTOs and prevents subdocument leakage', () => {
      const question = {
        questionId: 'q-clean-1',
        order: 1,
        type: INTERVIEW_QUESTION_TYPES.CONCEPTUAL,
        prompt: 'Explain Node.js event loop in detail.',
        targetSkill: 'Node.js',
        difficulty: INTERVIEW_DIFFICULTY.INTERMEDIATE,
        rubricCriteria: ['timers phase', 'poll phase'],
        answer: {
          answerText: 'Timers, pending, idle, poll, check, close.',
          submittedAt: '2026-09-26T20:00:00.000Z',
          durationSeconds: 40,
          attemptNumber: 1,
          _internalState: 'should_not_leak',
        },
        evaluation: {
          dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.8, relevance: 0.9 },
          compositeScore: 0.87,
          score: 0.87,
          feedback: 'Accurate and concise.',
          strengths: ['Clear terminology'],
          growthAreas: [],
          groundedSkills: ['Node.js'],
          evaluatedAt: '2026-09-26T20:01:00.000Z',
          _evaluatorToken: 'secret_token_never_leak',
        },
      };

      const dto = toPublicInterviewQuestion(question);

      assert.equal(dto.id, 'q-clean-1');
      assert.equal(dto.questionId, 'q-clean-1');
      assert.equal(dto.order, 1);
      assert.equal(dto.type, INTERVIEW_QUESTION_TYPES.CONCEPTUAL);
      assert.equal(dto.targetSkill, 'Node.js');
      assert.deepEqual(dto.rubricCriteria, ['timers phase', 'poll phase']);
      assert.equal(dto.answer.answerText, 'Timers, pending, idle, poll, check, close.');
      assert.ok(dto.answer.submittedAt instanceof Date);
      assert.equal(dto.answer._internalState, undefined);
      assert.equal(dto.evaluation.compositeScore, 0.87);
      assert.equal(dto.evaluation.dimensions.accuracy, 0.9);
      assert.ok(dto.evaluation.evaluatedAt instanceof Date);
      assert.equal(dto.evaluation._evaluatorToken, undefined);
    });
  });

  describe('6. Helper Methods: isExpired & hasReachedAttemptLimit', () => {
    it('isExpired identifies expired sessions correctly', () => {
      const activeSession = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend',
        targetSkills: ['Node.js'],
        expiresAt: new Date(Date.now() + 60000),
      });
      assert.equal(activeSession.isExpired(), false);

      const expiredSession = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend',
        targetSkills: ['Node.js'],
        expiresAt: new Date(Date.now() - 60000),
      });
      assert.equal(expiredSession.isExpired(), true);
    });

    it('hasReachedAttemptLimit identifies exhausted attempts', () => {
      const session = new InterviewSession({
        user: testUserId,
        targetRole: 'Backend',
        targetSkills: ['Node.js'],
        maxAttemptsTotal: 5,
        attemptCount: 5,
      });
      assert.equal(session.hasReachedAttemptLimit(), true);

      session.attemptCount = 4;
      assert.equal(session.hasReachedAttemptLimit(), false);
    });
  });
});
