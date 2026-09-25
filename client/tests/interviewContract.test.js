import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  EVALUATOR_TYPES,
  EVALUATOR_TYPE_LABELS,
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_LEVELS,
  INTERVIEW_DIFFICULTY_ORDER,
  INTERVIEW_DIFFICULTY_PRESENTATION,
  INTERVIEW_LIMITS,
  INTERVIEW_PASS_MARK,
  INTERVIEW_QUESTION_TYPES,
  INTERVIEW_QUESTION_TYPE_LABELS,
  RUBRIC_DIMENSIONS,
  RUBRIC_DIMENSION_LABELS,
  RUBRIC_DIMENSION_WEIGHTS,
  SESSION_STATUS,
  SESSION_STATUS_PRESENTATION,
} from '../src/constants/interviewOptions.js';

import {
  abandonInterviewSession,
  completeInterviewSession,
  createInterviewSession,
  fetchInterviewSessionById,
  fetchInterviewSessions,
  startInterviewSession,
  submitInterviewAnswer,
  toInterviewEvaluation,
  toInterviewQuestion,
  toInterviewSession,
} from '../src/services/interview.service.js';

import {
  EVALUATOR_TYPES as SERVER_EVALUATOR_TYPES,
  INTERVIEW_CONTRACT_VERSION as SERVER_CONTRACT_VERSION,
  INTERVIEW_DIFFICULTY as SERVER_INTERVIEW_DIFFICULTY,
  INTERVIEW_LIMITS as SERVER_INTERVIEW_LIMITS,
  INTERVIEW_PASS_MARK as SERVER_INTERVIEW_PASS_MARK,
  INTERVIEW_QUESTION_TYPES as SERVER_INTERVIEW_QUESTION_TYPES,
  RUBRIC_DIMENSIONS as SERVER_RUBRIC_DIMENSIONS,
  RUBRIC_DIMENSION_WEIGHTS as SERVER_RUBRIC_DIMENSION_WEIGHTS,
  SESSION_STATUS as SERVER_SESSION_STATUS,
} from '../../server/src/domain/interview/interviewContract.js';

