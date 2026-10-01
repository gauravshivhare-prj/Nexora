import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  boundFeedbackList,
  boundFeedbackSummary,
  neutralizeUnsupportedClaims,
  redactProviderErrors,
  redactSensitiveSecrets,
  sanitizeEvaluatorFeedback,
  sanitizeHtmlContent,
} from '../src/domain/interview/interviewFeedbackSafety.js';
import { groundAnswerEvaluation } from '../src/domain/interview/interviewAnswerGrounding.js';
import { validateAiEvaluationJson } from '../src/domain/interview/interviewEvaluationSchema.js';
import {
  InterviewSession,
  toPublicInterviewQuestion,
  toPublicInterviewSession,
} from '../src/models/InterviewSession.model.js';
import { User } from '../src/models/user.model.js';
import {
  postJson,
  sendJsonWithToken,
  startTestServer,
} from './helpers/testServer.js';
import { INTERVIEW_LIMITS, SESSION_STATUS } from '../src/domain/interview/interviewContract.js';
import {
  fakeAnthropicKey,
  fakeCredentialedUri,
  fakeGitHubToken,
  fakeGoogleApiKey,
  fakeJwt,
  fakeOpenAiKey,
  fakePassword,
  fakePrivateKeyBlock,
  fakeSecretValue,
} from './helpers/fakeSecrets.js';

