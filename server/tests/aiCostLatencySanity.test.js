import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_LIMITS,
} from '../src/domain/interview/interviewContract.js';
import {
  buildInterviewEvaluationRequest,
  escapeCandidateAnswerForPrompt,
} from '../src/domain/interview/interviewAnswerGrounding.js';
import { evaluateQuestionAnswer } from '../src/services/interviewEvaluation.service.js';
import {
  clearInFlightEvaluations,
} from '../src/services/interviewSession.service.js';
import {
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
  clearInterviewSessions,
  clearUsers,
} from './helpers/testServer.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';

const PASSWORD = 'ValidPassword123!';
let counter = 0;

describe('TASK R23 — AI Cost & Latency Sanity Suite', () => {
  let server;
  let providerCallCount = 0;
  let mockProviderDelayMs = 0;
  let lastCapturedRequest = null;

  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: 'cost-sanity-provider',
      async complete(request) {
        providerCallCount += 1;
        lastCapturedRequest = request;

        if (mockProviderDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, mockProviderDelayMs));
        }

        return {
          text: JSON.stringify({
            dimensions: {
              accuracy: 0.90,
              depth: 0.85,
              clarity: 0.85,
              relevance: 0.90,
            },
            feedback: 'Candidate explained microtask queue ordering and event loop phases accurately.',
            strengths: ['Identified timer and poll phases', 'Clear explanation of process.nextTick priority'],
            growthAreas: ['Detail libuv thread pool sizing considerations'],
            groundedSkills: ['Node.js'],
          }),
          model: 'gemini-2.0-flash',
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
    await clearUsers();
    resetRateLimiters();
    clearInFlightEvaluations();

    useAiProvider('cost-sanity-provider');
    providerCallCount = 0;
    mockProviderDelayMs = 0;
    lastCapturedRequest = null;
  });

  async function createAccount(label) {
    counter += 1;
    const email = `cost_sanity_${label}_${Date.now()}_${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: `User ${label}`,
      email,
      password: PASSWORD,
    });

    const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });

    return {
      token: loginRes.body.data.token,
      userId: loginRes.body.data.user.id,
      email,
    };
  }

  async function createStartedSession(token, { questionCount = 2 } = {}) {
    const createRes = await sendJsonWithToken(
      server.baseUrl,
      '/api/interviews/sessions',
      {
        method: 'POST',
        token,
        payload: {
          targetRole: 'Backend Developer',
          targetSkills: ['Node.js', 'PostgreSQL'],
          questionCount,
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

    return startRes.body.data.session;
  }

  // =========================================================================
  // 1. Prompt Token & Input Slicing Bounds
  // =========================================================================
  describe('1. Prompt Token Allocation & Input Slicing Bounds', () => {
    const sampleQuestion = {
      id: 'iq-node-001',
      targetSkill: 'Node.js',
      type: 'conceptual',
      difficulty: 'intermediate',
      prompt: 'Explain the event loop phases and microtask queue priorities in Node.js.',
      rubricCriteria: [
        'Explains timers phase',
        'Explains poll phase',
        'Explains check phase',
      ],
    };

    it('sets maxOutputTokens <= 1024 to prevent runaway generation cost and latency', () => {
      const request = buildInterviewEvaluationRequest({
        question: sampleQuestion,
        answerText: 'The event loop has timers, poll, and check phases.',
      });

      assert.equal(typeof request.maxOutputTokens, 'number');
      assert.ok(
        request.maxOutputTokens <= 1024,
        `Expected maxOutputTokens <= 1024, got ${request.maxOutputTokens}`,
      );
      assert.equal(request.maxOutputTokens, 1024);
    });

    it('bounds oversized candidate answers to studentAnswer.max before XML embedding', () => {
      const oversizedAnswer = 'A'.repeat(INTERVIEW_LIMITS.studentAnswer.max + 1000);
      const request = buildInterviewEvaluationRequest({
        question: sampleQuestion,
        answerText: oversizedAnswer,
      });

      // Extract content within <candidate_untrusted_answer> tag
      const match = request.user.match(
        /<candidate_untrusted_answer>([\s\S]*?)<\/candidate_untrusted_answer>/,
      );
      assert.ok(match, 'Expected <candidate_untrusted_answer> block in prompt');
      const embeddedText = match[1].trim();
      assert.ok(
        embeddedText.length <= INTERVIEW_LIMITS.studentAnswer.max,
        `Embedded answer length ${embeddedText.length} exceeded max ${INTERVIEW_LIMITS.studentAnswer.max}`,
      );
    });

    it('bounds oversized question prompts to questionPrompt.max', () => {
      const oversizedQuestion = {
        ...sampleQuestion,
        prompt: 'P'.repeat(INTERVIEW_LIMITS.questionPrompt.max + 500),
      };
      const request = buildInterviewEvaluationRequest({
        question: oversizedQuestion,
        answerText: 'Valid answer for testing prompt length bounding.',
      });

      const match = request.user.match(/Prompt:\s*([\s\S]*?)\n<\/question_target>/);
      assert.ok(match, 'Expected Prompt inside <question_target>');
      assert.ok(
        match[1].trim().length <= INTERVIEW_LIMITS.questionPrompt.max,
        `Prompt length ${match[1].trim().length} exceeded max ${INTERVIEW_LIMITS.questionPrompt.max}`,
      );
    });

    it('bounds excessive rubric criteria to at most 10 criteria', () => {
      const excessiveRubric = Array.from({ length: 25 }, (_, i) => `Criterion ${i + 1}`);
      const question = {
        ...sampleQuestion,
        rubricCriteria: excessiveRubric,
      };
      const request = buildInterviewEvaluationRequest({
        question,
        answerText: 'Valid answer testing rubric bound.',
      });

      const match = request.user.match(/<rubric_criteria>([\s\S]*?)<\/rubric_criteria>/);
      assert.ok(match, 'Expected <rubric_criteria> block');
      const lines = match[1].trim().split('\n').filter((l) => l.startsWith('- '));
      assert.ok(lines.length <= 10, `Expected at most 10 rubric items, got ${lines.length}`);
    });
  });

  // =========================================================================
  // 2. Service-Layer Input Bounds & Pre-Evaluation Validation
  // =========================================================================
  describe('2. Service-Layer Input Bounds & Pre-Evaluation Validation', () => {
    const validQuestion = {
      id: 'iq-node-002',
      targetSkill: 'Node.js',
      type: 'conceptual',
      difficulty: 'intermediate',
      prompt: 'Explain process.nextTick vs setImmediate in Node.js.',
      rubricCriteria: ['Explains event loop ordering'],
    };

    it('rejects answers shorter than minimum length without invoking AI provider', async () => {
      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: validQuestion,
            answerText: 'tiny',
          }),
        (err) => err.statusCode === 400 && err.errorCode === ERROR_CODES.BAD_REQUEST,
      );

      assert.equal(providerCallCount, 0, 'Provider should not be called for short input');
    });

    it('rejects answers exceeding maximum length without invoking AI provider', async () => {
      const oversized = 'x'.repeat(INTERVIEW_LIMITS.studentAnswer.max + 1);
      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: validQuestion,
            answerText: oversized,
          }),
        (err) => err.statusCode === 400 && err.errorCode === ERROR_CODES.BAD_REQUEST,
      );

      assert.equal(providerCallCount, 0, 'Provider should not be called for oversized input');
    });

    it('rejects question with invalid or missing target skill without invoking AI provider', async () => {
      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: { ...validQuestion, targetSkill: 'MythicalSkill404' },
            answerText: 'Valid answer for testing invalid skill rejection.',
          }),
        (err) => err.statusCode === 400 && err.errorCode === ERROR_CODES.BAD_REQUEST,
      );

      assert.equal(providerCallCount, 0, 'Provider should not be called for unknown skill');
    });

    it('rejects question with missing prompt without invoking AI provider', async () => {
      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: { ...validQuestion, prompt: '' },
            answerText: 'Valid answer for testing missing prompt rejection.',
          }),
        (err) => err.statusCode === 400 && err.errorCode === ERROR_CODES.BAD_REQUEST,
      );

      assert.equal(providerCallCount, 0, 'Provider should not be called for missing prompt');
    });
  });

  // =========================================================================
  // 3. Repeated Evaluation Deduplication & Latency Elimination
  // =========================================================================
  describe('3. Repeated Evaluation Deduplication & Latency Elimination', () => {
    it('deduplicates identical answer resubmissions and avoids repeated AI provider calls', async () => {
      const student = await createAccount('dedup_student');
      const session = await createStartedSession(student.token, { questionCount: 2 });
      const questionId = session.questions[0].questionId;
      const answerPayload = {
        answerText: 'The Node.js event loop prioritizes process.nextTick microtasks before proceeding to the next phase.',
        durationSeconds: 40,
      };

      // 1. Initial submission triggers AI provider
      const firstRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: answerPayload,
        },
      );
      assert.equal(firstRes.status, 200);
      assert.equal(providerCallCount, 1, 'Provider should be called exactly once for initial evaluation');
      assert.ok(firstRes.body.data.evaluatedQuestion.evaluation);
      assert.equal(firstRes.body.data.evaluatedQuestion.answer.attemptNumber, 1);

      // 2. Resubmitting identical answer (e.g. client double-click or network retry) must NOT invoke AI provider
      const secondRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: answerPayload,
        },
      );
      assert.equal(secondRes.status, 200, 'Duplicate submission with identical text should succeed idempotently');
      assert.equal(
        providerCallCount,
        1,
        'Provider call count must remain 1 — repeated AI call must be suppressed',
      );
      assert.equal(
        secondRes.body.data.evaluatedQuestion.evaluation.compositeScore,
        firstRes.body.data.evaluatedQuestion.evaluation.compositeScore,
      );
    });

    it('rejects attempt overwrite with different text when attempt limit reached without calling AI', async () => {
      const student = await createAccount('attempt_limit_student');
      const session = await createStartedSession(student.token, { questionCount: 2 });
      const questionId = session.questions[0].questionId;

      // First valid submission
      const firstRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: {
            answerText: 'Initial answer explaining timer phases accurately.',
          },
        },
      );
      assert.equal(firstRes.status, 200);
      assert.equal(providerCallCount, 1);

      // Second submission with DIFFERENT text when attempt limit is 1
      const overwriteRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: student.token,
          payload: {
            answerText: 'A completely different answer attempting to overwrite previous evaluation.',
          },
        },
      );
      assert.equal(overwriteRes.status, 409);
      assert.equal(overwriteRes.body.errorCode, ERROR_CODES.CONFLICT);
      assert.match(overwriteRes.body.message, /already been submitted/i);

      // Crucial: Provider was NOT called a second time
      assert.equal(
        providerCallCount,
        1,
        'Provider must not be invoked when attempt limit is exceeded',
      );
    });

    it('prevents concurrent duplicate evaluation calls and double spending via in-flight lock', async () => {
      const student = await createAccount('concurrent_lock_student');
      const session = await createStartedSession(student.token, { questionCount: 2 });
      const questionId = session.questions[0].questionId;

      // Introduce provider delay to reliably trigger race condition
      mockProviderDelayMs = 250;

      const submit = (text) =>
        sendJsonWithToken(
          server.baseUrl,
          `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
          {
            method: 'POST',
            token: student.token,
            payload: { answerText: text },
          },
        );

      const [res1, res2] = await Promise.all([
        submit('First racing answer evaluating with provider.'),
        submit('Second racing answer attempting to evaluate concurrently.'),
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.deepEqual(
        statuses,
        [200, 409],
        `Expected exactly one 200 and one 409, got ${res1.status} and ${res2.status}`,
      );

      // Exactly 1 AI provider call made
      assert.equal(
        providerCallCount,
        1,
        'Concurrent evaluation requests must only trigger 1 AI call',
      );
    });
  });
});
