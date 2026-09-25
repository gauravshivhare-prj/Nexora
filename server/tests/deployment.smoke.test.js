import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { getWithToken, requestWithHeaders, startTestServer } from './helpers/testServer.js';

describe('deployment smoke', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  it('serves the health endpoint with a controlled response', async () => {
    const { status, body } = await requestWithHeaders(server.baseUrl, '/api/health');

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.match(body.message, /healthy/i);
  });

  it('sends baseline security headers and hides the framework', async () => {
    const response = await fetch(`${server.baseUrl}/api/health`);

    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  });

  it('keeps protected deployment routes authenticated', async () => {
    const { status, body } = await requestWithHeaders(server.baseUrl, '/api/opportunities');

    assert.equal(status, 401);
    assert.equal(body.success, false);
    assert.equal(body.errorCode, 'AUTH_TOKEN_MISSING');
    assert.match(body.message, /authentication required/i);
  });

  it('advertises the configured frontend origin for CORS', async () => {
    const response = await fetch(`${server.baseUrl}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });

  describe('core-loop smoke checks', () => {
    let authToken;

    it('authenticates through register and login endpoints', async () => {
      const email = `smoke.${Date.now()}@example.com`;
      const regRes = await fetch(`${server.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Smoke Tester',
          email,
          password: 'ValidPassword123!',
        }),
      });

      assert.equal(regRes.status, 201);
      const regBody = await regRes.json();
      assert.equal(regBody.success, true);
      assert.ok(regBody.data.user.id);

      const loginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'ValidPassword123!',
        }),
      });

      assert.equal(loginRes.status, 200);
      const loginBody = await loginRes.json();
      assert.equal(loginBody.success, true);
      assert.ok(loginBody.data.token);
      authToken = loginBody.data.token;
    });

    it('successfully serves profile endpoint with authenticated token', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/profile', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.profile);
    });

    it('successfully serves career roles catalog endpoint', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/careers/roles', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.roles));
      assert.ok(body.data.roles.length > 0);
    });

    it('successfully serves opportunities endpoint', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/opportunities', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data.opportunities));
    });

    it('successfully serves unified dashboard summary endpoint', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/summary', authToken);
      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.profile);
      assert.ok(body.data.nextStep);
    });
  });
});
