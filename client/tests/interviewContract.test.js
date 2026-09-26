import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_ORDER,
  INTERVIEW_DIFFICULTY_PRESENTATION,
  INTERVIEW_LIMITS,
  SESSION_STATUS,
  SESSION_STATUS_PRESENTATION,
} from '../src/constants/interviewOptions.js';

import {
  completeInterviewSession,
  createInterviewSession,
  fetchInterviewSessionById,
  fetchInterviewSessions,
  startInterviewSession,
  submitInterviewQuestionAnswer,
  toInterviewSession,
} from '../src/services/interview.service.js';

import {
  INTERVIEW_DIFFICULTY as SERVER_DIFFICULTY,
  INTERVIEW_LIMITS as SERVER_LIMITS,
  SESSION_STATUS as SERVER_STATUS,
} from '../../server/src/domain/interview/interviewContract.js';

describe('P19 — Interview Frontend Contract & Parity Suite', () => {
  describe('1. Constant & Policy Parity with Backend Domain', () => {
    it('difficulty levels match exactly', () => {
      assert.deepEqual(INTERVIEW_DIFFICULTY, SERVER_DIFFICULTY, 'INTERVIEW_DIFFICULTY drifted');
      assert.deepEqual(
        INTERVIEW_DIFFICULTY_ORDER,
        [SERVER_DIFFICULTY.BEGINNER, SERVER_DIFFICULTY.INTERMEDIATE, SERVER_DIFFICULTY.ADVANCED],
      );
      for (const diff of Object.values(INTERVIEW_DIFFICULTY)) {
        assert.ok(INTERVIEW_DIFFICULTY_PRESENTATION[diff], `Missing presentation for ${diff}`);
        assert.ok(INTERVIEW_DIFFICULTY_PRESENTATION[diff].label, `Missing label for ${diff}`);
      }
    });

    it('session statuses match server lifecycle states', () => {
      assert.deepEqual(SESSION_STATUS, SERVER_STATUS, 'SESSION_STATUS drifted');
      for (const status of Object.values(SESSION_STATUS)) {
        assert.ok(SESSION_STATUS_PRESENTATION[status], `Missing presentation for ${status}`);
        assert.ok(SESSION_STATUS_PRESENTATION[status].label, `Missing label for ${status}`);
      }
    });

    it('interview character limits match server limits', () => {
      assert.equal(INTERVIEW_LIMITS.studentAnswer.min, SERVER_LIMITS.studentAnswer.min, 'min student answer drifted');
      assert.equal(INTERVIEW_LIMITS.studentAnswer.max, SERVER_LIMITS.studentAnswer.max, 'max student answer drifted');
      assert.equal(INTERVIEW_LIMITS.maxTimePerQuestionSeconds, SERVER_LIMITS.maxTimePerQuestionSeconds, 'max time drifted');
    });
  });

  describe('2. Normalizer & Safety Contracts', () => {
    it('toInterviewSession normalizes valid session payload', () => {
      const raw = {
        _id: 'sess-123',
        status: 'in_progress',
        targetRole: 'backend-developer',
        targetSkills: ['JavaScript', 'Node.js'],
        difficulty: 'intermediate',
        questionCount: 2,
        currentQuestionIndex: 1,
        questions: [
          {
            questionId: 'q-1',
            order: 1,
            type: 'conceptual',
            prompt: 'Explain the event loop.',
            targetSkill: 'Node.js',
            difficulty: 'intermediate',
            rubricCriteria: ['Technical accuracy', 'Depth of explanation'],
            answer: {
              answerText: 'The event loop processes microtasks and macrotasks...',
              submittedAt: '2026-09-26T20:00:00.000Z',
              durationSeconds: 45,
              attemptNumber: 1,
            },
            evaluation: {
              dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.95 },
              compositeScore: 0.89,
              feedback: 'Thorough explanation of queue prioritization.',
              strengths: ['Clear explanation of phases'],
              growthAreas: ['Could elaborate on setImmediate vs process.nextTick'],
              groundedSkills: ['Node.js'],
            },
          },
        ],
      };

      const normalized = toInterviewSession(raw);
      assert.equal(normalized.id, 'sess-123');
      assert.equal(normalized.status, 'in_progress');
      assert.equal(normalized.targetRole, 'backend-developer');
      assert.equal(normalized.questions.length, 1);
      assert.equal(normalized.questions[0].questionId, 'q-1');
      assert.equal(normalized.questions[0].answer.attemptNumber, 1);
      assert.equal(normalized.questions[0].evaluation.compositeScore, 0.89);
    });

    it('toInterviewSession throws for non-object payloads', () => {
      assert.throws(() => toInterviewSession(null), /expected an object/i);
      assert.throws(() => toInterviewSession('invalid'), /expected an object/i);
    });
  });

  describe('3. Service Endpoints & Validation', () => {
    let originalFetch;
    let originalApiUrl;
    let recordedRequests = [];

    beforeEach(() => {
      originalApiUrl = process.env.VITE_API_URL;
      process.env.VITE_API_URL = 'http://localhost:5000';
      recordedRequests = [];
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      process.env.VITE_API_URL = originalApiUrl;
    });


    it('submitInterviewQuestionAnswer validates parameters before calling endpoint', async () => {
      await assert.rejects(
        () => submitInterviewQuestionAnswer('', 'q-1', { answerText: 'Valid text here' }),
        /sessionId is required/i,
      );
      await assert.rejects(
        () => submitInterviewQuestionAnswer('sess-1', '', { answerText: 'Valid text here' }),
        /questionId is required/i,
      );
      await assert.rejects(
        () => submitInterviewQuestionAnswer('sess-1', 'q-1', null),
        /answer text is required/i,
      );
    });

    it('submitInterviewQuestionAnswer sends correct payload and normalizes response', async () => {
      globalThis.fetch = async (url, opts) => {
        recordedRequests.push({ url: String(url), method: opts.method, body: JSON.parse(opts.body) });
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              session: {
                id: 'sess-1',
                status: 'in_progress',
                targetRole: 'backend-developer',
                targetSkills: ['Node.js'],
                questions: [
                  {
                    questionId: 'q-1',
                    order: 1,
                    prompt: 'Explain Node.js event loop.',
                    targetSkill: 'Node.js',
                    answer: {
                      answerText: 'An asynchronous event-driven architecture...',
                      submittedAt: new Date().toISOString(),
                      durationSeconds: 30,
                      attemptNumber: 1,
                    },
                    evaluation: {
                      compositeScore: 0.85,
                      dimensions: { accuracy: 0.85, depth: 0.8, clarity: 0.9, relevance: 0.85 },
                      feedback: 'Solid understanding demonstrated.',
                      strengths: ['Clear terminology'],
                      growthAreas: [],
                    },
                  },
                ],
              },
              evaluatedQuestion: {
                questionId: 'q-1',
                order: 1,
                answer: { answerText: 'An asynchronous event-driven architecture...' },
              },
            },
          }),
        };
      };

      const result = await submitInterviewQuestionAnswer('sess-1', 'q-1', {
        answerText: 'An asynchronous event-driven architecture...',
        durationSeconds: 30,
      });

      assert.equal(recordedRequests.length, 1);
      assert.match(recordedRequests[0].url, /\/api\/interviews\/sessions\/sess-1\/questions\/q-1\/answers$/);
      assert.equal(recordedRequests[0].method, 'POST');
      assert.equal(recordedRequests[0].body.answerText, 'An asynchronous event-driven architecture...');
      assert.equal(recordedRequests[0].body.durationSeconds, 30);

      assert.equal(result.session.id, 'sess-1');
      assert.equal(result.session.questions[0].answer.attemptNumber, 1);
      assert.equal(result.session.questions[0].evaluation.compositeScore, 0.85);
    });

    it('completeInterviewSession posts to complete endpoint and normalizes result', async () => {
      globalThis.fetch = async (url, opts) => {
        recordedRequests.push({ url: String(url), method: opts.method });
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              session: {
                id: 'sess-1',
                status: 'completed',
                targetRole: 'backend-developer',
                overallScore: 0.88,
                questions: [],
              },
              overallScore: 0.88,
              eligibleForVerified: false,
              evidenceResults: [],
              evidenceChecks: [],
            },
          }),
        };
      };


      const result = await completeInterviewSession('sess-1');
      assert.equal(recordedRequests.length, 1);
      assert.match(recordedRequests[0].url, /\/api\/interviews\/sessions\/sess-1\/complete$/);
      assert.equal(result.session.status, 'completed');
      assert.equal(result.overallScore, 0.88);
      assert.equal(result.eligibleForVerified, false);
    });
  });
});
