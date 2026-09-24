import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  READINESS_CONTRACT_VERSION,
  READINESS_COUNT_FIELDS,
  READINESS_DATA_STATUS,
  READINESS_EVIDENCE_STATUS,
  READINESS_REQUIRED_FIELDS,
} from '../src/domain/readiness/readinessContract.js';

describe('career readiness contract', () => {
  it('uses the existing evidence vocabulary without adding a score', () => {
    assert.deepEqual(Object.values(READINESS_EVIDENCE_STATUS), [
      'insufficient_data',
      'partial',
      'supported',
      'verified',
    ]);
    assert.ok(!Object.keys(READINESS_EVIDENCE_STATUS).some((key) => /score|percent/i.test(key)));
  });

  it('keeps freshness separate from evidence strength', () => {
    assert.deepEqual(Object.values(READINESS_DATA_STATUS), ['fresh', 'stale', 'incomplete']);
    assert.notEqual(READINESS_DATA_STATUS.STALE, READINESS_EVIDENCE_STATUS.PARTIAL);
  });

  it('requires explainable counts, blockers, and provenance', () => {
    assert.deepEqual(READINESS_COUNT_FIELDS, [
      'total',
      'missing',
      'claimed',
      'supported',
      'verified',
    ]);
    assert.deepEqual(READINESS_REQUIRED_FIELDS, [
      'roleId',
      'evidenceStatus',
      'dataStatus',
      'required',
      'preferred',
      'blockingSkills',
      'basedOn',
    ]);
    assert.equal(READINESS_CONTRACT_VERSION, 1);
  });
});