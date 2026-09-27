import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  READINESS_CONTRACT_VERSION,
  READINESS_COUNT_FIELDS,
  READINESS_DATA_STATUS,
  READINESS_EVIDENCE_STATUS,
  READINESS_REQUIRED_FIELDS,
} from '../src/domain/readiness/readinessContract.js';
import { computeReadiness } from '../src/domain/readiness/computeReadiness.js';
import { READINESS_FIXTURES } from './fixtures/readinessFixtures.js';

describe('TASK A19 — Readiness Validation & Contract Audit Suite', () => {
  // =========================================================================
  // 1. Contract Fields & Schema Invariants
  // =========================================================================
  describe('1. Contract Fields & Schema Invariants', () => {
    it('strictly satisfies all READINESS_REQUIRED_FIELDS and READINESS_COUNT_FIELDS', () => {
      const result = computeReadiness(READINESS_FIXTURES.verifiedCandidate);

      for (const field of READINESS_REQUIRED_FIELDS) {
        assert.ok(field in result, `Missing required field: ${field}`);
      }

      for (const countField of READINESS_COUNT_FIELDS) {
        assert.ok(countField in result.required, `Missing required count field: ${countField}`);
        assert.ok(countField in result.preferred, `Missing preferred count field: ${countField}`);
        assert.equal(typeof result.required[countField], 'number');
        assert.equal(typeof result.preferred[countField], 'number');
      }

      assert.equal(result.basedOn.contractVersion, READINESS_CONTRACT_VERSION);
    });

    it('forbids derived percentages, scores, or fabricated metrics anywhere in output', () => {
      const result = computeReadiness(READINESS_FIXTURES.partialCandidate);
      const serialized = JSON.stringify(result).toLowerCase();

      assert.equal(serialized.includes('score'), false);
      assert.equal(serialized.includes('percent'), false);
      assert.equal(serialized.includes('readinessscore'), false);
      assert.equal(serialized.includes('grade'), false);
    });
  });

  // =========================================================================
  // 2. Thresholds: Insufficient Data, Partial, Supported, Verified
  // =========================================================================
  describe('2. Evidence Status Thresholds', () => {
    it('returns VERIFIED when all required skills are verified, ignoring preferred gaps', () => {
      const result = computeReadiness(READINESS_FIXTURES.verifiedCandidate);

      assert.equal(result.evidenceStatus, READINESS_EVIDENCE_STATUS.VERIFIED);
      assert.deepEqual(result.blockingSkills, []);
      assert.equal(result.required.missing, 0);
      assert.equal(result.required.claimed, 0);
      assert.equal(result.required.supported, 0);
      assert.equal(result.required.verified, 4);
    });

    it('retains VERIFIED even when all preferred skills are missing (preferred gaps do not block readiness)', () => {
      const result = computeReadiness(READINESS_FIXTURES.preferredOnlyGaps);

      assert.equal(result.evidenceStatus, READINESS_EVIDENCE_STATUS.VERIFIED);
      assert.deepEqual(result.blockingSkills, []);
      assert.equal(result.preferred.missing, 3);
      assert.equal(result.preferred.total, 3);
    });

    it('returns SUPPORTED when all required skills are supported or verified with at least one supported', () => {
      const result = computeReadiness(READINESS_FIXTURES.supportedCandidate);

      assert.equal(result.evidenceStatus, READINESS_EVIDENCE_STATUS.SUPPORTED);
      // Supported required skills still appear in blockingSkills until independently verified
      assert.equal(result.blockingSkills.length, 2);
      for (const skill of result.blockingSkills) {
        assert.equal(skill.status, 'supported');
      }
    });

    it('returns PARTIAL when any required skill is missing or claimed', () => {
      const result = computeReadiness(READINESS_FIXTURES.partialCandidate);

      assert.equal(result.evidenceStatus, READINESS_EVIDENCE_STATUS.PARTIAL);
      // Blocking skills include missing, claimed, and supported required skills
      const statuses = result.blockingSkills.map((s) => s.status);
      assert.ok(statuses.includes('missing'));
      assert.ok(statuses.includes('claimed'));
      assert.ok(statuses.includes('supported'));
      assert.equal(statuses.includes('verified'), false);
    });

    it('returns INSUFFICIENT_DATA when gap has no required skills, missing roleId, or is null', () => {
      const nullResult = computeReadiness(null);
      assert.equal(nullResult.evidenceStatus, READINESS_EVIDENCE_STATUS.INSUFFICIENT_DATA);
      assert.deepEqual(nullResult.blockingSkills, []);
      assert.equal(nullResult.required.total, 0);

      const noRoleResult = computeReadiness({ skills: [] });
      assert.equal(noRoleResult.evidenceStatus, READINESS_EVIDENCE_STATUS.INSUFFICIENT_DATA);

      const zeroReqResult = computeReadiness({
        roleId: 'backend-developer',
        skills: [{ key: 'docker', name: 'Docker', importance: 'preferred', status: 'verified' }],
      });
      assert.equal(zeroReqResult.evidenceStatus, READINESS_EVIDENCE_STATUS.INSUFFICIENT_DATA);
    });
  });

  // =========================================================================
  // 3. Explanations & Evidence Provenance
  // =========================================================================
  describe('3. Explanations & Evidence Invariants', () => {
    it('ensures every blocking skill carries a clear, non-empty explanation', () => {
      const result = computeReadiness(READINESS_FIXTURES.partialCandidate);

      for (const skill of result.blockingSkills) {
        assert.ok(typeof skill.reason === 'string');
        assert.ok(skill.reason.trim().length > 0, `${skill.name} has empty reason`);
        assert.ok(Array.isArray(skill.evidence));
      }
    });

    it('generates truthful fallback explanations when input gap omits reason', () => {
      const result = computeReadiness(READINESS_FIXTURES.missingReasonExplanations);

      for (const skill of result.blockingSkills) {
        assert.ok(skill.reason.length > 0, `Fallback explanation missing for ${skill.name}`);
        if (skill.status === 'missing') {
          assert.match(skill.reason, /not been demonstrated/i);
        } else if (skill.status === 'claimed') {
          assert.match(skill.reason, /claimed on your profile/i);
        } else if (skill.status === 'supported') {
          assert.match(skill.reason, /supported by project work/i);
        }
      }
    });
  });

  // =========================================================================
  // 4. Contradictory Evidence States & Robustness
  // =========================================================================
  describe('4. Contradictory Evidence States & Robustness', () => {
    it('discards contradictory summary numbers and derives truthful counts directly from skills', () => {
      const result = computeReadiness(READINESS_FIXTURES.contradictorySummary);

      // Input summary falsely claimed 10 total and 10 verified, but skills has 1 claimed and 1 missing
      assert.equal(result.required.total, 2);
      assert.equal(result.required.verified, 0);
      assert.equal(result.required.claimed, 1);
      assert.equal(result.required.missing, 1);
      assert.equal(result.evidenceStatus, READINESS_EVIDENCE_STATUS.PARTIAL);
    });

    it('resolves conflicting duplicate skills in favor of the highest evidence status', () => {
      const result = computeReadiness(READINESS_FIXTURES.duplicateConflictingSkills);

      // SQL was present twice (missing AND verified) -> verified wins!
      // Node.js was present twice (claimed AND supported) -> supported wins!
      // JavaScript was verified, REST APIs was verified -> all 4 required are at least supported (3 verified, 1 supported)
      assert.equal(result.evidenceStatus, READINESS_EVIDENCE_STATUS.SUPPORTED);

      const blockingKeys = result.blockingSkills.map((s) => s.key);
      assert.equal(blockingKeys.includes('sql'), false, 'SQL is verified, must not block');
      assert.ok(blockingKeys.includes('nodejs'), 'Node.js is supported, must be in blockingSkills');
    });

    it('preserves verified evidenceStatus even when CareerTwin dataStatus is stale', () => {
      const result = computeReadiness(READINESS_FIXTURES.verifiedCandidate, {
        dataStatus: READINESS_DATA_STATUS.STALE,
        basedOn: {
          careerTwinGeneratedAt: '2026-09-20T00:00:00.000Z',
          catalogueVersion: 1,
        },
      });

      assert.equal(result.evidenceStatus, READINESS_EVIDENCE_STATUS.VERIFIED);
      assert.equal(result.dataStatus, READINESS_DATA_STATUS.STALE);
      assert.equal(result.basedOn.careerTwinGeneratedAt, '2026-09-20T00:00:00.000Z');
    });

    it('normalizes invalid or unknown dataStatus strings safely to incomplete', () => {
      const result = computeReadiness(READINESS_FIXTURES.verifiedCandidate, {
        dataStatus: 'unknown-status',
      });

      assert.equal(result.dataStatus, READINESS_DATA_STATUS.INCOMPLETE);
    });
  });
});
