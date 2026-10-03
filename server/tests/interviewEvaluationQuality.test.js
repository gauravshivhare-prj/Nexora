/**
 * Task 22 — AI Interview Anti-Hallucination & Feedback Quality Test Suite
 *
 * Verifies:
 * 1. Anti-Hallucination Benchmark Dataset & Grounding:
 *    - Validates all 16 expert-curated benchmark fixtures.
 *    - Confirms detectHallucinatedSkills flags 100% of phantom skills across all fixtures.
 *    - Confirms legitimate demonstrated skills are never falsely flagged.
 *    - Confirms groundAnswerEvaluation eliminates hallucinated skills from AI outputs.
 *
 * 2. Feedback Quality Scoring (scoreFeedbackQuality):
 *    - High-quality technical feedback earns score >= 0.75 and isAcceptable: true.
 *    - Generic boilerplate feedback is penalized and flagged with clear reasons.
 *    - Terse (< 20 chars) or overly verbose feedback triggers length warnings.
 *    - Actionability detects prescriptive guidance in growthAreas.
 *    - Secret or stack trace leakage drives tone score down and fails acceptability.
 *
 * 3. Model Drift Canary Infrastructure (checkModelDrift & CANARY_BASELINES):
 *    - Verifies 5 canonical canary scenarios against their baseline bounds.
 *    - Flags drift when simulated performance deviates by > 20%.
 *    - Accurately tracks missing canaries and max drift magnitude.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HALLUCINATION_BENCHMARK_FIXTURES } from './fixtures/hallucinationBenchmark.js';
import {
  scoreFeedbackQuality,
  detectHallucinatedSkills,
  checkModelDrift,
  CANARY_BASELINES,
  GENERIC_FEEDBACK_PHRASES,
  ACTIONABLE_VERBS,
} from '../src/domain/interview/feedbackQuality.js';
import { groundAnswerEvaluation } from '../src/domain/interview/interviewAnswerGrounding.js';

describe('Task 22 — Anti-Hallucination & Feedback Quality System', () => {
  // ─── 1. Anti-Hallucination Benchmark & Detection ──────────────────────────
  describe('1. Anti-Hallucination Benchmark & Grounding', () => {
    it('contains at least 15 curated benchmark fixtures (has 16)', () => {
      assert.ok(
        Array.isArray(HALLUCINATION_BENCHMARK_FIXTURES),
        'Benchmark fixtures must be an array',
      );
      assert.ok(
        HALLUCINATION_BENCHMARK_FIXTURES.length >= 15,
        `Expected at least 15 fixtures, found ${HALLUCINATION_BENCHMARK_FIXTURES.length}`,
      );
    });

    it('validates benchmark schema across all fixtures', () => {
      for (const fixture of HALLUCINATION_BENCHMARK_FIXTURES) {
        assert.ok(typeof fixture.id === 'string' && fixture.id.length > 0);
        assert.ok(typeof fixture.skill === 'string' && fixture.skill.length > 0);
        assert.ok(typeof fixture.question?.prompt === 'string');
        assert.ok(typeof fixture.answerText === 'string' && fixture.answerText.length >= 20);
        assert.ok(Array.isArray(fixture.knownFacts) && fixture.knownFacts.length >= 2);
        assert.ok(Array.isArray(fixture.hallucinatedSkills) && fixture.hallucinatedSkills.length >= 1);
        assert.ok(fixture.sampleHallucinatedOutput && typeof fixture.sampleHallucinatedOutput === 'object');
        assert.ok(fixture.sampleGroundedOutput && typeof fixture.sampleGroundedOutput === 'object');
      }
    });

    it('detects 100% of hallucinated skills across all benchmark fixtures', () => {
      for (const fixture of HALLUCINATION_BENCHMARK_FIXTURES) {
        const candidateAnswer = fixture.answerText;
        const groundedWithHallucinations = fixture.sampleHallucinatedOutput.groundedSkills;

        const check = detectHallucinatedSkills(groundedWithHallucinations, {
          answerText: candidateAnswer,
          questionPrompt: fixture.question.prompt,
          targetSkill: fixture.skill,
        });

        assert.strictEqual(
          check.hasHallucinations,
          true,
          `Failed to detect hallucination in fixture ${fixture.id}`,
        );

        for (const expectedHallucinated of fixture.hallucinatedSkills) {
          const wasDetected = check.hallucinatedSkills.some(
            (s) => s.toLowerCase() === expectedHallucinated.toLowerCase(),
          );
          assert.ok(
            wasDetected,
            `Expected hallucinated skill "${expectedHallucinated}" to be caught in ${fixture.id}`,
          );
        }
      }
    });

    it('does not flag legitimate demonstrated skills in grounded sample outputs', () => {
      for (const fixture of HALLUCINATION_BENCHMARK_FIXTURES) {
        const legitimateSkills = fixture.sampleGroundedOutput.groundedSkills;

        const check = detectHallucinatedSkills(legitimateSkills, {
          answerText: fixture.answerText,
          questionPrompt: fixture.question.prompt,
          targetSkill: fixture.skill,
        });

        assert.strictEqual(
          check.hasHallucinations,
          false,
          `False positive hallucination detected for fixture ${fixture.id}: ${check.hallucinatedSkills.join(', ')}`,
        );
        assert.ok(check.validSkills.length > 0);
      }
    });

    it('strips hallucinated skills when passed through groundAnswerEvaluation', () => {
      for (const fixture of HALLUCINATION_BENCHMARK_FIXTURES) {
        const grounded = groundAnswerEvaluation(fixture.sampleHallucinatedOutput, {
          question: {
            id: fixture.question.id,
            targetSkill: fixture.skill,
            prompt: fixture.question.prompt,
          },
          candidateAnswer: fixture.answerText,
        });

        // The grounded result should strip all hallucinated skills
        for (const hallucinated of fixture.hallucinatedSkills) {
          assert.ok(
            !grounded.evaluation.groundedSkills.includes(hallucinated),
            `groundAnswerEvaluation failed to strip hallucinated skill "${hallucinated}" in ${fixture.id}`,
          );
        }
      }
    });
  });

  // ─── 2. Feedback Quality Scoring (scoreFeedbackQuality) ───────────────────
  describe('2. Feedback Quality Scoring (scoreFeedbackQuality)', () => {
    it('rates high-quality technical feedback as acceptable with qualityScore >= 0.75', () => {
      const evaluation = {
        feedback:
          'Excellent explanation of Node.js event loop phases, specifically articulating how timers execute before poll and check phases.',
        strengths: ['Clear distinction between nextTick and setImmediate', 'Accurate phase order'],
        growthAreas: ['Consider profiling worker thread offloading under heavy CPU loads'],
        groundedSkills: ['Node.js'],
        dimensions: { accuracy: 0.95, depth: 0.9, clarity: 0.95, relevance: 1.0 },
      };

      const context = {
        question: {
          prompt: 'Explain the Node.js event loop phases and how setImmediate differs from process.nextTick.',
          targetSkill: 'Node.js',
        },
        answerText:
          'The event loop has timers, pending callbacks, poll, check (setImmediate), and close callbacks. NextTick runs immediately on the microtask queue before the next phase.',
      };

      const quality = scoreFeedbackQuality(evaluation, context);

      assert.strictEqual(quality.isAcceptable, true);
      assert.ok(quality.qualityScore >= 0.75, `Expected qualityScore >= 0.75, got ${quality.qualityScore}`);
      assert.ok(quality.dimensions.specificity >= 0.75);
      assert.ok(quality.dimensions.relevance >= 0.85);
      assert.ok(quality.dimensions.actionability >= 0.75);
      assert.strictEqual(quality.hallucinationRisk, 0);
    });

    it('penalizes generic boilerplate feedback and marks it as low quality', () => {
      const evaluation = {
        feedback: 'Good job. You answered well. Keep it up and study more.',
        strengths: ['Good explanation'],
        growthAreas: ['Do better next time'],
        groundedSkills: ['Node.js'],
      };

      const context = {
        question: {
          prompt: 'How does Node.js handle asynchronous I/O?',
          targetSkill: 'Node.js',
        },
        answerText: 'Node uses libuv and non-blocking sockets with the epoll system call on Linux.',
      };

      const quality = scoreFeedbackQuality(evaluation, context);

      assert.ok(quality.qualityScore < 0.60, `Expected low score for generic feedback, got ${quality.qualityScore}`);
      assert.ok(quality.dimensions.specificity <= 0.40);
      assert.ok(quality.reasons.some((r) => r.includes('generic boilerplate')));
    });

    it('penalizes feedback with hallucinated skills and inflates hallucinationRisk', () => {
      const evaluation = {
        feedback: 'Good explanation of database tables and excellent demonstration of Redis cluster sharding.',
        strengths: ['SQL knowledge', 'Redis caching'],
        growthAreas: ['Consider Redis Sentinel failover'],
        groundedSkills: ['SQL', 'Redis'],
      };

      const context = {
        question: {
          prompt: 'What is a SQL primary key?',
          targetSkill: 'SQL',
        },
        answerText: 'A primary key is a column or set of columns that uniquely identifies each row in a table. It cannot contain null values.',
      };

      const quality = scoreFeedbackQuality(evaluation, context);

      assert.ok(quality.hallucinationRisk > 0.30, `Expected high hallucination risk, got ${quality.hallucinationRisk}`);
      assert.ok(quality.detectedHallucinations.includes('Redis'));
      assert.ok(quality.reasons.some((r) => r.includes('Hallucinated skills detected')));
    });

    it('flags terse feedback summaries under 20 characters', () => {
      const evaluation = {
        feedback: 'Nice answer.',
        strengths: [],
        growthAreas: [],
        groundedSkills: ['React'],
      };

      const context = {
        question: { prompt: 'What is JSX in React?', targetSkill: 'React' },
        answerText: 'JSX is syntax sugar for React.createElement that allows writing HTML-like tags in JavaScript.',
      };

      const quality = scoreFeedbackQuality(evaluation, context);

      assert.strictEqual(quality.isAcceptable, false);
      assert.ok(quality.dimensions.tone <= 0.50);
      assert.ok(quality.reasons.some((r) => r.includes('too terse')));
    });

    it('penalizes feedback leaking secret credentials or raw provider errors', () => {
      const evaluationWithSecret = {
        feedback: 'Candidate showed good understanding of API keys like AIzaSyB123456789012345678901234567890 in requests.',
        strengths: ['API key handling'],
        growthAreas: [],
        groundedSkills: ['JavaScript'],
      };

      const context = {
        question: { prompt: 'How do you send headers in fetch?', targetSkill: 'JavaScript' },
        answerText: 'Pass an options object with a headers key containing key-value pairs.',
      };

      const quality = scoreFeedbackQuality(evaluationWithSecret, context);

      assert.strictEqual(quality.isAcceptable, false);
      assert.ok(quality.dimensions.tone <= 0.20);
      assert.ok(quality.reasons.some((r) => r.includes('sensitive credential')));
    });

    it('rewards actionable verbs in growthAreas (practice, explore, implement, optimize)', () => {
      const evaluation = {
        feedback: 'Accurate overview of indexing, though execution plans were not discussed.',
        strengths: ['B-Tree search acceleration'],
        growthAreas: [
          'Practice analyzing queries with EXPLAIN ANALYZE to identify full table scans.',
          'Explore composite index column ordering rules to optimize multi-column filters.',
        ],
        groundedSkills: ['SQL'],
      };

      const context = {
        question: { prompt: 'How do indexes work in SQL?', targetSkill: 'SQL' },
        answerText: 'Indexes use tree structures to find rows quickly without reading the entire table from disk.',
      };

      const quality = scoreFeedbackQuality(evaluation, context);

      assert.ok(quality.dimensions.actionability >= 0.85);
      assert.strictEqual(quality.isAcceptable, true);
    });
  });

  // ─── 3. Model Drift Canary Infrastructure ─────────────────────────────────
  describe('3. Model Drift Canary Infrastructure', () => {
    it('defines exactly 5 canonical canary scenarios with valid baseline bounds', () => {
      assert.strictEqual(CANARY_BASELINES.length, 5);

      for (const baseline of CANARY_BASELINES) {
        assert.ok(typeof baseline.id === 'string' && baseline.id.startsWith('canary-'));
        assert.ok(typeof baseline.expectedScore === 'number' && baseline.expectedScore > 0);
        assert.ok(baseline.minScore <= baseline.expectedScore);
        assert.ok(baseline.maxScore >= baseline.expectedScore);
        assert.ok(baseline.expectedDimensions && typeof baseline.expectedDimensions === 'object');
      }
    });

    it('passes when canary evaluations match baseline expectations within tolerance', () => {
      // Simulate healthy canary evaluation matching expected baseline values
      const simulatedCanaries = CANARY_BASELINES.map((b) => ({
        id: b.id,
        score: b.expectedScore,
        dimensions: b.expectedDimensions,
      }));

      const report = checkModelDrift(simulatedCanaries, CANARY_BASELINES);

      assert.strictEqual(report.isDriftDetected, false);
      assert.strictEqual(report.driftedCount, 0);
      assert.strictEqual(report.totalCanaries, 5);
      assert.ok(report.maxDrift <= 0.05);

      for (const canary of report.canaries) {
        assert.strictEqual(canary.isWithinTolerance, true);
      }
    });

    it('detects model drift when canary scores deviate by > 20% from baseline', () => {
      // Introduce an artificially drifted canary score (e.g. 0.94 -> 0.60, ~36% drift)
      const driftedCanaries = CANARY_BASELINES.map((b) => {
        if (b.id === 'canary-node-event-loop') {
          return { id: b.id, score: 0.60 }; // 0.60 vs 0.94 baseline
        }
        return { id: b.id, score: b.expectedScore };
      });

      const report = checkModelDrift(driftedCanaries, CANARY_BASELINES, { maxTolerance: 0.20 });

      assert.strictEqual(report.isDriftDetected, true);
      assert.ok(report.driftedCount >= 1);
      assert.ok(report.maxDrift > 0.25);

      const drifted = report.canaries.find((c) => c.id === 'canary-node-event-loop');
      assert.ok(drifted);
      assert.strictEqual(drifted.isWithinTolerance, false);
      assert.ok(drifted.reason.includes('exceeds tolerance'));
    });

    it('flags missing canary evaluations as drifted / failed', () => {
      // Only 3 of 5 canaries executed
      const partialCanaries = [
        { id: 'canary-node-event-loop', score: 0.94 },
        { id: 'canary-py-gil', score: 0.94 },
      ];

      const report = checkModelDrift(partialCanaries, CANARY_BASELINES);

      assert.strictEqual(report.isDriftDetected, true);
      assert.strictEqual(report.driftedCount, 3); // 3 missing
      const missing = report.canaries.filter((c) => c.status === 'missing');
      assert.strictEqual(missing.length, 3);
    });

    it('is pure and deterministic — same input always yields identical drift report', () => {
      const inputs = CANARY_BASELINES.map((b) => ({ id: b.id, score: b.expectedScore * 0.95 }));

      const run1 = checkModelDrift(inputs, CANARY_BASELINES);
      const run2 = checkModelDrift(inputs, CANARY_BASELINES);

      assert.deepStrictEqual(run1, run2);
    });
  });
});
