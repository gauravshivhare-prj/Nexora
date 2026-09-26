import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  OPPORTUNITY_FILTER_TYPES,
  OPPORTUNITY_SOURCE_PRESENTATION,
  OPPORTUNITY_SOURCE_TYPES,
} from '../src/constants/opportunityOptions.js';

import {
  fetchOpportunities,
  toOpportunity,
} from '../src/services/opportunity.service.js';

import {
  OPPORTUNITY_CATALOGUE_VERSION as SERVER_CATALOGUE_VERSION,
  OPPORTUNITY_SOURCE_TYPES as SERVER_SOURCE_TYPES,
} from '../../server/src/domain/opportunities/opportunityContract.js';

describe('P22 — Opportunity Frontend Contract & Parity Suite', () => {
  describe('1. Constant & Domain Parity', () => {
    it('source types match server definitions exactly', () => {
      assert.equal(
        OPPORTUNITY_SOURCE_TYPES.CURATED_INTERNAL,
        SERVER_SOURCE_TYPES.CURATED_INTERNAL,
        'CURATED_INTERNAL source type drifted',
      );
    });

    it('source presentations are complete and have accessible properties', () => {
      for (const [key, pres] of Object.entries(OPPORTUNITY_SOURCE_PRESENTATION)) {
        assert.ok(pres.label, `missing label for ${key}`);
        assert.ok(pres.badgeClass, `missing badgeClass for ${key}`);
        assert.ok(pres.description, `missing description for ${key}`);
        assert.equal(typeof pres.isCurated, 'boolean');
        assert.equal(typeof pres.isLive, 'boolean');
      }
    });

    it('filter types define all expected views', () => {
      assert.deepEqual(OPPORTUNITY_FILTER_TYPES, {
        ALL: 'all',
        CURATED: 'curated',
        LIVE: 'live',
      });
    });
  });

  describe('2. Normalizer & Data Safety Contracts', () => {
    it('toOpportunity normalizes curated internal opportunity correctly', () => {
      const raw = {
        id: 'curated_internal:backend-apprenticeship',
        title: 'Backend apprenticeship',
        summary: 'A practice opportunity for building server-side applications.',
        source: {
          type: 'curated_internal',
          version: 1,
          asOf: '2026-09-23',
        },
        eligibility: [
          { type: 'verified_skills', skills: ['JavaScript', 'Node.js'] },
          { type: 'target_role', roleIds: ['backend-developer'] },
        ],
        requiredSkills: ['JavaScript', 'Node.js'],
        targetRoleIds: ['backend-developer'],
        matchedEligibility: [
          { type: 'verified_skills', skills: ['JavaScript', 'Node.js'] },
        ],
        explanation: 'All listed eligibility rules are satisfied by verified evidence and profile data.',
      };

      const normalized = toOpportunity(raw);

      assert.equal(normalized.id, 'curated_internal:backend-apprenticeship');
      assert.equal(normalized.title, 'Backend apprenticeship');
      assert.equal(normalized.isCurated, true);
      assert.equal(normalized.isLive, false);
      assert.equal(normalized.source.type, 'curated_internal');
      assert.equal(normalized.source.version, 1);
      assert.equal(normalized.source.asOf, '2026-09-23');
      assert.deepEqual(normalized.requiredSkills, ['JavaScript', 'Node.js']);
      assert.deepEqual(normalized.targetRoleIds, ['backend-developer']);
      assert.equal(normalized.explanation, raw.explanation);
    });

    it('toOpportunity distinguishes live external opportunity correctly', () => {
      const raw = {
        id: 'live_external:cloud-engineer',
        title: 'Cloud Engineer Partner Role',
        summary: 'Live opportunity with hiring partner.',
        source: {
          type: 'live_external',
          version: 1,
          asOf: '2026-09-26',
        },
        requiredSkills: ['AWS', 'Docker'],
        targetRoleIds: ['cloud-architect'],
      };

      const normalized = toOpportunity(raw);
      assert.equal(normalized.isCurated, false);
      assert.equal(normalized.isLive, true);
      assert.equal(normalized.source.type, 'live_external');
    });

    it('toOpportunity throws for non-object payloads', () => {
      assert.throws(() => toOpportunity(null), /Opportunity record must be an object\./);
      assert.throws(() => toOpportunity(undefined), /Opportunity record must be an object\./);
      assert.throws(() => toOpportunity('invalid'), /Opportunity record must be an object\./);
    });
  });

  describe('3. Service Endpoints & Request/Response Contracts', () => {
    let originalFetch;
    let originalApiUrl;

    beforeEach(() => {
      originalApiUrl = process.env.VITE_API_URL;
      process.env.VITE_API_URL = 'http://localhost:5000';
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      process.env.VITE_API_URL = originalApiUrl;
    });

    it('fetchOpportunities calls /api/opportunities and returns normalized response', async () => {
      let requestedUrl = null;

      globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: {
              opportunities: [
                {
                  id: 'curated_internal:frontend-apprenticeship',
                  title: 'Frontend apprenticeship',
                  summary: 'A practice opportunity for building accessible browser interfaces.',
                  source: {
                    type: 'curated_internal',
                    version: SERVER_CATALOGUE_VERSION,
                    asOf: '2026-09-23',
                  },
                  requiredSkills: ['HTML', 'CSS', 'JavaScript'],
                  targetRoleIds: ['frontend-developer'],
                  matchedEligibility: [],
                  explanation: 'All listed eligibility rules are satisfied.',
                },
              ],
              catalogue: {
                version: 1,
                source: { type: 'curated_internal', version: 1, asOf: '2026-09-23' },
              },
              method: {
                deterministic: true,
                usesAi: false,
                requiresVerifiedEvidence: true,
                sourceStatus: 'curated_internal',
              },
            },
          }),
        };
      };

      const result = await fetchOpportunities();

      assert.match(requestedUrl, /\/api\/opportunities$/);
      assert.equal(result.opportunities.length, 1);
      assert.equal(result.opportunities[0].id, 'curated_internal:frontend-apprenticeship');
      assert.equal(result.opportunities[0].isCurated, true);
      assert.equal(result.catalogue.version, 1);
      assert.equal(result.method.deterministic, true);
      assert.equal(result.method.usesAi, false);
      assert.equal(result.method.requiresVerifiedEvidence, true);
    });

    it('fetchOpportunities handles empty matches truthfully', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          message: 'No opportunities matched the available verified evidence',
          data: {
            opportunities: [],
            catalogue: { version: 1, source: null },
            method: {
              deterministic: true,
              usesAi: false,
              requiresVerifiedEvidence: true,
            },
          },
        }),
      });

      const result = await fetchOpportunities();
      assert.deepEqual(result.opportunities, []);
      assert.equal(result.method.deterministic, true);
    });

    it('throws error when opportunities array is missing from response', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {},
        }),
      });

      await assert.rejects(
        () => fetchOpportunities(),
        /The backend returned an unexpected opportunities response\./,
      );
    });
  });
});
