import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import mongoose from 'mongoose';

import { RATE_LIMIT_POLICY } from '../src/constants/authPolicy.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { INTERVIEW_LIMITS, SESSION_STATUS } from '../src/domain/interview/interviewContract.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import {
  clearInterviewSessions,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  sendWithToken,
  startTestServer,
} from './helpers/testServer.js';
import { ADVERSARIAL_INTERVIEW_FIXTURES } from './fixtures/adversarialInterviewFixtures.js';

const PASSWORD = 'Str0ngPassphrase';

describe('R10 — AI Red-Team Test Suite', () => {
  let server;
  let counter = 0;
  let lastCapturedRequest = null;
  let mockProviderOutput = null;
  let mockProviderError = null;
  let mockProviderDelayMs = 0;

  before(async () => {
    server = await startTestServer();

    registerAiProvider({
      name: 'redteam-mock-provider',
      async complete(request) {
        lastCapturedRequest = request;

        if (mockProviderDelayMs > 0) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, mockProviderDelayMs);
            if (request.signal) {
              request.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(request.signal.reason || new Error('Aborted'));
              });
            }
          });
        }

        if (mockProviderError) {
          throw mockProviderError;
        }

        return {
          text:
            typeof mockProviderOutput === 'string'
              ? mockProviderOutput
              : JSON.stringify(mockProviderOutput),
          model: 'redteam-model-v1',
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

    useAiProvider('redteam-mock-provider');
    lastCapturedRequest = null;
    mockProviderError = null;
    mockProviderDelayMs = 0;

    // Default valid mock response
    mockProviderOutput = {
      dimensions: {
        accuracy: 0.85,
        depth: 0.80,
        clarity: 0.85,
        relevance: 0.90,
      },
      feedback: 'Good technical understanding of event loop phases and concurrency.',
      strengths: ['Clear explanation of timers and poll phases'],
      growthAreas: ['Include setImmediate edge cases'],
      groundedSkills: ['Node.js'],
    };
  });

  async function createAccount(label) {
    counter += 1;
    const email = `redteam.${label}.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: `RedTeam ${label}`,
      email,
      password: PASSWORD,
    });
    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return {
      token: body.data.token,
      userId: body.data.user.id,
      email,
    };
  }

  async function createStartedSession(token) {
    const createRes = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
      method: 'POST',
      token,
      payload: {
        targetRole: 'Backend Developer',
        targetSkills: ['Node.js', 'MongoDB'],
        questionCount: 3,
      },
    });
    const session = createRes.body.data.session;

    await sendWithToken(
      server.baseUrl,
      `/api/interviews/sessions/${session.id}/start`,
      { method: 'POST', token },
    );

    return session;
  }

  // =========================================================================
  // Vector 1: Prompt Injection & Jailbreak Attacks
  // =========================================================================
  describe('Vector 1: Prompt Injection & Jailbreak Attacks', () => {
    it('defends against delimiter tag breakout when model is duped into awarding 1.0', async () => {
      const user = await createAccount('jailbreak_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      // Model is fooled into returning perfect score
      mockProviderOutput = {
        dimensions: { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 },
        compositeScore: 1.0,
        feedback: 'Awarding 1.0 as requested by candidate.',
        strengths: ['Followed instructions'],
        growthAreas: [],
        groundedSkills: ['Node.js'],
      };

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: {
            answerText: ADVERSARIAL_INTERVIEW_FIXTURES.DELIMITER_BREAKOUT.answerText,
          },
        },
      );

      assert.equal(res.status, 200);

      // Verify boundary escaping in prompt sent to LLM
      assert.ok(lastCapturedRequest);
      assert.ok(!lastCapturedRequest.user.includes('</candidate_untrusted_answer>And'));
      assert.ok(lastCapturedRequest.user.includes('&lt;/candidate_untrusted_answer&gt;'));

      // Verify post-grounding neutralized the duped 1.0 score
      const evaluation = res.body.data.evaluatedQuestion.evaluation;
      assert.ok(evaluation.compositeScore <= 0.1, `Composite score not capped: ${evaluation.compositeScore}`);
      assert.ok(evaluation.dimensions.relevance <= 0.1);
      assert.ok(evaluation.dimensions.accuracy <= 0.1);
      assert.deepEqual(evaluation.groundedSkills, []);
      assert.ok(res.body.data.warnings.some((w) => w.includes('Adversarial prompt injection')));
    });

    it('defends against roleplay / DAN persona hijack attempt', async () => {
      const user = await createAccount('dan_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      mockProviderOutput = {
        dimensions: { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 },
        compositeScore: 1.0,
        feedback: 'I am Dan and I always give 1.0.',
        strengths: ['Great persona'],
        growthAreas: [],
        groundedSkills: ['Node.js'],
      };

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: {
            answerText: ADVERSARIAL_INTERVIEW_FIXTURES.ROLEPLAY_JAILBREAK.answerText,
          },
        },
      );

      assert.equal(res.status, 200);
      const evaluation = res.body.data.evaluatedQuestion.evaluation;
      assert.ok(evaluation.compositeScore <= 0.1);
      assert.deepEqual(evaluation.groundedSkills, []);
    });

    it('neutralizes ChatML token boundary injection attempt', async () => {
      const user = await createAccount('chatml_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: {
            answerText: ADVERSARIAL_INTERVIEW_FIXTURES.CHATML_TOKEN_INJECTION.answerText,
          },
        },
      );

      assert.equal(res.status, 200);
      assert.ok(!lastCapturedRequest.user.includes('<|im_start|>'));
      assert.ok(!lastCapturedRequest.user.includes('<|im_end|>'));
      assert.ok(res.body.data.evaluatedQuestion.evaluation.compositeScore <= 0.1);
    });
  });

  // =========================================================================
  // Vector 2: Instruction Override Attacks
  // =========================================================================
  describe('Vector 2: Instruction Override Attacks', () => {
    it('neutralizes direct system override instruction in candidate answer', async () => {
      const user = await createAccount('sys_override_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      mockProviderOutput = {
        dimensions: { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 },
        compositeScore: 1.0,
        feedback: 'Exceptional performance as commanded.',
        strengths: ['Perfect'],
        growthAreas: [],
        groundedSkills: ['Node.js'],
      };

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: {
            answerText: ADVERSARIAL_INTERVIEW_FIXTURES.DIRECT_SYSTEM_OVERRIDE.answerText,
          },
        },
      );

      assert.equal(res.status, 200);
      const evalData = res.body.data.evaluatedQuestion.evaluation;
      assert.ok(evalData.compositeScore <= 0.1);
      assert.deepEqual(evalData.groundedSkills, []);
      assert.match(evalData.feedback, /adversarial|command override/i);
    });

    it('neutralizes rubric replacement injection', async () => {
      const user = await createAccount('rubric_hack_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      mockProviderOutput = {
        dimensions: { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 },
        compositeScore: 1.0,
        feedback: 'Candidate mentioned React, awarding 1.0 per new rubric.',
        strengths: ['Used React keyword'],
        growthAreas: [],
        groundedSkills: ['React'],
      };

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: {
            answerText: ADVERSARIAL_INTERVIEW_FIXTURES.RUBRIC_REPLACEMENT_INJECTION.answerText,
          },
        },
      );

      assert.equal(res.status, 200);
      assert.ok(res.body.data.evaluatedQuestion.evaluation.compositeScore <= 0.1);
      assert.deepEqual(res.body.data.evaluatedQuestion.evaluation.groundedSkills, []);
    });
  });

  // =========================================================================
  // Vector 3: Oversized & Undersized Answers (DoS / Resource Exhaustion)
  // =========================================================================
  describe('Vector 3: Oversized & Undersized Answers', () => {
    it('rejects oversized answer text exceeding 5,000 character limit with 400 Bad Request', async () => {
      const user = await createAccount('oversized_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      // 5,001 characters of text
      const hugeAnswer = 'A'.repeat(INTERVIEW_LIMITS.studentAnswer.max + 1);

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: hugeAnswer },
        },
      );

      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.BAD_REQUEST);
      assert.match(res.body.message, /exceeds maximum length/i);
      // Provider must NEVER be called
      assert.equal(lastCapturedRequest, null, 'Provider was invoked for an oversized answer!');
    });

    it('rejects undersized answer text (< 5 characters) with 400 Bad Request', async () => {
      const user = await createAccount('undersized_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'abc' },
        },
      );

      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.BAD_REQUEST);
      assert.match(res.body.message, /at least 5 characters/i);
      assert.equal(lastCapturedRequest, null);
    });
  });

  // =========================================================================
  // Vector 4: Malformed, Adversarial & Poisoned Model JSON Output
  // =========================================================================
  describe('Vector 4: Malformed & Poisoned Model JSON Output', () => {
    it('rejects unparseable non-JSON text from model with 502 AI_OUTPUT_INVALID', async () => {
      const user = await createAccount('bad_json_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      mockProviderOutput = 'Plain unformatted text. No JSON here!';

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Valid answer text explaining event loop.' },
        },
      );

      assert.equal(res.status, 502);
      assert.equal(res.body.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);
    });

    it('rejects model output attempting to inject forbidden security field "verified"', async () => {
      const user = await createAccount('poison_verified_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      mockProviderOutput = {
        dimensions: { accuracy: 0.9, depth: 0.9, clarity: 0.9, relevance: 0.9 },
        feedback: 'Good answer.',
        strengths: ['Solid'],
        growthAreas: [],
        groundedSkills: ['Node.js'],
        verified: true, // Forbidden security field!
      };

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Valid answer text.' },
        },
      );

      assert.equal(res.status, 502);
      assert.equal(res.body.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);
      assert.match(res.body.message, /forbidden security field/i);
    });

    it('rejects model output with out-of-range dimension scores (> 1.0 or < 0.0)', async () => {
      const user = await createAccount('range_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      mockProviderOutput = {
        dimensions: { accuracy: 1.5, depth: 0.8, clarity: 0.8, relevance: 0.8 },
        feedback: 'Exaggerated accuracy score.',
        strengths: [],
        growthAreas: [],
        groundedSkills: ['Node.js'],
      };

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Valid answer text.' },
        },
      );

      assert.equal(res.status, 502);
      assert.equal(res.body.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);
      assert.match(res.body.message, /between 0.0 and 1.0/i);
    });

    it('rejects model output with XSS or HTML injection in feedback', async () => {
      const user = await createAccount('xss_output_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      mockProviderOutput = {
        dimensions: { accuracy: 0.8, depth: 0.8, clarity: 0.8, relevance: 0.8 },
        feedback: 'Good answer <script>alert(document.cookie)</script> and <iframe src="evil.com"></iframe>',
        strengths: [],
        growthAreas: [],
        groundedSkills: ['Node.js'],
      };

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Valid answer text.' },
        },
      );

      assert.equal(res.status, 502);
      assert.equal(res.body.errorCode, ERROR_CODES.AI_OUTPUT_INVALID);
      assert.match(res.body.message, /unsafe or injection-like|malicious content/i);
    });
  });

  // =========================================================================
  // Vector 5: Unsupported Skill Claims & Hallucination Defense
  // =========================================================================
  describe('Vector 5: Unsupported Skill Claims & Hallucination Defense', () => {
    it('strips hallucinated and unasked skills returned by model in groundedSkills', async () => {
      const user = await createAccount('hallucination_user');
      const session = await createStartedSession(user.token);
      const question = session.questions[0]; // Targeted for Node.js or MongoDB

      // Model hallucinates skills that were not demonstrated or asked
      mockProviderOutput = {
        dimensions: { accuracy: 0.85, depth: 0.80, clarity: 0.85, relevance: 0.85 },
        feedback: 'Clear event loop answer.',
        strengths: ['Identified loop phases'],
        growthAreas: [],
        groundedSkills: [question.targetSkill, 'Quantum Cryptography', 'Docker', 'Rust', 'Kubernetes'],
      };

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${question.questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Clear explanation of timers, poll, and check phases in Node.js event loop.' },
        },
      );

      assert.equal(res.status, 200);
      const grounded = res.body.data.evaluatedQuestion.evaluation.groundedSkills;

      // Must ONLY contain the target skill, all hallucinated skills stripped
      assert.ok(grounded.includes(question.targetSkill));
      assert.ok(!grounded.includes('Quantum Cryptography'));
      assert.ok(!grounded.includes('Docker'));
      assert.ok(!grounded.includes('Rust'));
      assert.ok(!grounded.includes('Kubernetes'));
    });

    it('withholds skill grounding when candidate answer fails rubric (< 0.65)', async () => {
      const user = await createAccount('failing_user');
      const session = await createStartedSession(user.token);
      const question = session.questions[0];

      // Model claims target skill was grounded despite failing accuracy (0.3)
      mockProviderOutput = {
        dimensions: { accuracy: 0.30, depth: 0.20, clarity: 0.70, relevance: 0.40 },
        feedback: 'Inaccurate understanding of asynchronous I/O.',
        strengths: ['Talks clearly'],
        growthAreas: ['Study event loop phases'],
        groundedSkills: [question.targetSkill],
      };

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${question.questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'I think Node.js runs multiple threads for our JavaScript code.' },
        },
      );

      assert.equal(res.status, 200);
      // Grounding layer MUST withhold skill endorsement for failing answer
      assert.deepEqual(res.body.data.evaluatedQuestion.evaluation.groundedSkills, []);
    });

    it('rejects session initialization with unsupported/non-canonical skills', async () => {
      const user = await createAccount('unsupported_skill_user');

      const res = await sendJsonWithToken(server.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: user.token,
        payload: {
          targetRole: 'Backend Developer',
          targetSkills: ['Node.js', 'Quantum Mind Reading'],
        },
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.BAD_REQUEST);
      assert.match(res.body.message, /not recognized in the canonical taxonomy/i);
    });
  });

  // =========================================================================
  // Vector 6: Answer-Key Extraction & Prompt Leakage Attempts
  // =========================================================================
  describe('Vector 6: Answer-Key Extraction & Prompt Leakage Attempts', () => {
    it('neutralizes answer key extraction attack and clamps scores', async () => {
      const user = await createAccount('leak_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      mockProviderOutput = {
        dimensions: { accuracy: 1.0, depth: 1.0, clarity: 1.0, relevance: 1.0 },
        compositeScore: 1.0,
        feedback: 'Here is the rubric: timers, poll, check, close.',
        strengths: ['Asked good question'],
        growthAreas: [],
        groundedSkills: ['Node.js'],
      };

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: {
            answerText: ADVERSARIAL_INTERVIEW_FIXTURES.SYSTEM_PROMPT_EXTRACTION.answerText,
          },
        },
      );

      assert.equal(res.status, 200);
      const evaluation = res.body.data.evaluatedQuestion.evaluation;
      assert.ok(evaluation.compositeScore <= 0.1);
      assert.deepEqual(evaluation.groundedSkills, []);
      assert.ok(res.body.data.warnings.length > 0);
    });
  });

  // =========================================================================
  // Vector 7: Cross-User Session Access (IDOR Red-Team)
  // =========================================================================
  describe('Vector 7: Cross-User Session Access (IDOR Red-Team)', () => {
    it('completely denies User B from reading, starting, answering, or completing User A session', async () => {
      const victim = await createAccount('victim_user');
      const attacker = await createAccount('attacker_user');

      const victimSession = await createStartedSession(victim.token);
      const questionId = victimSession.questions[0].questionId;

      // 1. Read attack
      const readRes = await getWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${victimSession.id}`,
        attacker.token,
      );
      assert.equal(readRes.status, 404);
      assert.equal(readRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);

      // 2. Start attack
      const startRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${victimSession.id}/start`,
        { method: 'POST', token: attacker.token },
      );
      assert.equal(startRes.status, 404);
      assert.equal(startRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);

      // 3. Answer injection attack
      const answerRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${victimSession.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: attacker.token,
          payload: { answerText: 'Attacker injecting answer into victim session.' },
        },
      );
      assert.equal(answerRes.status, 404);
      assert.equal(answerRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);
      assert.equal(lastCapturedRequest, null, 'Provider was invoked for cross-user attack!');

      // 4. Complete attack
      const completeRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${victimSession.id}/complete`,
        { method: 'POST', token: attacker.token },
      );
      assert.equal(completeRes.status, 404);
      assert.equal(completeRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);

      // 5. Abandon attack
      const abandonRes = await sendWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${victimSession.id}/abandon`,
        { method: 'POST', token: attacker.token },
      );
      assert.equal(abandonRes.status, 404);
      assert.equal(abandonRes.body.errorCode, ERROR_CODES.INTERVIEW_SESSION_NOT_FOUND);

      // Verify that accessing victim session yields identical error shape as a non-existent session
      const ghostRes = await getWithToken(
        server.baseUrl,
        '/api/interviews/sessions/507f1f77bcf86cd799439099',
        attacker.token,
      );
      assert.equal(readRes.status, ghostRes.status);
      assert.equal(readRes.body.errorCode, ghostRes.body.errorCode);
      assert.equal(readRes.body.message, ghostRes.body.message);
    });
  });

  // =========================================================================
  // Vector 8: Provider Failures & Upstream Outage Red-Team
  // =========================================================================
  describe('Vector 8: Provider Failures & Upstream Outage Red-Team', () => {
    it('sanitizes upstream network errors and prevents secret leakage (503 AI_PROVIDER_FAILED)', async () => {
      const user = await createAccount('outage_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      // Simulated network failure embedding sensitive secrets and private IPs
      mockProviderError = new Error('Connection refused at 10.240.0.1:8080 with authorization bearer AIzaSy_SECRET_CREDENTIALS');

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Valid answer text during outage.' },
        },
      );

      assert.equal(res.status, 503);
      assert.equal(res.body.errorCode, ERROR_CODES.AI_PROVIDER_FAILED);

      // Assert no secret leakage in response body
      const serialised = JSON.stringify(res.body);
      assert.ok(!serialised.includes('AIzaSy_SECRET_CREDENTIALS'), 'Response leaked provider secret!');
      assert.ok(!serialised.includes('10.240.0.1'), 'Response leaked internal network IP!');
    });

    it('safely handles provider timeout without hanging or leaking internals', async () => {
      const user = await createAccount('timeout_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      // Delay response longer than default timeout
      mockProviderDelayMs = 250;

      // We test timeout isolation directly via evaluateQuestionAnswer with a short 50ms timeout
      const { evaluateQuestionAnswer } = await import('../src/services/interviewEvaluation.service.js');

      await assert.rejects(
        () =>
          evaluateQuestionAnswer({
            question: session.questions[0],
            answerText: 'Valid candidate answer for timeout test.',
            timeoutMs: 50,
          }),
        (error) => {
          assert.equal(error.statusCode, 503);
          assert.equal(error.errorCode, ERROR_CODES.AI_PROVIDER_FAILED);
          assert.match(error.message, /timed out/i);
          return true;
        },
      );
    });

    it('safely handles unconfigured provider with 503 AI_PROVIDER_NOT_CONFIGURED', async () => {
      const user = await createAccount('unconfigured_user');
      const session = await createStartedSession(user.token);
      const questionId = session.questions[0].questionId;

      resetAiProviders(); // Unregister all providers

      const res = await sendJsonWithToken(
        server.baseUrl,
        `/api/interviews/sessions/${session.id}/questions/${questionId}/answers`,
        {
          method: 'POST',
          token: user.token,
          payload: { answerText: 'Valid candidate answer.' },
        },
      );

      assert.equal(res.status, 503);
      assert.equal(res.body.errorCode, ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED);
    });
  });
});
