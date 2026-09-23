import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  OPPORTUNITY_CATALOGUE_VERSION,
  OPPORTUNITY_CONTRACT_VERSION,
  OPPORTUNITY_ELIGIBILITY_TYPES,
  OPPORTUNITY_REQUIRED_FIELDS,
  OPPORTUNITY_SOURCE_FIELDS,
  OPPORTUNITY_SOURCE_TYPES,
} from '../src/domain/opportunities/opportunityContract.js';

describe('opportunity contract', () => {
  it('requires stable identity, source provenance, and eligibility metadata', () => {
    assert.deepEqual(OPPORTUNITY_REQUIRED_FIELDS, [
      'id',
      'title',
      'summary',
      'source',
      'eligibility',
      'requiredSkills',
      'targetRoleIds',
    ]);
    assert.deepEqual(OPPORTUNITY_SOURCE_FIELDS, ['type', 'version', 'asOf']);
    assert.equal(OPPORTUNITY_SOURCE_TYPES.CURATED_INTERNAL, 'curated_internal');
  });

  it('limits the MVP eligibility vocabulary to explicit deterministic rules', () => {
    assert.deepEqual(Object.values(OPPORTUNITY_ELIGIBILITY_TYPES), [
      'verified_skills',
      'target_role',
    ]);
    assert.ok(!Object.keys(OPPORTUNITY_ELIGIBILITY_TYPES).some((key) => /ai|score|live/i.test(key)));
  });

  it('versions both the contract and its catalogue', () => {
    assert.equal(OPPORTUNITY_CONTRACT_VERSION, 1);
    assert.equal(OPPORTUNITY_CATALOGUE_VERSION, 1);
  });
});