describe('R01 — Interview Frontend Contract & Parity Suite', () => {
  describe('1. Constant & Policy Parity with Backend Domain', () => {
    it('contract version and pass mark match server values', () => {
      assert.equal(INTERVIEW_CONTRACT_VERSION, SERVER_CONTRACT_VERSION, 'Contract version mismatch');
      assert.equal(INTERVIEW_PASS_MARK, SERVER_INTERVIEW_PASS_MARK, 'Pass mark threshold mismatch');
      assert.equal(INTERVIEW_PASS_MARK, 0.75, 'Expected 75% pass mark threshold');
    });

    it('session lifecycle statuses match server constants exactly', () => {
      assert.deepEqual(SESSION_STATUS, SERVER_SESSION_STATUS, 'SESSION_STATUS drifted between client and server');
      for (const status of Object.values(SESSION_STATUS)) {
        assert.ok(SESSION_STATUS_PRESENTATION[status], `Missing UI presentation for session status "${status}"`);
        assert.ok(SESSION_STATUS_PRESENTATION[status].label, `Missing label for session status "${status}"`);
        assert.ok(SESSION_STATUS_PRESENTATION[status].badgeClass, `Missing badgeClass for session status "${status}"`);
      }
    });

    it('difficulty levels and order match server definition', () => {
      assert.deepEqual(INTERVIEW_DIFFICULTY, SERVER_INTERVIEW_DIFFICULTY, 'INTERVIEW_DIFFICULTY drifted');
      assert.deepEqual(INTERVIEW_DIFFICULTY_LEVELS, SERVER_INTERVIEW_DIFFICULTY, 'INTERVIEW_DIFFICULTY_LEVELS alias drifted');
      assert.deepEqual(
        INTERVIEW_DIFFICULTY_ORDER,
        [SERVER_INTERVIEW_DIFFICULTY.BEGINNER, SERVER_INTERVIEW_DIFFICULTY.INTERMEDIATE, SERVER_INTERVIEW_DIFFICULTY.ADVANCED],
        'Difficulty order does not match progressive hierarchy',
      );
      for (const level of Object.values(INTERVIEW_DIFFICULTY)) {
        assert.ok(INTERVIEW_DIFFICULTY_PRESENTATION[level], `Missing UI presentation for difficulty "${level}"`);
        assert.ok(INTERVIEW_DIFFICULTY_PRESENTATION[level].label, `Missing label for difficulty "${level}"`);
      }
    });

    it('question types match server archetypes with human-readable labels', () => {
      assert.deepEqual(INTERVIEW_QUESTION_TYPES, SERVER_INTERVIEW_QUESTION_TYPES, 'INTERVIEW_QUESTION_TYPES drifted');
      for (const type of Object.values(INTERVIEW_QUESTION_TYPES)) {
        assert.ok(INTERVIEW_QUESTION_TYPE_LABELS[type], `Missing label for question type "${type}"`);
      }
    });

    it('evaluator types match server authority specification', () => {
      assert.deepEqual(EVALUATOR_TYPES, SERVER_EVALUATOR_TYPES, 'EVALUATOR_TYPES drifted');
      for (const evalType of Object.values(EVALUATOR_TYPES)) {
        assert.ok(EVALUATOR_TYPE_LABELS[evalType], `Missing label for evaluator type "${evalType}"`);
      }
    });

    it('rubric dimensions and weights match server formula', () => {
      assert.deepEqual(RUBRIC_DIMENSIONS, SERVER_RUBRIC_DIMENSIONS, 'RUBRIC_DIMENSIONS drifted');
      assert.deepEqual(RUBRIC_DIMENSION_WEIGHTS, SERVER_RUBRIC_DIMENSION_WEIGHTS, 'RUBRIC_DIMENSION_WEIGHTS drifted');

      let sum = 0;
      for (const [key, weight] of Object.entries(RUBRIC_DIMENSION_WEIGHTS)) {
        assert.ok(RUBRIC_DIMENSION_LABELS[key], `Missing label for rubric dimension "${key}"`);
        sum += weight;
      }
      assert.equal(Math.round(sum * 100) / 100, 1.0, 'Rubric dimension weights must sum to exactly 1.0');
    });

    it('interview limits match server validation boundaries', () => {
      assert.equal(INTERVIEW_LIMITS.minQuestions, SERVER_INTERVIEW_LIMITS.minQuestions);
      assert.equal(INTERVIEW_LIMITS.maxQuestions, SERVER_INTERVIEW_LIMITS.maxQuestions);
      assert.equal(INTERVIEW_LIMITS.maxTargetSkills, SERVER_INTERVIEW_LIMITS.maxTargetSkills);
      assert.equal(INTERVIEW_LIMITS.studentAnswer.min, SERVER_INTERVIEW_LIMITS.studentAnswer.min);
      assert.equal(INTERVIEW_LIMITS.studentAnswer.max, SERVER_INTERVIEW_LIMITS.studentAnswer.max);
      assert.equal(INTERVIEW_LIMITS.maxTimePerQuestionSeconds, SERVER_INTERVIEW_LIMITS.maxTimePerQuestionSeconds);
      assert.equal(INTERVIEW_LIMITS.maxSessionMinutes, SERVER_INTERVIEW_LIMITS.maxSessionMinutes);
    });
  });

  describe('2. Normalizer & Secret Stripping Contracts', () => {
    it('toInterviewSession normalizes valid backend payloads and strips internal/user fields', () => {
      const serverPayload = {
        _id: '6ab6ba1aa278c6e17a603503',
        user: '6ab6ba1aa278c6e17a603500',
        __v: 0,
        status: 'in_progress',
        targetRole: 'backend-developer',
        targetSkills: [{ key: 'nodejs', name: 'Node.js' }],
        difficulty: 'intermediate',
        questionCount: 3,
        currentQuestionIndex: 1,
        attemptCount: 1,
        maxAttemptsTotal: 10,
        attemptLimitPerQuestion: 1,
        questions: [
          {
            questionId: 'iq-node-001',
            order: 1,
            type: 'conceptual',
            prompt: 'Explain the Node.js event loop phases in detail.',
            targetSkill: 'Node.js',
            difficulty: 'intermediate',
            rubricCriteria: ['Mentions microtask queues', 'Describes libuv threadpool'],
            answer: {
              answerText: 'The Node.js event loop consists of timers, pending callbacks, poll, check, and close callbacks.',
              submittedAt: '2026-09-25T18:00:00.000Z',
              durationSeconds: 120,
              attemptNumber: 1,
            },
            evaluation: {
              dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.95, relevance: 0.9 },
              compositeScore: 0.895,
              feedback: 'Thorough explanation of libuv mechanics.',
              strengths: ['Clear phase explanation'],
              growthAreas: ['Could elaborate on process.nextTick priority'],
              groundedSkills: ['Node.js'],
              evaluatedAt: '2026-09-25T18:02:00.000Z',
            },
          },
        ],
        overallScore: null,
        evaluatorType: 'ai',
        evidenceCheck: null,
        providerMetadata: {
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          latencyMs: 1420,
          contractVersion: 1,
        },
        startedAt: '2026-09-25T17:58:00.000Z',
        createdAt: '2026-09-25T17:55:00.000Z',
      };

      const normalized = toInterviewSession(serverPayload);

      assert.equal(normalized.id, '6ab6ba1aa278c6e17a603503');
      assert.equal(normalized.sessionId, '6ab6ba1aa278c6e17a603503');
      assert.equal(normalized.status, 'in_progress');
      assert.equal(normalized.targetRole, 'backend-developer');
      assert.equal(normalized.timeLimitMinutes, 30, 'Default timeLimitMinutes should be 30');
      assert.equal(normalized.user, undefined, 'Owner user ID must be stripped from client session DTO');
      assert.equal(normalized.__v, undefined, 'Mongoose version key must be stripped');
      assert.equal(normalized.questions.length, 1);

      const customPayload = { ...serverPayload, timeLimitMinutes: 45 };
      assert.equal(toInterviewSession(customPayload).timeLimitMinutes, 45);

      const q = normalized.questions[0];
      assert.equal(q.id, 'iq-node-001');
      assert.equal(q.questionId, 'iq-node-001');
      assert.equal(q.order, 1);
      assert.equal(q.answer.durationSeconds, 120);
      assert.equal(q.evaluation.compositeScore, 0.895);
      assert.equal(q.evaluation.dimensions.accuracy, 0.9);
      assert.deepEqual(q.evaluation.groundedSkills, ['Node.js']);
      assert.equal(normalized.providerMetadata.provider, 'gemini');
    });

    it('toInterviewQuestion normalizes question structures with null fallbacks', () => {
      const bareQuestion = {
        questionId: 'iq-react-002',
        prompt: 'Describe the virtual DOM and fiber reconciler.',
        targetSkill: 'React',
      };

      const normalized = toInterviewQuestion(bareQuestion);

      assert.equal(normalized.id, 'iq-react-002');
      assert.equal(normalized.questionId, 'iq-react-002');
      assert.equal(normalized.order, 1);
      assert.equal(normalized.type, 'conceptual');
      assert.equal(normalized.difficulty, 'intermediate');
      assert.deepEqual(normalized.rubricCriteria, []);
      assert.equal(normalized.answer, null);
      assert.equal(normalized.evaluation, null);
    });

    it('toInterviewEvaluation normalizes dimensions and lists safely', () => {
      const rawEval = {
        dimensions: { accuracy: 0.8, depth: 0.7, clarity: 0.9, relevance: 0.85 },
        compositeScore: 0.7975,
        feedback: 'Solid foundational answer.',
        strengths: ['Good communication'],
        growthAreas: ['More depth on concurrency'],
      };

      const normalized = toInterviewEvaluation(rawEval);

      assert.equal(normalized.compositeScore, 0.7975);
      assert.equal(normalized.dimensions.accuracy, 0.8);
      assert.deepEqual(normalized.strengths, ['Good communication']);
      assert.deepEqual(normalized.groundedSkills, []);
    });

    it('normalizers throw on invalid or non-object payloads', () => {
      assert.throws(() => toInterviewSession(null), /Invalid interview session data/);
      assert.throws(() => toInterviewSession([1, 2, 3]), /Invalid interview session data/);
      assert.throws(() => toInterviewQuestion(undefined), /Invalid interview question data/);
      assert.throws(() => toInterviewEvaluation('string'), /Invalid interview evaluation data/);
    });
  });

  describe('3. Service Endpoints & Request/Response Contracts', () => {
    const originalFetch = globalThis.fetch;
    const originalApiUrl = process.env.VITE_API_URL;
    let lastRequest = null;
    let mockResponse = null;

    beforeEach(() => {
      process.env.VITE_API_URL = 'http://localhost:5000';
      lastRequest = null;
      mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, message: 'OK', data: {} }),
      };

      globalThis.fetch = async (url, options = {}) => {
        lastRequest = { url, options };
        return {
          ...mockResponse,
          json: async () => mockResponse.body,
        };
      };
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      process.env.VITE_API_URL = originalApiUrl;
    });

    it('createInterviewSession posts payload and normalizes initialized session', async () => {
      mockResponse.status = 201;
      mockResponse.body = {
        success: true,
        message: 'Interview session initialized',
        data: {
          session: {
            id: 'sess_123',
            status: 'initialized',
            targetRole: 'backend-developer',
            targetSkills: [{ key: 'nodejs', name: 'Node.js' }],
            difficulty: 'intermediate',
            questionCount: 3,
            questions: [],
          },
        },
      };

      const payload = {
        targetRole: 'backend-developer',
        targetSkills: ['Node.js'],
        difficulty: 'intermediate',
        questionCount: 3,
      };

      const result = await createInterviewSession(payload);

      assert.ok(lastRequest.url.endsWith('/api/interviews/sessions'));
      assert.equal(lastRequest.options.method, 'POST');
      const sentBody = JSON.parse(lastRequest.options.body);
      assert.equal(sentBody.targetRole, 'backend-developer');
      assert.equal(result.session.id, 'sess_123');
      assert.equal(result.session.status, 'initialized');
    });

    it('fetchInterviewSessions retrieves and normalizes session list with count', async () => {
      mockResponse.body = {
        success: true,
        message: 'Interview sessions retrieved',
        data: {
          sessions: [
            {
              id: 'sess_1',
              status: 'completed',
              targetRole: 'backend-developer',
              targetSkills: [{ key: 'nodejs', name: 'Node.js' }],
              overallScore: 0.85,
            },
          ],
          count: 1,
        },
      };

      const result = await fetchInterviewSessions();

      assert.ok(lastRequest.url.endsWith('/api/interviews/sessions'));
      assert.equal(result.sessions.length, 1);
      assert.equal(result.count, 1);
      assert.equal(result.sessions[0].id, 'sess_1');
      assert.equal(result.sessions[0].overallScore, 0.85);
    });

    it('fetchInterviewSessionById retrieves a single session by ID', async () => {
      mockResponse.body = {
        success: true,
        message: 'Interview session retrieved',
        data: {
          session: {
            id: 'sess_abc',
            status: 'in_progress',
            targetRole: 'frontend-developer',
            targetSkills: [{ key: 'react', name: 'React' }],
            questions: [],
          },
        },
      };

      const result = await fetchInterviewSessionById('sess_abc');

      assert.ok(lastRequest.url.endsWith('/api/interviews/sessions/sess_abc'));
      assert.equal(result.session.id, 'sess_abc');
      assert.equal(result.session.status, 'in_progress');
    });

    it('startInterviewSession posts to /api/interviews/sessions/:sessionId/start', async () => {
      mockResponse.body = {
        success: true,
        message: 'Interview session started',
        data: {
          session: {
            id: 'sess_start_test',
            status: 'in_progress',
            targetRole: 'backend-developer',
            questions: [],
          },
        },
      };

      const result = await startInterviewSession('sess_start_test');

      assert.ok(lastRequest.url.endsWith('/api/interviews/sessions/sess_start_test/start'));
      assert.equal(lastRequest.options.method, 'POST');
      assert.equal(result.session.status, 'in_progress');
    });

    it('submitInterviewAnswer submits candidate answer and returns evaluated question', async () => {
      mockResponse.body = {
        success: true,
        message: 'Answer submitted and evaluated',
        data: {
          session: {
            id: 'sess_answer_test',
            status: 'in_progress',
            currentQuestionIndex: 2,
            questions: [],
          },
          evaluatedQuestion: {
            questionId: 'iq-node-001',
            order: 1,
            answer: { answerText: 'Valid technical explanation', durationSeconds: 45 },
            evaluation: {
              compositeScore: 0.88,
              dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.9 },
              feedback: 'Well articulated.',
            },
          },
          warnings: [],
        },
      };

      const result = await submitInterviewAnswer('sess_answer_test', 'iq-node-001', {
        answerText: 'Valid technical explanation',
        durationSeconds: 45,
      });

      assert.ok(
        lastRequest.url.endsWith('/api/interviews/sessions/sess_answer_test/questions/iq-node-001/answers'),
      );
      assert.equal(lastRequest.options.method, 'POST');
      assert.equal(result.session.currentQuestionIndex, 2);
      assert.equal(result.evaluatedQuestion.questionId, 'iq-node-001');
      assert.equal(result.evaluatedQuestion.evaluation.compositeScore, 0.88);
    });

    it('completeInterviewSession posts to complete and returns evidence verification result', async () => {
      mockResponse.body = {
        success: true,
        message: 'Interview session completed',
        data: {
          session: {
            id: 'sess_complete_test',
            status: 'completed',
            overallScore: 0.82,
            evaluatorType: 'ai',
          },
          overallScore: 0.82,
          eligibleForVerified: false,
          evidenceResults: [
            {
              skill: 'Node.js',
              score: 0.82,
              status: 'supported',
              evidenceStrength: 'supported',
            },
          ],
          evidenceChecks: [
            {
              id: 'ev_001',
              skillKey: 'nodejs',
              outcome: 'supported',
            },
          ],
        },
      };

      const result = await completeInterviewSession('sess_complete_test');

      assert.ok(lastRequest.url.endsWith('/api/interviews/sessions/sess_complete_test/complete'));
      assert.equal(result.session.status, 'completed');
      assert.equal(result.overallScore, 0.82);
      assert.equal(result.eligibleForVerified, false);
      assert.equal(result.evidenceResults.length, 1);
      assert.equal(result.evidenceChecks.length, 1);
      assert.equal(result.evidenceChecks[0].id, 'ev_001');
    });

    it('abandonInterviewSession posts to abandon and updates status', async () => {
      mockResponse.body = {
        success: true,
        message: 'Interview session abandoned',
        data: {
          session: {
            id: 'sess_abandon_test',
            status: 'abandoned',
          },
        },
      };

      const result = await abandonInterviewSession('sess_abandon_test');

      assert.ok(lastRequest.url.endsWith('/api/interviews/sessions/sess_abandon_test/abandon'));
      assert.equal(result.session.status, 'abandoned');
    });
  });
});
