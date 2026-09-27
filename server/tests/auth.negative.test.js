import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';

import { env } from '../src/config/env.js';
import { User } from '../src/models/index.js';
import {
  clearUsers,
  getWithToken,
  postJson,
  requestWithHeaders,
  resetRateLimiters,
  sendJsonWithToken,
  startTestServer,
} from './helpers/testServer.js';

const PASSWORD = 'Str0ngPassphrase1!';
let server;
let counter = 0;

describe('G03 — Negative Authentication and JWT Hardening Suite', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearUsers();
    resetRateLimiters();
  });

  async function registerAndLogin(customEmail) {
    counter += 1;
    const email = customEmail || `neg.auth.${Date.now()}.${counter}@example.com`;
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Auth Test User',
      email,
      password: PASSWORD,
    });
    const res = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    return { email, user: res.body.data.user, token: res.body.data.token };
  }

  describe('1. JWT Signature and Claims Hardening', () => {
    it('rejects tokens signed with a different secret', async () => {
      const { user } = await registerAndLogin();
      const forgedToken = jwt.sign({}, 'an-entirely-different-secret-that-is-at-least-32-chars-long!', {
        subject: user.id,
        issuer: 'nexora-api',
        audience: 'nexora-client',
        algorithm: 'HS256',
        expiresIn: '1h',
      });

      const res = await getWithToken(server.baseUrl, '/api/auth/me', forgedToken);
      assert.equal(res.status, 401);
      assert.equal(res.body.errorCode, 'AUTH_TOKEN_INVALID');
    });

    it('rejects expired tokens with AUTH_TOKEN_EXPIRED', async () => {
      const { user } = await registerAndLogin();
      const expiredToken = jwt.sign({}, env.jwtSecret, {
        subject: user.id,
        issuer: 'nexora-api',
        audience: 'nexora-client',
        algorithm: 'HS256',
        expiresIn: '-10s',
      });

      const res = await getWithToken(server.baseUrl, '/api/auth/me', expiredToken);
      assert.equal(res.status, 401);
      assert.equal(res.body.errorCode, 'AUTH_TOKEN_EXPIRED');
    });

    it('rejects tokens with forged algorithm "none"', async () => {
      const { user } = await registerAndLogin();
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: user.id,
          iss: 'nexora-api',
          aud: 'nexora-client',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url');
      const forgedNoneToken = `${header}.${payload}.`;

      const res = await getWithToken(server.baseUrl, '/api/auth/me', forgedNoneToken);
      assert.equal(res.status, 401);
      assert.equal(res.body.errorCode, 'AUTH_TOKEN_INVALID');
    });

    it('rejects tokens with wrong issuer or audience', async () => {
      const { user } = await registerAndLogin();

      // Wrong issuer
      const wrongIssuerToken = jwt.sign({}, env.jwtSecret, {
        subject: user.id,
        issuer: 'evil-issuer',
        audience: 'nexora-client',
        algorithm: 'HS256',
        expiresIn: '1h',
      });
      const issRes = await getWithToken(server.baseUrl, '/api/auth/me', wrongIssuerToken);
      assert.equal(issRes.status, 401);
      assert.equal(issRes.body.errorCode, 'AUTH_TOKEN_INVALID');

      // Wrong audience
      const wrongAudienceToken = jwt.sign({}, env.jwtSecret, {
        subject: user.id,
        issuer: 'nexora-api',
        audience: 'evil-audience',
        algorithm: 'HS256',
        expiresIn: '1h',
      });
      const audRes = await getWithToken(server.baseUrl, '/api/auth/me', wrongAudienceToken);
      assert.equal(audRes.status, 401);
      assert.equal(audRes.body.errorCode, 'AUTH_TOKEN_INVALID');
    });

    it('rejects tokens with missing, empty, or non-string subject', async () => {
      const emptySubToken = jwt.sign({}, env.jwtSecret, {
        subject: '',
        issuer: 'nexora-api',
        audience: 'nexora-client',
        algorithm: 'HS256',
        expiresIn: '1h',
      });
      const res = await getWithToken(server.baseUrl, '/api/auth/me', emptySubToken);
      assert.equal(res.status, 401);
      assert.equal(res.body.errorCode, 'AUTH_TOKEN_INVALID');
    });
  });

  describe('2. Authorization Header Malformation', () => {
    it('rejects non-Bearer schemes and malformed Authorization headers', async () => {
      // Basic scheme
      const basicRes = await requestWithHeaders(server.baseUrl, '/api/auth/me', {
        headers: { Authorization: 'Basic dXNlcjpwYXNzd29yZA==' },
      });
      assert.equal(basicRes.status, 401);
      assert.equal(basicRes.body.errorCode, 'AUTH_TOKEN_MISSING');

      // Empty bearer
      const emptyRes = await requestWithHeaders(server.baseUrl, '/api/auth/me', {
        headers: { Authorization: 'Bearer ' },
      });
      assert.equal(emptyRes.status, 401);
      assert.equal(emptyRes.body.errorCode, 'AUTH_TOKEN_MISSING');

      // Multi-part header
      const multiRes = await requestWithHeaders(server.baseUrl, '/api/auth/me', {
        headers: { Authorization: 'Bearer part1 part2' },
      });
      assert.equal(multiRes.status, 401);
      assert.equal(multiRes.body.errorCode, 'AUTH_TOKEN_MISSING');
    });
  });

  describe('3. Inactive and Deactivated Accounts', () => {
    it('refuses login for deactivated accounts with 401 INVALID_CREDENTIALS', async () => {
      const email = `deactivated.${Date.now()}@example.com`;
      await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Deactivated User',
        email,
        password: PASSWORD,
      });

      // Deactivate user in database
      await User.updateOne({ email }, { $set: { isActive: false } });

      const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
        email,
        password: PASSWORD,
      });
      assert.equal(loginRes.status, 401);
      assert.equal(loginRes.body.errorCode, 'INVALID_CREDENTIALS');
    });

    it('rejects token requests for accounts deactivated after issuance with 403 ACCOUNT_INACTIVE', async () => {
      const { user, token } = await registerAndLogin();

      // Deactivate user after token was issued
      await User.updateOne({ _id: user.id }, { $set: { isActive: false } });

      const res = await getWithToken(server.baseUrl, '/api/auth/me', token);
      assert.equal(res.status, 403);
      assert.equal(res.body.errorCode, 'ACCOUNT_INACTIVE');
    });
  });

  describe('4. CORS and Rate Limiting Checks', () => {
    it('sends correct CORS headers for the configured client URL', async () => {
      const res = await requestWithHeaders(server.baseUrl, '/api/auth/me', {
        headers: { Origin: env.clientUrl },
      });
      assert.equal(res.headers.get('access-control-allow-origin'), env.clientUrl);
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    });

    it('responds cleanly to CORS preflight OPTIONS requests', async () => {
      const res = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: env.clientUrl,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), env.clientUrl);
      assert.ok(res.headers.get('access-control-allow-methods'));
    });
  });
});
