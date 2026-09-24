import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  ATTEMPT_STATUS,
  DIFFICULTY_LEVELS,
  DIFFICULTY_ORDER,
  DIFFICULTY_PRESENTATION,
  EVALUATION_OUTCOME,
  EVIDENCE_STATUS,
  QUESTION_ANSWER_STATUS,
  QUESTION_RESULT_PRESENTATION,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  SUBMISSION_LIMITS,
} from '../src/constants/assessmentOptions.js';

import {
  fetchAssessmentById,
  fetchAssessments,
  fetchAttemptById,
  fetchLatestAssessmentResult,
  fetchUserAttempts,
  startAssessmentAttempt,
  submitAssessmentAttempt,
  toAssessment,
  toAssessmentAttempt,
  toAssessmentResult,
} from '../src/services/assessment.service.js';

import {
  ATTEMPT_STATUS as SERVER_ATTEMPT_STATUS,
  CHECK_OUTCOMES as SERVER_CHECK_OUTCOMES,
  DIFFICULTY_LEVELS as SERVER_DIFFICULTY_LEVELS,
  QUESTION_ANSWER_STATUS as SERVER_QUESTION_ANSWER_STATUS,
  QUESTION_TYPES as SERVER_QUESTION_TYPES,
} from '../../server/src/domain/assessment/assessmentContract.js';

