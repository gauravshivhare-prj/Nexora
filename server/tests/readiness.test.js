import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeReadiness } from '../src/domain/readiness/computeReadiness.js';

function skill(name, importance, status) {
  return {
    key: name.toLowerCase(),
    name,
    importance,
    status,
    reason: `${name} is ${status}.`,
    evidence: status === 'missing' ? [] : [{ source: status, detail: `Evidence for ${name}.` }],
  };
}

function gap(skills) {
  return {
    roleId: 'backend-developer',
    skills,
    summary: {
      required: counts(skills, 'required'),
      preferred: counts(skills, 'preferred'),
    },
  };
}

function counts(skills, importance) {
  const relevant = skills.filter((item) => item.importance === importance);
  return {
    total: relevant.length,
    missing: relevant.filter((item) => item.status === 'missing').length,
    claimed: relevant.filter((item) => item.status === 'claimed').length,
    supported: relevant.filter((item) => item.status === 'supported').length,
    verified: relevant.filter((item) => item.status === 'verified').length,
  };
}

describe('computeReadiness', () => {
  it('reports verified required evidence without a score', () => {
    const result = computeReadiness(
      gap([
        skill('Node.js', 'required', 'verified'),
        skill('SQL', 'required', 'verified'),
        skill('Figma', 'preferred', 'missing'),
      ]),
      { basedOn: { careerTwinGeneratedAt: '2026-09-23T00:00:00.000Z', catalogueVersion: 1 } },
    );

    assert.equal(result.evidenceStatus, 'verified');
    assert.equal(result.dataStatus, 'fresh');
    assert.deepEqual(result.blockingSkills, []);
    assert.equal(result.preferred.missing, 1);
    assert.equal(result.basedOn.contractVersion, 1);
    assert.equal('score' in result, false);
    assert.equal('percentage' in result, false);
  });

  it('treats missing and claimed required evidence as partial blockers', () => {
    const result = computeReadiness(
      gap([
        skill('Node.js', 'required', 'supported'),
        skill('SQL', 'required', 'claimed'),
        skill('MongoDB', 'required', 'missing'),
      ]),
    );

    assert.equal(result.evidenceStatus, 'partial');
    assert.deepEqual(
      result.blockingSkills.map((item) => item.status),
      ['supported', 'claimed', 'missing'],
    );
    assert.equal(result.required.supported, 1);
  });

  it('reports supported when all required skills are supported or verified', () => {
    const result = computeReadiness(
      gap([
        skill('Node.js', 'required', 'supported'),
        skill('SQL', 'required', 'verified'),
      ]),
    );

    assert.equal(result.evidenceStatus, 'supported');
    assert.equal(result.blockingSkills.length, 1);
    assert.equal(result.blockingSkills[0].status, 'supported');
  });

  it('handles empty or missing optional sections as insufficient data', () => {
    const empty = computeReadiness(null);
    const partial = computeReadiness({ roleId: 'backend-developer' });

    assert.equal(empty.evidenceStatus, 'insufficient_data');
    assert.equal(partial.evidenceStatus, 'insufficient_data');
    assert.deepEqual(empty.required, { total: 0, missing: 0, claimed: 0, supported: 0, verified: 0 });
  });

  it('keeps stale evidence explicit without upgrading or downgrading it', () => {
    const result = computeReadiness(
      gap([skill('Node.js', 'required', 'verified')]),
      { dataStatus: 'stale' },
    );

    assert.equal(result.evidenceStatus, 'verified');
    assert.equal(result.dataStatus, 'stale');
  });
});