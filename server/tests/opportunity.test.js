import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchOpportunities, OPPORTUNITY_CATALOGUE } from '../src/domain/opportunities/opportunityCatalogue.js';

function twinWith(skills, strength = 'verified') {
  return {
    skills: skills.map((name) => ({
      name,
      key: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      strength,
    })),
  };
}

const backendProfile = { career: { targetRole: 'Backend Developer' } };

describe('matchOpportunities', () => {
  it('matches a verified student deterministically and preserves provenance', () => {
    const result = matchOpportunities(
      twinWith(['JavaScript', 'Node.js']),
      backendProfile,
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'curated_internal:backend-apprenticeship');
    assert.equal(result[0].source.type, 'curated_internal');
    assert.equal(result[0].source.version, 1);
    assert.equal(result[0].source.asOf, '2026-09-23');
    assert.match(result[0].explanation, /verified evidence/);
    assert.deepEqual(result, matchOpportunities(twinWith(['JavaScript', 'Node.js']), backendProfile));
  });

  it('returns no match when a verified skill is missing', () => {
    assert.deepEqual(matchOpportunities(twinWith(['JavaScript']), backendProfile), []);
  });

  it('does not treat claimed or supported skills as eligible', () => {
    assert.deepEqual(matchOpportunities(twinWith(['JavaScript', 'Node.js'], 'claimed'), backendProfile), []);
    assert.deepEqual(matchOpportunities(twinWith(['JavaScript', 'Node.js'], 'supported'), backendProfile), []);
  });

  it('rejects an eligibility mismatch even when skills are verified', () => {
    assert.deepEqual(
      matchOpportunities(twinWith(['JavaScript', 'Node.js']), { career: { targetRole: 'Frontend Developer' } }),
      [],
    );
  });

  it('handles missing optional data without inventing a match', () => {
    assert.deepEqual(matchOpportunities(null, null), []);
    assert.deepEqual(matchOpportunities({ skills: [] }, {}), []);
  });

  it('rejects duplicate stable IDs in a supplied catalogue', () => {
    const duplicate = [OPPORTUNITY_CATALOGUE[0], { ...OPPORTUNITY_CATALOGUE[0] }];
    assert.throws(() => matchOpportunities({}, {}, duplicate), /duplicate|missing stable id/);
  });

  it('excludes stale source metadata instead of returning unsupported data', () => {
    const stale = [{
      ...OPPORTUNITY_CATALOGUE[0],
      source: { ...OPPORTUNITY_CATALOGUE[0].source, version: 0 },
    }];

    assert.deepEqual(matchOpportunities(twinWith(['JavaScript', 'Node.js']), backendProfile, stale), []);
  });
});