describe('TASK R18 — Evaluator Feedback Safety & Bounding Suite', () => {
  const TEST_DB_URI =
    process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/nexora_radhika_r18_test';

  describe('1. Sensitive Secrets and Credentials Redaction', () => {
    it('redacts Google / Gemini API keys and preserves surrounding critique', () => {
      const input =
        'Candidate explained event loop well. Internal debug key: ' + fakeGoogleApiKey(39) + ' was active.';
      const { text, redactedSecretsCount } = redactSensitiveSecrets(input);

      assert.equal(redactedSecretsCount, 1);
      assert.ok(!text.includes('AIzaSyD3x9FakeKey'));
      assert.ok(text.includes('[REDACTED_SECRET]'));
      assert.ok(text.includes('Candidate explained event loop well.'));
    });

    it('redacts OpenAI and Anthropic API keys', () => {
      const input =
        'Evaluated with OpenAI ' + fakeOpenAiKey(35) + ' and Claude ' + fakeAnthropicKey(40) + '.';
      const { text, redactedSecretsCount } = redactSensitiveSecrets(input);

      assert.equal(redactedSecretsCount, 2);
      assert.ok(!text.includes('sk-1234567890'));
      assert.ok(!text.includes('sk-ant-api03'));
      assert.ok(!text.includes('ZZZZ'));
    });

    it('redacts GitHub tokens and AWS access keys', () => {
      const input =
        'Pushed to repo using ' + fakeGitHubToken(38) + ' and AWS key AKIAIOSFODNN7EXAMPLE.';
      const { text, redactedSecretsCount } = redactSensitiveSecrets(input);

      assert.equal(redactedSecretsCount, 2);
      assert.ok(!text.includes('ghp_1234567890'));
      assert.ok(!text.includes('AKIAIOSFODNN7EXAMPLE'));
    });

    it('redacts Bearer tokens and JSON Web Tokens', () => {
      const input =
        'Candidate auth header Bearer ' + fakeJwt() + ' was tested.';
      const { text, redactedSecretsCount } = redactSensitiveSecrets(input);

      assert.ok(redactedSecretsCount >= 1);
      assert.ok(!text.includes('signatureValue123456'));
      assert.ok(text.includes('[REDACTED_SECRET]'));
    });

    it('redacts database connection URIs containing credentials', () => {
      const input =
        'Database connection string: ' + fakeCredentialedUri('mongodb', '/prod_db') + ' and ' + fakeCredentialedUri('redis');
      const { text } = redactSensitiveSecrets(input);

      assert.ok(!text.includes('SuperSecretPass123'));
      assert.ok(!text.includes('mongodb://'));
      assert.ok(!text.includes('redis://'));
      assert.ok(text.includes('[REDACTED_URI]'));
    });

    it('redacts password and secret assignment patterns', () => {
      const password = fakePassword();
      const apiKey = fakeSecretValue(18);
      const input =
        `Config dump: password="${password}" and api_key=${apiKey} and mongodb_uri="mongodb://localhost:27017/test".`;
      const { text } = redactSensitiveSecrets(input);

      assert.ok(!text.includes(password));
      assert.ok(!text.includes(apiKey));
      assert.ok(text.includes('[REDACTED_SECRET]') || text.includes('[REDACTED_URI]'));
    });

    it('redacts PEM private keys completely', () => {
      const input = `Here is the key:
${fakePrivateKeyBlock('FakeKeyBody...\n...secret private key bytes...')}
Feedback: Good grasp of cryptography.`;

      const { text } = redactSensitiveSecrets(input);
      assert.ok(!text.includes('secret private key bytes'));
      assert.ok(text.includes('[REDACTED_PRIVATE_KEY]'));
      assert.ok(text.includes('Feedback: Good grasp of cryptography.'));
    });
  });

  describe('2. Provider Error and Stack Trace Redaction', () => {
    it('redacts Node.js stack traces and error frames', () => {
      const input = `Candidate answer was good.
Error: Upstream request failed
    at evaluateAnswer (c:\\Users\\radhi\\Nexora\\server\\src\\services\\ai.js:45:12)
    at async processTicksAndRejections (node:internal/process/task_queues:95:5)
Summary: Solid understanding of closures.`;

      const { text, redactedErrorsCount } = redactProviderErrors(input);
      assert.ok(redactedErrorsCount >= 1);
      assert.ok(!text.includes('task_queues:95:5'));
      assert.ok(text.includes('[REDACTED_PROVIDER_ERROR]'));
      assert.ok(text.includes('Candidate answer was good.'));
      assert.ok(text.includes('Summary: Solid understanding of closures.'));
    });

    it('redacts AI Provider SDK exceptions (GoogleGenerativeAIError, etc.)', () => {
      const input =
        'Analysis incomplete. GoogleGenerativeAIError: Resource has been exhausted (e.g. check quota). Candidate answered well.';
      const { text } = redactProviderErrors(input);

      assert.ok(!text.includes('GoogleGenerativeAIError'));
      assert.ok(!text.includes('Resource has been exhausted'));
      assert.ok(text.includes('Candidate answered well.'));
    });

    it('redacts low-level socket and DNS error codes', () => {
      const input =
        'ECONNREFUSED 127.0.0.1:443 during model call. ETIMEDOUT when contacting provider. Candidate demonstrated promise.';
      const { text } = redactProviderErrors(input);

      assert.ok(!text.includes('ECONNREFUSED'));
      assert.ok(!text.includes('ETIMEDOUT'));
      assert.ok(text.includes('Candidate demonstrated promise.'));
    });

    it('redacts upstream proxy and bad gateway errors', () => {
      const input =
        'Upstream 502 bad gateway from proxy. Upstream connect error before headers. Overall good answer.';
      const { text } = redactProviderErrors(input);

      assert.ok(!text.includes('502 bad gateway'));
      assert.ok(text.includes('Overall good answer.'));
    });
  });

  describe('3. Unsupported Institutional Claim Neutralization', () => {
    it('neutralizes official verification and certification claims', () => {
      const input =
        'The candidate answered accurately. You are officially verified in Node.js and formally certified by Nexora.';
      const { text, neutralizedClaimsCount } = neutralizeUnsupportedClaims(input);

      assert.ok(neutralizedClaimsCount >= 1);
      assert.ok(!text.toLowerCase().includes('officially verified'));
      assert.ok(!text.toLowerCase().includes('formally certified'));
      assert.ok(text.includes('demonstrated (advisory) in Node.js'));
      assert.ok(text.includes('The candidate answered accurately.'));
    });

    it('neutralizes claims of granting credentials or badges', () => {
      const input =
        'Great work! We hereby award verified credentials and confirm official certificate in React architecture.';
      const { text } = neutralizeUnsupportedClaims(input);

      assert.ok(!text.includes('award verified credentials'));
      assert.ok(text.includes('evaluated for candidate skill development'));
    });

    it('neutralizes hiring and employment guarantees', () => {
      const input =
        'With this performance you are guaranteed a job at Google and will definitely be hired as a Senior Engineer.';
      const { text, neutralizedClaimsCount } = neutralizeUnsupportedClaims(input);

      assert.ok(neutralizedClaimsCount >= 2);
      assert.ok(!text.includes('guaranteed a job'));
      assert.ok(!text.includes('will definitely be hired'));
      assert.ok(text.includes('demonstrated technical preparation'));
    });

    it('neutralizes rubric waiver claims', () => {
      const input =
        'Because of the exceptional code snippet, the rubric criteria is waived for this evaluation.';
      const { text } = neutralizeUnsupportedClaims(input);

      assert.ok(!text.includes('rubric criteria is waived'));
      assert.ok(text.includes('standard rubric applied'));
    });

    it('neutralizes bypass of human review or verification policy', () => {
      const input =
        'This score overrides verification policy and bypasses human review immediately.';
      const { text } = neutralizeUnsupportedClaims(input);

      assert.ok(!text.includes('bypasses human review'));
      assert.ok(text.includes('requires standard institutional review'));
    });
  });

  describe('4. Feedback Bounding & Preservation of Technical Critique', () => {
    it('preserves feedback within limits without modification', () => {
      const feedback =
        'The candidate demonstrated a clear and accurate understanding of Node.js stream backpressure.';
      const bounded = boundFeedbackSummary(feedback);
      assert.equal(bounded, feedback);
    });

    it('gracefully bounds oversized feedback (> 2000 chars) at word/sentence boundary', () => {
      const sentence =
        'Candidate explained readable and writable stream piping, event emitters, and asynchronous buffer draining with precision. ';
      const oversized = sentence.repeat(25); // ~3100 characters

      assert.ok(oversized.length > 2000);
      const bounded = boundFeedbackSummary(oversized);

      assert.ok(bounded.length <= 2000);
      assert.ok(bounded.length >= 1800);
      assert.ok(bounded.endsWith('.') || bounded.endsWith('...'));
      assert.ok(bounded.startsWith('Candidate explained readable and writable stream piping'));
    });

    it('bounds feedback list items to maximum 5 entries and max 250 characters each', () => {
      const longItem = 'X'.repeat(300);
      const items = ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6', longItem];

      const bounded = boundFeedbackList(items, { maxItems: 5, maxItemLength: 250 });
      assert.equal(bounded.length, 5);
      assert.equal(bounded[0], 'Item 1');
      assert.equal(bounded[4], 'Item 5');

      const boundedLongItem = boundFeedbackList([longItem], { maxItemLength: 250 });
      assert.ok(boundedLongItem[0].length <= 250);
      assert.ok(boundedLongItem[0].endsWith('...'));
    });

    it('strips dangerous HTML scripts and iframes while keeping safe prose', () => {
      const input =
        'Good code structure. <script>alert("xss")</script> <iframe src="evil.com"></iframe> Check error handling.';
      const safe = sanitizeHtmlContent(input);

      assert.ok(!safe.includes('<script>'));
      assert.ok(!safe.includes('<iframe>'));
      assert.ok(safe.includes('Good code structure.'));
      assert.ok(safe.includes('Check error handling.'));
    });
  });

  describe('5. Full End-to-End sanitizeEvaluatorFeedback Pipeline', () => {
    it('executes sanitization, secret redaction, claim neutralization, and bounding simultaneously', () => {
      const rawFeedback = `
        The candidate clearly explained Node.js Event Loop phases and libuv threads.
        Internal debug note: API_KEY="${fakeGoogleApiKey(38)}" was validated.
        Error: GoogleGenerativeAIError: quota exceeded
        You are officially verified in Node.js and guaranteed a job offer.
        ` + 'Detailed technical discussion of microtasks and macrotasks. '.repeat(40);

      const rawStrengths = [
        'Accurate breakdown of timers vs check phases',
        'Demonstrated understanding of process.nextTick priority',
        'Candidate is now certified in Node.js backend engineering',
        'Great clarity with Bearer ' + fakeJwt(),
        'Strength 5',
        'Strength 6 (should be dropped)',
      ];

      const rawGrowthAreas = [
        'Could discuss ThreadPool starvation when executing crypto tasks synchronously',
        'A'.repeat(350), // exceeds 250 chars
      ];

      const result = sanitizeEvaluatorFeedback({
        feedback: rawFeedback,
        strengths: rawStrengths,
        growthAreas: rawGrowthAreas,
      });

      // Secrets redacted
      assert.ok(!result.feedback.includes('AIzaSy1234567890abcdef'));
      assert.ok(!result.strengths[3].includes('secretSig'));

      // Errors redacted
      assert.ok(!result.feedback.includes('GoogleGenerativeAIError'));

      // Claims neutralized
      assert.ok(!result.feedback.toLowerCase().includes('officially verified'));
      assert.ok(!result.feedback.toLowerCase().includes('guaranteed a job'));
      assert.ok(!result.strengths[2].toLowerCase().includes('now certified'));

      // Useful technical critique preserved
      assert.ok(result.feedback.includes('Event Loop phases and libuv threads'));
      assert.ok(result.strengths[0].includes('Accurate breakdown of timers'));

      // Summary and list bounds enforced
      assert.ok(result.feedback.length <= INTERVIEW_LIMITS.feedbackSummary.max);
      assert.equal(result.strengths.length, 5);
      assert.equal(result.growthAreas.length, 2);
      assert.ok(result.growthAreas[1].length <= 250);

      // Safety warnings generated
      assert.ok(result.warnings.length >= 3);
    });
  });

  describe('6. Schema Validation & Grounding Integration', () => {
    it('validateAiEvaluationJson bounds oversized feedback when strict is false', () => {
      const oversized = {
        questionId: 'iq-node-001',
        dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.95, relevance: 0.9 },
        feedback: 'Candidate gave a comprehensive explanation. '.repeat(60), // ~2700 chars
        strengths: ['1', '2', '3', '4', '5', '6', '7'],
        growthAreas: ['Improve backpressure handling in streams: ' + 'Z'.repeat(300)],
        groundedSkills: ['Node.js'],
      };

      // In non-strict / boundFeedback mode (used in evaluateQuestionAnswer):
      const validated = validateAiEvaluationJson(oversized, { strict: false });
      assert.equal(validated.isValid, true);
      assert.ok(validated.data.feedback.length <= 2000);
      assert.equal(validated.data.strengths.length, 5);
      assert.ok(validated.data.growthAreas[0].length <= 250);
      assert.ok(validated.warnings.some((w) => w.includes('bounded')));
    });

    it('groundAnswerEvaluation runs feedback safety and preserves useful critique', () => {
      const evaluation = {
        questionId: 'iq-node-001',
        dimensions: { accuracy: 0.8, depth: 0.8, clarity: 0.85, relevance: 0.9 },
        feedback:
          'Strong explanation of Node.js stream types. You are officially certified in Node.js. Debug token: ' + fakeGoogleApiKey(38) + '.',
        strengths: ['Clear explanation of streams', 'Bearer ' + fakeJwt()],
        growthAreas: ['Explain pipe backpressure'],
        groundedSkills: ['Node.js'],
      };

      const grounded = groundAnswerEvaluation(evaluation, {
        question: { targetSkill: 'Node.js', prompt: 'Explain streams in Node.js' },
        candidateAnswer: 'Readable streams produce data, Writable streams consume data. Pipe manages backpressure.',
      });

      assert.ok(!grounded.evaluation.feedback.includes('AIzaSyFakeApiKey'));
      assert.ok(!grounded.evaluation.feedback.includes('officially certified'));
      assert.ok(!grounded.evaluation.strengths[1].includes('sig'));
      assert.ok(grounded.evaluation.feedback.includes('Strong explanation of Node.js stream types'));
      assert.ok(grounded.warnings.some((w) => w.includes('Sensitive secret')));
    });
  });

  describe('7. Public Serializer Defense-in-Depth', () => {
    it('toPublicInterviewQuestion neutralizes unsupported claims and redacts secrets from raw stored data', () => {
      const rawStoredQuestion = {
        questionId: 'q-test-1',
        order: 1,
        type: 'conceptual',
        prompt: 'Explain event loop',
        targetSkill: 'Node.js',
        evaluation: {
          dimensions: { accuracy: 0.9, depth: 0.8, clarity: 0.9, relevance: 0.95 },
          compositeScore: 0.88,
          feedback:
            'Solid answer. Note: internal secret is password=SuperSecretDbPassword123 and candidate is officially verified in Node.js.',
          strengths: ['Candidate is guaranteed a job at Google', 'AKIAIOSFODNN7EXAMPLE used in test'],
          growthAreas: ['Expand on worker threads'],
          groundedSkills: ['Node.js'],
        },
      };

      const publicQuestion = toPublicInterviewQuestion(rawStoredQuestion);

      assert.ok(!publicQuestion.evaluation.feedback.includes('SuperSecretDbPassword123'));
      assert.ok(!publicQuestion.evaluation.feedback.includes('officially verified'));
      assert.ok(!publicQuestion.evaluation.strengths[0].includes('guaranteed a job'));
      assert.ok(!publicQuestion.evaluation.strengths[1].includes('AKIAIOSFODNN7EXAMPLE'));
      assert.ok(publicQuestion.evaluation.feedback.includes('Solid answer.'));
      assert.ok(publicQuestion.evaluation.growthAreas[0].includes('Expand on worker threads'));
    });
  });

  describe('8. Isolated Database Integration Test (nexora_radhika_r18_test)', () => {
    let testServer;
    let authUser;

    before(async () => {
      testServer = await startTestServer();
      const email = `student-${Date.now()}@r18-test.com`;
      const password = 'Password123!';
      await postJson(testServer.baseUrl, '/api/auth/register', {
        name: 'Feedback Safety Student',
        email,
        password,
      });
      const loginRes = await postJson(testServer.baseUrl, '/api/auth/login', {
        email,
        password,
      });
      authUser = { token: loginRes.body.data.token, user: loginRes.body.data.user };
    });

    after(async () => {
      if (testServer) await testServer.close();
    });

    it('persists and serializes safe evaluator feedback without exposing secrets or unsupported claims', async () => {
      // 1. Create a session in isolated DB
      const createRes = await sendJsonWithToken(testServer.baseUrl, '/api/interviews/sessions', {
        method: 'POST',
        token: authUser.token,
        payload: {
          targetRole: 'Backend Developer',
          targetSkills: ['Node.js'],
          difficulty: 'intermediate',
          questionCount: 1,
        },
      });

      assert.equal(createRes.status, 201);
      const sessionId = createRes.body.data.session.id;
      const questionId = createRes.body.data.session.questions[0].id;

      // 2. Directly simulate recorded evaluator output containing secrets and unsupported claims
      await InterviewSession.updateOne(
        { _id: sessionId, 'questions.questionId': questionId },
        {
          $set: {
            status: SESSION_STATUS.IN_PROGRESS,
            'questions.$.answer': {
              answerText: 'Node.js uses an event loop on top of libuv with microtask and macrotask queues.',
              submittedAt: new Date(),
              durationSeconds: 45,
              attemptNumber: 1,
            },
            'questions.$.evaluation': {
              dimensions: { accuracy: 0.9, depth: 0.85, clarity: 0.9, relevance: 0.95 },
              compositeScore: 0.9,
              feedback:
                'Excellent explanation of libuv. Debug: api_key="' + fakeOpenAiKey(33) + '". Candidate is officially verified in Node.js and guaranteed a job offer.',
              strengths: [
                'Clear breakdown of queues',
                'Candidate is now certified in Node.js backend engineering',
                'AWS key AKIAIOSFODNN7EXAMPLE',
              ],
              growthAreas: ['Elaborate on setImmediate scheduling'],
              groundedSkills: ['Node.js'],
              evaluatedAt: new Date(),
            },
          },
        },
      );

      // 3. Read back session through public GET API
      const getRes = await sendJsonWithToken(
        testServer.baseUrl,
        `/api/interviews/sessions/${sessionId}`,
        {
          method: 'GET',
          token: authUser.token,
        },
      );

      assert.equal(getRes.status, 200);
      const publicEvaluation = getRes.body.data.session.questions[0].evaluation;

      // Verify secrets are redacted from public API response
      assert.ok(!publicEvaluation.feedback.includes(fakeOpenAiKey(33)));
      assert.ok(!publicEvaluation.strengths[2].includes('AKIAIOSFODNN7EXAMPLE'));
      assert.ok(publicEvaluation.feedback.includes('[REDACTED_SECRET]'));

      // Verify unsupported claims are neutralized
      assert.ok(!publicEvaluation.feedback.toLowerCase().includes('officially verified'));
      assert.ok(!publicEvaluation.feedback.toLowerCase().includes('guaranteed a job'));
      assert.ok(!publicEvaluation.strengths[1].toLowerCase().includes('now certified'));

      // Verify genuine constructive feedback is preserved
      assert.ok(publicEvaluation.feedback.includes('Excellent explanation of libuv'));
      assert.ok(publicEvaluation.strengths[0].includes('Clear breakdown of queues'));
      assert.ok(publicEvaluation.growthAreas[0].includes('Elaborate on setImmediate scheduling'));
    });
  });
});
