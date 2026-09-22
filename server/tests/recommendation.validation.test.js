import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findRole } from '../src/domain/careers/roleCatalogue.js';
import { rankRoles, scoreRoleMatch } from '../src/domain/careers/matchRole.js';
import { RECOMMENDATION_FIXTURES } from './fixtures/recommendationFixtures.js';

const BACKEND = findRole('backend-developer');

describe('recommendation validation fixtures', () => {
  it('does not recommend a role for an empty profile', () => {
    const result = rankRoles(RECOMMENDATION_FIXTURES.emptyProfile);

    assert.deepEqual(result.matches, []);
  });

  it('ranks a strong backend fit first with a strong band', () => {
    const result = rankRoles(RECOMMENDATION_FIXTURES.strongBackendFit);

    assert.equal(result.matches[0].roleId, 'backend-developer');
    assert.equal(result.matches[0].band, 'strong');
    assert.ok(result.matches[0].score >= 75);
  });

  it('keeps concrete skill fit ahead of conflicting interests', () => {
    const result = rankRoles(RECOMMENDATION_FIXTURES.conflictingInterestAndSkills);
    const backend = result.matches.find((match) => match.roleId === 'backend-developer');

    assert.ok(backend, 'the concrete backend fit should remain recommendable');
    assert.equal(backend.dimensions.requiredSkills.value, 100);
    assert.ok(backend.score >= 50);
  });

  it('gives supported evidence more credit than claimed evidence', () => {
    const claimed = scoreRoleMatch(RECOMMENDATION_FIXTURES.claimedBackendSkills, BACKEND);
    const supported = scoreRoleMatch(RECOMMENDATION_FIXTURES.supportedBackendSkills, BACKEND);

    assert.ok(supported.score > claimed.score);
    assert.ok(
      supported.dimensions.evidenceStrength.value > claimed.dimensions.evidenceStrength.value,
    );
  });
});