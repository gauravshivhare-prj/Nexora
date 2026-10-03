import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  estimateTokensFromChars,
  estimateAiCost,
  resolvePricingRates,
} from '../src/domain/ai/aiCostEstimator.js';
import {
  getDailyQuota,
  getTodayUtcKey,
  getSecondsUntilUtcMidnight,
  checkUserAiQuota,
  recordAiUsage,
  getUserAiQuotaStatus,
  resetUserAiQuota,
} from '../src/services/ai/aiQuota.service.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { UserAiQuota } from '../src/models/UserAiQuota.model.js';
import {
  registerAiProvider,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import {
  clearCareerTwins,
  clearProfiles,
  clearResumes,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  startTestServer,
} from './helpers/testServer.js';
import { fakePassword } from './helpers/fakeSecrets.js';
import { signAccessToken } from '../src/utils/jwt.js';

describe('TASK 38 — AI Cost, Rate Limiting, Quotas & Resource-Abuse Protection', () => {
  describe('1. Cost Estimation Engine & Token Economics', () => {
    it('approximates tokens accurately using 4-chars-per-token heuristic', () => {
      assert.equal(estimateTokensFromChars(0), 0);
      assert.equal(estimateTokensFromChars(-10), 0);
      assert.equal(estimateTokensFromChars(4), 1);
      assert.equal(estimateTokensFromChars(5), 2);
      assert.equal(estimateTokensFromChars(1000), 250);
      assert.equal(estimateTokensFromChars(4000), 1000);
    });

    it('resolves correct pricing tiers for Flash and Pro models', () => {
      const flash = resolvePricingRates('gemini-1.5-flash');
      assert.equal(flash.inputPerMillion, 0.075);
      assert.equal(flash.outputPerMillion, 0.30);

      const pro = resolvePricingRates('gemini-1.5-pro');
      assert.equal(pro.inputPerMillion, 1.25);
      assert.equal(pro.outputPerMillion, 5.0);

      const fallback = resolvePricingRates('unknown-model');
      assert.equal(fallback.inputPerMillion, 0.075);
    });

    it('computes deterministic cost in USD for Flash evaluations', () => {
      // 4000 chars input = 1000 input tokens ($0.000075)
      // 500 output tokens = ($0.000150)
      // Total cost = $0.000225
      const cost = estimateAiCost({
        contractId: 'interview_evaluation',
        inputChars: 4000,
        outputTokens: 500,
        model: 'gemini-1.5-flash',
      });

      assert.equal(cost.estimatedInputTokens, 1000);
      assert.equal(cost.outputTokens, 500);
      assert.equal(cost.totalTokens, 1500);
      assert.equal(cost.costUsd, 0.000225);
      assert.equal(cost.contractId, 'interview_evaluation');
      assert.equal(cost.model, 'gemini-1.5-flash');
    });

    it('computes deterministic cost in USD for Pro evaluations', () => {
      // 8000 chars input = 2000 input tokens ($0.0025)
      // 1000 output tokens = ($0.005)
      // Total cost = $0.007500
      const cost = estimateAiCost({
        contractId: 'resume_extraction',
        inputChars: 8000,
        outputTokens: 1000,
        model: 'gemini-1.5-pro',
      });

      assert.equal(cost.estimatedInputTokens, 2000);
      assert.equal(cost.outputTokens, 1000);
      assert.equal(cost.costUsd, 0.0075);
    });
  });

  describe('2. Quota Service Utility Functions', () => {
    it('generates a valid YYYY-MM-DD UTC date key', () => {
      const fixedDate = new Date(Date.UTC(2026, 9, 3, 14, 30, 0));
      assert.equal(getTodayUtcKey(fixedDate), '2026-10-03');
    });

    it('computes accurate seconds until UTC midnight', () => {
      const midday = new Date(Date.UTC(2026, 9, 3, 12, 0, 0));
      const seconds = getSecondsUntilUtcMidnight(midday);
      assert.equal(seconds, 12 * 3600); // 43,200 seconds
    });

    it('respects default daily limit of 50 evaluations', () => {
      assert.equal(getDailyQuota(), 50);
    });
  });

  describe('3. Integration & Server Quota Enforcement', () => {
    let server;
    let studentToken;
    let studentId;
    let otherToken;
    let otherId;

    const mockAiProvider = {
      name: 'quota-test-provider',
      async complete(request) {
        return {
          text: JSON.stringify({
            skills: [{ name: 'Node.js', confidence: 0.9 }],
            summary: 'A candidate with strong backend foundations in Node.js.',
          }),
          model: 'quota-test-provider',
        };
      },
    };

    before(async () => {
      server = await startTestServer();
      registerAiProvider(mockAiProvider);
      useAiProvider('quota-test-provider');
    });

    after(async () => {
      resetAiProviders();
      await server.close();
    });

    beforeEach(async () => {
      await clearUsers();
      await clearProfiles();
      await clearResumes();
      await clearCareerTwins();
      await UserAiQuota.deleteMany({});
      resetRateLimiters();

      const reg1 = await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Student One',
        email: 'student1.quota@example.com',
        password: fakePassword(),
      });
      studentId = reg1.body.data.user.id;
      studentToken = signAccessToken({ id: studentId });

      const reg2 = await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Student Two',
        email: 'student2.quota@example.com',
        password: fakePassword(),
      });
      otherId = reg2.body.data.user.id;
      otherToken = signAccessToken({ id: otherId });
    });

    it('exposes initial zero usage via GET /api/student/ai-quota', async () => {
      const res = await getWithToken(server.baseUrl, '/api/student/ai-quota', studentToken);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.count, 0);
      assert.equal(res.body.data.dailyLimit, 50);
      assert.equal(res.body.data.remaining, 50);
      assert.equal(res.body.data.isExhausted, false);
      assert.ok(res.body.data.resetsInSeconds > 0);
    });

    it('increments usage counter and records estimated cost on recordAiUsage', async () => {
      const recorded = await recordAiUsage({
        userId: studentId,
        contractId: 'interview_evaluation',
        model: 'gemini-1.5-flash',
        inputChars: 2000,
        outputTokens: 200,
      });

      assert.ok(recorded);
      assert.equal(recorded.quota.count, 1);
      assert.equal(recorded.quota.remaining, 49);
      assert.ok(recorded.cost.costUsd > 0);

      const status = await getUserAiQuotaStatus(studentId);
      assert.equal(status.count, 1);
      assert.equal(status.remaining, 49);
      assert.equal(status.estimatedCostUsd, recorded.cost.costUsd);
    });

    it('blocks AI evaluation when user reaches daily quota with 429 AI_QUOTA_EXCEEDED', async () => {
      // Simulate exhausting user quota
      await UserAiQuota.findOneAndUpdate(
        { user: studentId, dateKey: getTodayUtcKey() },
        { $set: { count: 50, estimatedCostUsd: 0.05 } },
        { upsert: true },
      );

      // Verify checkUserAiQuota throws 429 AI_QUOTA_EXCEEDED with retryAfter
      let errorThrown = null;
      try {
        await checkUserAiQuota(studentId);
      } catch (err) {
        errorThrown = err;
      }

      assert.ok(errorThrown, 'Must throw when quota exceeded');
      assert.equal(errorThrown.statusCode, 429);
      assert.equal(errorThrown.errorCode, ERROR_CODES.AI_QUOTA_EXCEEDED);
      assert.ok(errorThrown.retryAfter > 0, 'Must have retryAfter');
    });

    it('rejects resume analysis when user AI quota is exhausted', async () => {
      // 1. Upload a resume
      const createRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
        method: 'POST',
        token: studentToken,
        payload: {
          text: 'Software Engineer with experience in Node.js and TypeScript.',
          label: 'Test Resume',
        },
      });
      assert.equal(createRes.status, 201);
      const resumeId = createRes.body.data.resume.id;

      // 2. Set quota to limit
      await UserAiQuota.findOneAndUpdate(
        { user: studentId, dateKey: getTodayUtcKey() },
        { $set: { count: 50 } },
        { upsert: true },
      );

      // 3. Attempt analysis
      const analyzeRes = await sendJsonWithToken(
        server.baseUrl,
        `/api/resumes/${resumeId}/analysis`,
        {
          method: 'POST',
          token: studentToken,
          payload: {},
        },
      );

      assert.equal(analyzeRes.status, 429);
      assert.equal(analyzeRes.body.errorCode, ERROR_CODES.AI_QUOTA_EXCEEDED);
      assert.ok(analyzeRes.headers.get('retry-after'));
    });

    it('gracefully degrades CareerTwin generation without narrative when AI quota is exhausted', async () => {
      // Setup profile
      await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token: studentToken,
        payload: {
          skills: [{ name: 'Node.js', level: 'intermediate' }],
        },
      });

      // Exhaust quota
      await UserAiQuota.findOneAndUpdate(
        { user: studentId, dateKey: getTodayUtcKey() },
        { $set: { count: 50 } },
        { upsert: true },
      );

      // Generate CareerTwin with narrative requested
      const twinRes = await sendJsonWithToken(server.baseUrl, '/api/career-twin?narrative=true', {
        method: 'POST',
        token: studentToken,
        payload: {},
      });

      // Must succeed (200 OK) with standard deterministic intelligence, gracefully omitting narrative
      assert.equal(twinRes.status, 200);
      assert.equal(twinRes.body.success, true);
      assert.equal(twinRes.body.data.careerTwin.narrative, null, 'Narrative must be null when quota is exhausted');
    });

    it('enforces quota isolation between separate users', async () => {
      // User 1 exhausted
      await UserAiQuota.findOneAndUpdate(
        { user: studentId, dateKey: getTodayUtcKey() },
        { $set: { count: 50 } },
        { upsert: true },
      );

      // User 2 has zero usage
      const otherStatus = await getUserAiQuotaStatus(otherId);
      assert.equal(otherStatus.count, 0);
      assert.equal(otherStatus.remaining, 50);

      // User 2 can check quota without error
      await assert.doesNotReject(async () => {
        await checkUserAiQuota(otherId);
      });
    });
  });
});