describe('A11 — Assessment Frontend Contract & Parity Suite', () => {
  describe('1. Constant & Policy Parity with Backend Domain', () => {
    it('difficulty levels match exactly', () => {
      assert.deepEqual(DIFFICULTY_LEVELS, SERVER_DIFFICULTY_LEVELS, 'DIFFICULTY_LEVELS drifted between client and server');
      assert.deepEqual(
        DIFFICULTY_ORDER,
        [SERVER_DIFFICULTY_LEVELS.BEGINNER, SERVER_DIFFICULTY_LEVELS.INTERMEDIATE, SERVER_DIFFICULTY_LEVELS.ADVANCED],
        'DIFFICULTY_ORDER does not match expected hierarchy',
      );
      for (const level of Object.values(DIFFICULTY_LEVELS)) {
        assert.ok(DIFFICULTY_PRESENTATION[level], `Missing UI presentation for difficulty ${level}`);
        assert.ok(DIFFICULTY_PRESENTATION[level].label, `Missing label for difficulty ${level}`);
      }
    });

    it('question types match exactly', () => {
      assert.deepEqual(QUESTION_TYPES, SERVER_QUESTION_TYPES, 'QUESTION_TYPES drifted between client and server');
      for (const type of Object.values(QUESTION_TYPES)) {
        assert.ok(QUESTION_TYPE_LABELS[type], `Missing UI label for question type ${type}`);
      }
    });

    it('attempt lifecycle statuses match exactly', () => {
      assert.deepEqual(ATTEMPT_STATUS, SERVER_ATTEMPT_STATUS, 'ATTEMPT_STATUS drifted between client and server');
    });

    it('evaluation outcomes match server check outcomes', () => {
      assert.deepEqual(EVALUATION_OUTCOME, SERVER_CHECK_OUTCOMES, 'EVALUATION_OUTCOME drifted from SERVER_CHECK_OUTCOMES');
    });

    it('question answer evaluation statuses match exactly', () => {
      assert.deepEqual(QUESTION_ANSWER_STATUS, SERVER_QUESTION_ANSWER_STATUS, 'QUESTION_ANSWER_STATUS drifted between client and server');
      for (const status of Object.values(QUESTION_ANSWER_STATUS)) {
        assert.ok(QUESTION_RESULT_PRESENTATION[status], `Missing presentation for ${status}`);
        assert.ok(QUESTION_RESULT_PRESENTATION[status].label, `Missing label for ${status}`);
        assert.ok(QUESTION_RESULT_PRESENTATION[status].glyph, `Missing glyph for ${status}`);
      }
    });

    it('submission limits match server bounds', () => {
      assert.equal(SUBMISSION_LIMITS.MAX_ANSWERS, 50, 'MAX_ANSWERS limit mismatch');
      assert.equal(SUBMISSION_LIMITS.MAX_ANSWER_LENGTH, 1000, 'MAX_ANSWER_LENGTH limit mismatch');
    });
  });

  describe('2. Normalizer & Secret Stripping Contracts', () => {
    it('toAssessment normalizes valid backend payloads and strips secret fields', () => {
      const serverPayload = {
        assessmentId: 'asm_react_intermediate',
        slug: 'asm_react_intermediate',
        title: 'React Core & Hooks Architecture',
        description: 'Applied React state and component lifecycle assessment.',
        canonicalSkill: 'React',
        difficulty: 'intermediate',
        version: 1,
        durationMinutes: 20,
        passMark: 0.7,
        totalQuestions: 1,
        questions: [
          {
            questionId: 'q_react_01',
            prompt: 'Which hook manages side effects?',
            type: 'single_choice',
            weight: 1,
            options: [
              { id: 'a', text: 'useEffect' },
              { id: 'b', text: 'useState' },
            ],
            // Malicious or leaked fields that should never be assumed or kept
            expectedAnswer: 'a',
            scoringRule: 'exact_match',
            explanation: 'useEffect manages side effects.',
          },
        ],
      };

      const normalized = toAssessment(serverPayload);

      assert.equal(normalized.assessmentId, 'asm_react_intermediate');
      assert.equal(normalized.title, 'React Core & Hooks Architecture');
      assert.equal(normalized.canonicalSkill, 'React');
      assert.equal(normalized.difficulty, 'intermediate');
      assert.equal(normalized.durationMinutes, 20);
      assert.equal(normalized.passMark, 0.7);
      assert.equal(normalized.totalQuestions, 1);
      assert.equal(normalized.questions.length, 1);

      const q = normalized.questions[0];
      assert.equal(q.questionId, 'q_react_01');
      assert.equal(q.prompt, 'Which hook manages side effects?');
      assert.equal(q.type, 'single_choice');
      assert.equal(q.weight, 1);
      assert.deepEqual(q.options, [
        { id: 'a', text: 'useEffect' },
        { id: 'b', text: 'useState' },
      ]);

      // Secrets must not be populated in normalized client question
      assert.equal(q.expectedAnswer, undefined);
      assert.equal(q.scoringRule, undefined);
      assert.equal(q.explanation, undefined);
    });

    it('toAssessmentAttempt normalizes attempt state and timestamps', () => {
      const serverAttempt = {
        attemptId: '6ab41a72147426ad6d1aa2b6',
        id: '6ab41a72147426ad6d1aa2b6',
        assessmentId: 'asm_node_intermediate',
        attemptNumber: 1,
        status: 'in_progress',
        startedAt: '2026-09-24T08:00:00.000Z',
        expiresAt: '2026-09-24T08:25:00.000Z',
        submittedAt: null,
        timeSpentSeconds: null,
        timeLimitMinutes: 25,
        answers: [],
      };

      const normalized = toAssessmentAttempt(serverAttempt);

      assert.equal(normalized.attemptId, '6ab41a72147426ad6d1aa2b6');
      assert.equal(normalized.assessmentId, 'asm_node_intermediate');
      assert.equal(normalized.status, 'in_progress');
      assert.equal(normalized.attemptNumber, 1);
      assert.equal(normalized.timeLimitMinutes, 25);
      assert.equal(normalized.result, null);
    });

    it('toAssessmentResult normalizes scores, evidence status, and question breakdown', () => {
      const serverResult = {
        assessmentId: 'asm_node_intermediate',
        canonicalSkill: 'Node.js',
        difficulty: 'intermediate',
        score: 0.85,
        earnedPoints: 4.25,
        maxPoints: 5,
        passMark: 0.7,
        passed: true,
        outcome: 'pass',
        evidenceStatus: 'verified',
        completedAt: '2026-09-24T08:15:00.000Z',
        questionBreakdown: [
          {
            questionId: 'q_node_01',
            status: 'correct',
            earnedPoints: 1,
            maxPoints: 1,
            studentAnswer: 'a',
            // Leaked fields must be ignored
            expectedAnswer: 'a',
            scoringRule: 'exact_match',
          },
          {
            questionId: 'q_node_02',
            status: 'partial',
            earnedPoints: 0.5,
            maxPoints: 1,
            studentAnswer: ['a'],
          },
        ],
      };

      const normalized = toAssessmentResult(serverResult);

      assert.equal(normalized.assessmentId, 'asm_node_intermediate');
      assert.equal(normalized.canonicalSkill, 'Node.js');
      assert.equal(normalized.score, 0.85);
      assert.equal(normalized.passed, true);
      assert.equal(normalized.outcome, 'pass');
      assert.equal(normalized.evidenceStatus, 'verified');
      assert.equal(normalized.questionBreakdown.length, 2);

      const q1 = normalized.questionBreakdown[0];
      assert.equal(q1.questionId, 'q_node_01');
      assert.equal(q1.status, 'correct');
      assert.equal(q1.earnedPoints, 1);
      assert.equal(q1.studentAnswer, 'a');
      assert.equal(q1.expectedAnswer, undefined);
      assert.equal(q1.scoringRule, undefined);
    });

    it('normalizers throw when receiving non-object payloads', () => {
      assert.throws(() => toAssessment(null), /Invalid assessment data/);
      assert.throws(() => toAssessmentAttempt(undefined), /Invalid assessment attempt data/);
      assert.throws(() => toAssessmentResult('string'), /Invalid assessment result data/);
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

    it('fetchAssessments formats query parameters and normalizes returned list', async () => {
      mockResponse.body = {
        success: true,
        message: 'Assessments retrieved',
        data: {
          assessments: [
            {
              assessmentId: 'asm_sql_intermediate',
              slug: 'asm_sql_intermediate',
              title: 'SQL Assessment',
              canonicalSkill: 'SQL',
              difficulty: 'intermediate',
              questions: [],
            },
          ],
        },
      };

      const result = await fetchAssessments({ skill: 'SQL', difficulty: 'intermediate' });

      assert.ok(lastRequest.url.includes('/api/assessments?skill=SQL&difficulty=intermediate'));
      assert.equal(result.assessments.length, 1);
      assert.equal(result.assessments[0].assessmentId, 'asm_sql_intermediate');
      assert.equal(result.assessments[0].canonicalSkill, 'SQL');
    });

    it('fetchAssessmentById requires assessmentId and calls GET endpoint', async () => {
      await assert.rejects(() => fetchAssessmentById(''), /assessmentId is required/);

      mockResponse.body = {
        success: true,
        data: {
          assessment: {
            assessmentId: 'asm_docker_intermediate',
            title: 'Docker Assessment',
            canonicalSkill: 'Docker',
            difficulty: 'intermediate',
            questions: [],
          },
        },
      };

      const result = await fetchAssessmentById('asm_docker_intermediate');

      assert.ok(lastRequest.url.endsWith('/api/assessments/asm_docker_intermediate'));
      assert.equal(result.assessment.assessmentId, 'asm_docker_intermediate');
    });

    it('startAssessmentAttempt posts to /api/assessments/:assessmentId/attempts', async () => {
      mockResponse.body = {
        success: true,
        data: {
          attempt: {
            attemptId: 'att_123',
            assessmentId: 'asm_react_intermediate',
            status: 'in_progress',
            startedAt: '2026-09-24T08:00:00.000Z',
          },
          assessment: {
            assessmentId: 'asm_react_intermediate',
            title: 'React Core',
            questions: [],
          },
        },
      };

      const result = await startAssessmentAttempt('asm_react_intermediate');

      assert.ok(lastRequest.url.endsWith('/api/assessments/asm_react_intermediate/attempts'));
      assert.equal(lastRequest.options.method, 'POST');
      assert.equal(result.attempt.attemptId, 'att_123');
      assert.equal(result.assessment.title, 'React Core');
    });

    it('submitAssessmentAttempt validates answers array, posts payload, and returns result & verification', async () => {
      await assert.rejects(() => submitAssessmentAttempt(''), /attemptId is required/);
      await assert.rejects(() => submitAssessmentAttempt('att_123', { answers: 'not an array' }), /answers must be an array/);

      mockResponse.body = {
        success: true,
        data: {
          attempt: {
            attemptId: 'att_123',
            status: 'completed',
            timeSpentSeconds: 150,
          },
          result: {
            assessmentId: 'asm_react_intermediate',
            canonicalSkill: 'React',
            difficulty: 'intermediate',
            score: 0.9,
            passed: true,
            outcome: 'pass',
            evidenceStatus: 'verified',
            questionBreakdown: [],
          },
          verification: {
            verified: true,
            evidenceCheckId: 'chk_456',
            canonicalSkill: 'React',
          },
        },
      };

      const answers = [{ questionId: 'q1', answer: 'a' }];
      const result = await submitAssessmentAttempt('att_123', { answers, timeSpentSeconds: 150 });

      assert.ok(lastRequest.url.endsWith('/api/assessments/attempts/att_123/submit'));
      assert.equal(lastRequest.options.method, 'POST');
      assert.deepEqual(JSON.parse(lastRequest.options.body), { answers, timeSpentSeconds: 150 });
      assert.equal(result.attempt.status, 'completed');
      assert.equal(result.result.score, 0.9);
      assert.equal(result.result.passed, true);
      assert.equal(result.verification.verified, true);
      assert.equal(result.verification.evidenceCheckId, 'chk_456');
    });

    it('fetchAttemptById calls GET /api/assessments/attempts/:attemptId', async () => {
      mockResponse.body = {
        success: true,
        data: {
          attempt: {
            attemptId: 'att_999',
            status: 'completed',
          },
        },
      };

      const result = await fetchAttemptById('att_999');

      assert.ok(lastRequest.url.endsWith('/api/assessments/attempts/att_999'));
      assert.equal(result.attempt.attemptId, 'att_999');
    });

    it('fetchUserAttempts lists attempts with optional assessmentId filter', async () => {
      mockResponse.body = {
        success: true,
        data: {
          attempts: [
            { attemptId: 'att_1', assessmentId: 'asm_sql' },
            { attemptId: 'att_2', assessmentId: 'asm_sql' },
          ],
        },
      };

      const result = await fetchUserAttempts({ assessmentId: 'asm_sql' });

      assert.ok(lastRequest.url.includes('/api/assessments/attempts?assessmentId=asm_sql'));
      assert.equal(result.attempts.length, 2);
    });

    it('fetchLatestAssessmentResult returns null result when student has not completed attempt', async () => {
      mockResponse.body = {
        success: true,
        data: { result: null },
      };

      const result = await fetchLatestAssessmentResult('asm_node');

      assert.ok(lastRequest.url.endsWith('/api/assessments/asm_node/latest'));
      assert.equal(result.result, null);
    });
  });
});
