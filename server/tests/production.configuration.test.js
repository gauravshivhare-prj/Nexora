import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { env, isProduction } from '../src/config/env.js';
import { getHealthStatus } from '../src/services/health.service.js';
import { requestWithHeaders, startTestServer } from './helpers/testServer.js';

describe('production configuration hardening (G21)', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  describe('env configuration audit', () => {
    it('loads a valid configured Gemini model identifier', () => {
      assert.ok(typeof env.geminiModel === 'string' && env.geminiModel.length > 0);
      assert.match(env.geminiModel, /^gemini-/);
    });

    it('enforces non-enumerable secret properties on env object', () => {
      const keys = Object.keys(env);
      assert.equal(keys.includes('jwtSecret'), false, 'jwtSecret must not be enumerable');
      assert.equal(keys.includes('geminiApiKey'), false, 'geminiApiKey must not be enumerable');

      const serialized = JSON.stringify(env);
      assert.doesNotMatch(serialized, /jwtSecret/);
      assert.doesNotMatch(serialized, /geminiApiKey/);
    });

    it('validates JWT expiry format and defaults safely', () => {
      assert.match(env.jwtExpiresIn, /^\d+[smhd]$/);
    });
  });

  describe('HTTP headers and CORS defense', () => {
    it('disables x-powered-by and applies nosniff, DENY, and no-referrer', async () => {
      const res = await fetch(`${server.baseUrl}/api/health`);
      assert.equal(res.headers.get('x-powered-by'), null);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    });

    it('handles CORS preflight options with allowed credentials and headers', async () => {
      const res = await fetch(`${server.baseUrl}/api/health`, {
        method: 'OPTIONS',
        headers: {
          Origin: env.clientUrl,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      });

      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), env.clientUrl);
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    });
  });

  describe('health endpoint check', () => {
    it('serves operational status with connected database and timestamp', async () => {
      const { status, body } = await requestWithHeaders(server.baseUrl, '/api/health');

      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.status, 'healthy');
      assert.equal(body.database, 'connected');
      assert.ok(body.timestamp);
      assert.equal(typeof body.timestamp, 'string');
    });

    it('getHealthStatus service reflects real mongoose connection state', () => {
      const health = getHealthStatus();
      assert.equal(health.success, true);
      assert.equal(health.database, 'connected');
      assert.equal(health.status, 'healthy');
    });
  });
});
