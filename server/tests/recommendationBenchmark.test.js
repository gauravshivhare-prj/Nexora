import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  BENCHMARK_PERSONAS,
  ADVERSARIAL_BENCHMARK_CASES,
  RECOMMENDATION_BENCHMARK_BASELINES,
  evaluatePersona,
  evaluateMonotonicSensitivity,
  runRecommendationBenchmark,
} from '../src/domain/careers/recommendationBenchmark.js';
import { rankRoles, scoreRoleMatch } from '../src/domain/careers/matchRole.js';
import { findRole } from '../src/domain/careers/roleCatalogue.js';
import {
  clearCareerTwins,
  clearProfiles,
  clearResumes,
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  startTestServer,
} from './helpers/testServer.js';

/**
 * Task 10 — Recommendation Evaluation & Ground-Truth Benchmark Suite
 */

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let counter = 0;

describe('Task 10 — Recommendation Evaluation & Ground-Truth Benchmark Suite', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearCareerTwins();
    await clearResumes();
    await clearProfiles();
    await clearUsers();
    resetRateLimiters();
  });

  async function registerAndLogin() {
    counter += 1;
    const email = `benchmark.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Benchmark Student',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { token: res.body.data.token };
  }

  // =========================================================================
  // 1. Representative Ground-Truth Personas Evaluation
  // =========================================================================
  describe('1. Representative Ground-Truth Personas Evaluation', () => {
    it('achieves 100% Precision@1 on all 5 representative student tracks', () => {
      for (const [key, persona] of Object.entries(BENCHMARK_PERSONAS)) {
        const evalResult = evaluatePersona(persona);

        assert.equal(
          evalResult.actualRole,
          persona.expectedPrimaryRoleId,
          `Persona ${persona.name} (${key}) expected ${persona.expectedPrimaryRoleId} at #1, got ${evalResult.actualRole}`,
        );
        assert.equal(evalResult.precision1Passed, true);
        assert.equal(evalResult.precision3Passed, true);
        assert.equal(
          evalResult.scoreRangePassed,
          true,
          `Score ${evalResult.topScore} was outside range ${persona.expectedScoreRange}`,
        );
        assert.equal(evalResult.ungroundedCount, 0, 'No ungrounded skills allowed');
        assert.equal(evalResult.hasValidExplanation, true, 'Must have valid explanation');
      }
    });

    it('ranks Full Stack Developer #1 with high confidence for advanced fullstack senior', () => {
      const senior = BENCHMARK_PERSONAS.ADVANCED_FULLSTACK;
      const res = rankRoles(senior.twin, { limit: 5 });

      assert.ok(res.matches.length > 0);
      assert.equal(res.matches[0].roleId, 'full-stack-developer');
      assert.ok(res.matches[0].score >= 75);
      assert.equal(res.matches[0].band, 'strong');
      assert.ok(res.matches[0].matchedRequired.length >= 3);
    });

    it('correctly maps non-CS pivot student to Data Analyst without penalizing career change', () => {
      const pivotStudent = BENCHMARK_PERSONAS.NON_CS_DATA_PIVOT;
      const res = rankRoles(pivotStudent.twin, { limit: 5 });

      assert.equal(res.matches[0].roleId, 'data-analyst');
      assert.ok(res.matches[0].score >= 40);
      // Mechanical engineering gets 0 for background alignment, but strong skill fit dominates
      assert.equal(res.matches[0].dimensions.backgroundAlignment.value, 0);
      assert.ok(res.matches[0].dimensions.requiredSkills.value >= 40);
    });
  });

  // =========================================================================
  // 2. Adversarial & Boundary Robustness
  // =========================================================================
  describe('2. Adversarial & Boundary Robustness', () => {
    it('restricts buzzword-stuffed profiles to <= 15 total score without hallucinating skills', () => {
      const buzzwordCase = ADVERSARIAL_BENCHMARK_CASES.BUZZWORD_CHURN;
      const ranked = rankRoles(buzzwordCase.twin, { limit: 5, includeBelowThreshold: true });

      const topMatch = ranked.matches[0];
      assert.ok(topMatch.score <= buzzwordCase.expectedMaxScore);
      assert.equal(topMatch.matchedRequired.length, 0);
      assert.equal(topMatch.matchedPreferred.length, 0);
    });

    it('subordinates contradictory target role to proven concrete skill fit', () => {
      const contraCase = ADVERSARIAL_BENCHMARK_CASES.CONTRADICTORY_GOAL;
      const ranked = rankRoles(contraCase.twin, { limit: 10, includeBelowThreshold: true });

      const backendMatch = ranked.matches.find((m) => m.roleId === contraCase.higherRole);
      const frontendMatch = ranked.matches.find((m) => m.roleId === contraCase.lowerRole);

      assert.ok(backendMatch, 'Backend match must exist');
      assert.ok(frontendMatch, 'Frontend match must exist');
      assert.ok(
        backendMatch.score > frontendMatch.score,
        `Concrete Backend fit (${backendMatch.score}) must exceed contradictory Frontend goal (${frontendMatch.score})`,
      );
    });

    it('produces 0 recommendations for an empty or silent profile', () => {
      const emptyCase = ADVERSARIAL_BENCHMARK_CASES.EMPTY_PROFILE;
      const ranked = rankRoles(emptyCase.twin);

      assert.equal(ranked.matches.length, 0);
    });
  });

  // =========================================================================
  // 3. Monotonic Input Sensitivity & Deterministic Invariance
  // =========================================================================
  describe('3. Monotonic Input Sensitivity & Deterministic Invariance', () => {
    it('guarantees strictly monotonic score progression as evidence is promoted', () => {
      const result = evaluateMonotonicSensitivity();

      assert.equal(
        result.isMonotonic,
        true,
        `Score progression must be strictly increasing: ${result.progression}`,
      );
      assert.ok(result.scores[0] < result.scores[1]);
      assert.ok(result.scores[1] < result.scores[2]);
    });

    it('produces 100% deterministic ranking and scores across repeat evaluations', () => {
      const twin = BENCHMARK_PERSONAS.FOUNDATIONAL_BACKEND.twin;

      const run1 = rankRoles(twin);
      const run2 = rankRoles(twin);

      assert.deepEqual(
        run1.matches.map((m) => ({ roleId: m.roleId, score: m.score, points: m.traceableExplanation.contributingPoints })),
        run2.matches.map((m) => ({ roleId: m.roleId, score: m.score, points: m.traceableExplanation.contributingPoints })),
      );
    });
  });

  // =========================================================================
  // 4. Automated Benchmark Runner & Regression Gate
  // =========================================================================
  describe('4. Automated Benchmark Runner & Regression Gate', () => {
    it('passes all regression quality gates against baseline standards', () => {
      const benchmarkReport = runRecommendationBenchmark();

      assert.equal(benchmarkReport.passedGate, true, `Quality gate failed: ${benchmarkReport.failures.join('; ')}`);
      assert.equal(benchmarkReport.metrics.precisionAt1, RECOMMENDATION_BENCHMARK_BASELINES.minPrecisionAt1);
      assert.equal(benchmarkReport.metrics.precisionAt3, RECOMMENDATION_BENCHMARK_BASELINES.minPrecisionAt3);
      assert.equal(benchmarkReport.metrics.hallucinationRate, RECOMMENDATION_BENCHMARK_BASELINES.maxHallucinationRate);
      assert.equal(benchmarkReport.metrics.contradictionFailures, RECOMMENDATION_BENCHMARK_BASELINES.maxContradictionRate);
      assert.equal(benchmarkReport.metrics.monotonicityPassed, true);
      assert.equal(benchmarkReport.metrics.consistencyPassed, true);
      assert.equal(benchmarkReport.metrics.explanationCompleteness, 1.0);
      assert.equal(benchmarkReport.failures.length, 0);
    });
  });

  // =========================================================================
  // 5. Benchmark API Endpoint Integration
  // =========================================================================
  describe('5. Benchmark API Endpoint Integration', () => {
    it('returns 200 with full evaluation audit from GET /api/careers/benchmark', async () => {
      const { token } = await registerAndLogin();

      const res = await getWithToken(server.baseUrl, '/api/careers/benchmark', token);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const data = res.body.data;
      assert.ok(data.passedGate);
      assert.ok(data.metrics);
      assert.equal(data.metrics.precisionAt1, 1.0);
      assert.equal(data.metrics.hallucinationRate, 0);
      assert.ok(data.personaEvaluations.length >= 5);
      assert.ok(data.baselines);
    });

    it('rejects unauthenticated requests to GET /api/careers/benchmark with 401', async () => {
      const res = await getWithToken(server.baseUrl, '/api/careers/benchmark', null);
      assert.equal(res.status, 401);
    });
  });
});
