import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rankRoles } from '../src/domain/careers/matchRole.js';
import { BASELINE_EVALUATION_FIXTURES } from './fixtures/baselineEvaluationFixtures.js';

function evaluateBaseline(fixtures) {
  const predictions = fixtures.map(({ id, expectedRoleId, twin }) => {
    const result = rankRoles(twin, { limit: 1 });
    return {
      id,
      expectedRoleId,
      predictedRoleId: result.matches[0]?.roleId ?? null,
      hasExplanation: Boolean(result.matches[0]?.explanation),
    };
  });

  return {
    predictions,
    top1Accuracy:
      predictions.filter((prediction) => prediction.predictedRoleId === prediction.expectedRoleId)
        .length / predictions.length,
    explanationCoverage:
      predictions.filter((prediction) => prediction.hasExplanation).length / predictions.length,
  };
}

describe('explainable recommendation baseline evaluation', () => {
  it('evaluates reproducible labeled fixtures with transparent metrics', () => {
    const metrics = evaluateBaseline(BASELINE_EVALUATION_FIXTURES);

    assert.equal(metrics.predictions.length, 3);
    assert.equal(metrics.top1Accuracy, 1);
    assert.equal(metrics.explanationCoverage, 1);
  });

  it('produces identical predictions for identical fixture data', () => {
    const first = evaluateBaseline(BASELINE_EVALUATION_FIXTURES);
    const second = evaluateBaseline(BASELINE_EVALUATION_FIXTURES);

    assert.deepEqual(first, second);
  });
});