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
});