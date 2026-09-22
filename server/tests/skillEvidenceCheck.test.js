import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ASSESSMENT_PASS_MARK,
  CHECK_OUTCOMES,
  INTERVIEW_PASS_MARK,
  buildAssessmentResult,
  buildInterviewResult,
} from '../src/domain/evidence/skillEvidenceCheck.js';

const completedAt = '2026-09-22T00:00:00.000Z';

describe('skill evidence checks', () => {
  it('turns a passing assessment into verified provenance', () => {
    const result = buildAssessmentResult({
      skill: 'NODE JS',
      score: ASSESSMENT_PASS_MARK,
      assessmentId: 'assessment-1',
      completedAt,
    });

    assert.equal(result.skillKey, 'nodejs');
    assert.equal(result.outcome, CHECK_OUTCOMES.PASS);
    assert.equal(result.eligibleForVerified, true);
    assert.equal(result.evidence.source, 'assessment');
    assert.equal(result.evidence.strength, 'verified');
    assert.equal(result.evidence.reference, 'assessment-1');
  });

  it('does not create verified evidence for a failed assessment', () => {
    const result = buildAssessmentResult({
      skill: 'Docker',
      score: ASSESSMENT_PASS_MARK - 0.01,
      assessmentId: 'assessment-2',
      completedAt,
    });

    assert.equal(result.outcome, CHECK_OUTCOMES.FAIL);
    assert.equal(result.eligibleForVerified, false);
    assert.equal(result.evidence, null);
    assert.equal(result.reference, 'assessment-2');
  });

  it('requires a human interview evaluation for a verified pass', () => {
    const aiResult = buildInterviewResult({
      skill: 'Python',
      score: 1,
      interviewId: 'interview-ai',
      evaluatedBy: 'ai',
      completedAt,
    });
    const humanResult = buildInterviewResult({
      skill: 'Python',
      score: INTERVIEW_PASS_MARK,
      interviewId: 'interview-human',
      evaluatedBy: 'human',
      completedAt,
    });

    assert.equal(aiResult.outcome, CHECK_OUTCOMES.UNCERTAIN);
    assert.equal(aiResult.evidence, null);
    assert.equal(humanResult.outcome, CHECK_OUTCOMES.PASS);
    assert.equal(humanResult.evidence.strength, 'verified');
  });

  it('rejects unknown skills and invalid scores', () => {
    assert.throws(
      () =>
        buildAssessmentResult({ skill: 'Made Up Tool', score: 1, assessmentId: 'assessment-3' }),
      /Unknown canonical skill/,
    );
    assert.throws(
      () => buildAssessmentResult({ skill: 'Docker', score: 2, assessmentId: 'assessment-4' }),
      /between 0 and 1/,
    );
  });
});
