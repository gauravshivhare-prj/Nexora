import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  CONTRIBUTOR_DEFINITIONS,
  READINESS_STATUS_PRESENTATION,
} from '../src/constants/readinessOptions.js';

import {
  fetchReadiness,
} from '../src/services/career.service.js';

describe('P21 — Readiness Visualization & Service Contract Suite', () => {
  describe('1. Contributor Definitions & Taxonomy', () => {
    it('defines exact evidence contributor keys without synthetic scoring', () => {
      const keys = CONTRIBUTOR_DEFINITIONS.map((c) => c.key);
      assert.deepEqual(keys, ['verified', 'supported', 'claimed', 'missing']);
    });

    it('all contributor definitions have label, meaning, and non-empty color classes', () => {
      for (const def of CONTRIBUTOR_DEFINITIONS) {
        assert.ok(def.label, `missing label for ${def.key}`);
        assert.ok(def.meaning, `missing meaning for ${def.key}`);
        assert.ok(def.colorBg, `missing colorBg for ${def.key}`);
        assert.ok(def.borderClass, `missing borderClass for ${def.key}`);
        assert.ok(def.bgClass, `missing bgClass for ${def.key}`);
      }
    });

    it('status presentation covers all backend evidence states', () => {
      const states = ['insufficient_data', 'partial', 'supported', 'verified'];
      for (const st of states) {
        assert.ok(READINESS_STATUS_PRESENTATION[st], `missing presentation for state ${st}`);
        assert.ok(READINESS_STATUS_PRESENTATION[st].label, `missing label for state ${st}`);
        assert.ok(READINESS_STATUS_PRESENTATION[st].badgeClass, `missing badgeClass for state ${st}`);
        assert.ok(READINESS_STATUS_PRESENTATION[st].description, `missing description for state ${st}`);
      }
    });
  });

  describe('2. Career Service fetchReadiness Contract', () => {
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

    it('requires roleId to be non-empty', async () => {
      await assert.rejects(
        () => fetchReadiness(''),
        /roleId is required\./,
      );
      await assert.rejects(
        () => fetchReadiness(null),
        /roleId is required\./,
      );
    });

    it('encodes roleId in API request URL and parses response correctly', async () => {
      const mockReadiness = {
        roleId: 'software-engineer',
        evidenceStatus: 'partial',
        dataStatus: 'fresh',
        required: { total: 6, missing: 1, claimed: 2, supported: 2, verified: 1 },
        preferred: { total: 2, missing: 1, claimed: 0, supported: 1, verified: 0 },
        blockingSkills: [
          { name: 'System Design', status: 'missing', reason: 'Critical skill without verified evidence' },
        ],
        basedOn: { twinBuiltAt: '2026-09-20T10:00:00Z', gapAnalysedAt: '2026-09-20T10:05:00Z' },
      };

      let requestedUrl = null;
      globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            data: { readiness: mockReadiness },
          }),
        };
      };

      const result = await fetchReadiness('software engineer');
      assert.match(requestedUrl, /\/api\/careers\/roles\/software%20engineer\/readiness$/);
      assert.deepEqual(result.readiness, mockReadiness);
    });

    it('throws error when backend response is missing readiness object', async () => {
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
        () => fetchReadiness('software-engineer'),
        /The backend returned an unexpected readiness response\./,
      );
    });
  });
});
