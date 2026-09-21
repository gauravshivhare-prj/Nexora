import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { RATE_LIMIT_POLICY } from '../src/constants/authPolicy.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  clearUsers,
  postJson,
  resetRateLimiters,
  startTestServer,
} from './helpers/testServer.js';

const ACCOUNT = {
  name: 'Gaurav Shivhare',
  email: 'gaurav@example.com',
  password: 'Str0ngPassphrase',
};

const LOGIN_PAYLOAD = { email: ACCOUNT.email, password: ACCOUNT.password };
const WRONG_LOGIN = { email: ACCOUNT.email, password: 'Wr0ngGuess9' };

/**
 * Fires `count` sequential POSTs to `path` and returns every response.
 * Sequential rather than concurrent: the rate limiter records timestamps, so
 * parallel requests could arrive in unpredictable order and make assertions
 * fragile.
 */
async function fireRequests(baseUrl, path, payload, count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(await postJson(baseUrl, path, payload));
  }
  return results;
}

/**
 * Ensures a test account exists and rate limiters are clean.
 * Isolates tests so each one starts from a known state regardless
 * of how many requests the previous test made.
 */
async function ensureFreshAccount(baseUrl) {
  resetRateLimiters();
  await clearUsers();
  const { status } = await postJson(baseUrl, '/api/auth/register', ACCOUNT);
  assert.equal(status, 201, 'beforeEach: registration must succeed');
  resetRateLimiters();
}

describe('authentication rate limiting', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await ensureFreshAccount(server.baseUrl);
  });

  // --------------------------------------------------------- login limiting

  describe('POST /api/auth/login — rate limit', () => {
    it(`allows ${RATE_LIMIT_POLICY.login.maxAttempts} requests within the window`, async () => {
      const results = await fireRequests(
        server.baseUrl,
        '/api/auth/login',
        LOGIN_PAYLOAD,
        RATE_LIMIT_POLICY.login.maxAttempts,
      );

      // Every request should succeed (200) or be a credential rejection (401),
      // but never 429.
      for (const r of results) {
        assert.notEqual(r.status, 429, `got 429 on request #${results.indexOf(r) + 1}`);
      }
    });

    it('returns 429 after exceeding the login limit', async () => {
      // Exhaust the window.
      await fireRequests(
        server.baseUrl,
        '/api/auth/login',
        LOGIN_PAYLOAD,
        RATE_LIMIT_POLICY.login.maxAttempts,
      );

      // Next request should be rejected.
      const { status, headers, body } = await postJson(
        server.baseUrl,
        '/api/auth/login',
        LOGIN_PAYLOAD,
      );

      assert.equal(status, 429);
      assert.equal(body.success, false);
      assert.equal(body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);
      assert.equal(body.message, 'Too many requests. Please try again later.');

      // Retry-After header must be present and be a positive integer.
      const retryAfter = headers.get('retry-after');
      assert.ok(retryAfter, 'Retry-After header is missing');
      const retrySeconds = Number(retryAfter);
      assert.ok(Number.isInteger(retrySeconds) && retrySeconds > 0, `bad Retry-After: ${retryAfter}`);
    });

    it('does not leak passwords, tokens or hashes in a 429 response', async () => {
      await fireRequests(
        server.baseUrl,
        '/api/auth/login',
        WRONG_LOGIN,
        RATE_LIMIT_POLICY.login.maxAttempts,
      );

      const { body } = await postJson(server.baseUrl, '/api/auth/login', WRONG_LOGIN);
      const serialised = JSON.stringify(body);

      assert.ok(!serialised.includes(WRONG_LOGIN.password), 'password leaked in 429');
      assert.ok(!serialised.includes('$2'), 'bcrypt hash leaked in 429');
      assert.ok(!serialised.includes('token'), 'token reference leaked in 429');
    });

    it('counts wrong-password attempts toward the limit', async () => {
      // A brute-force attack sends wrong passwords, so those must be counted.
      await fireRequests(
        server.baseUrl,
        '/api/auth/login',
        WRONG_LOGIN,
        RATE_LIMIT_POLICY.login.maxAttempts,
      );

      const { status } = await postJson(server.baseUrl, '/api/auth/login', LOGIN_PAYLOAD);
      assert.equal(status, 429);
    });

    it('recovers after resetting the window', async () => {
      await fireRequests(
        server.baseUrl,
        '/api/auth/login',
        LOGIN_PAYLOAD,
        RATE_LIMIT_POLICY.login.maxAttempts,
      );

      // Verify it's blocked.
      const blocked = await postJson(server.baseUrl, '/api/auth/login', LOGIN_PAYLOAD);
      assert.equal(blocked.status, 429);

      // Simulate window expiry by resetting the limiter and ensuring a
      // fresh account so the assertion tests the *limiter*, not DB state
      // after a heavy request chain.
      await ensureFreshAccount(server.baseUrl);

      // Requests should succeed again.
      const recovered = await postJson(server.baseUrl, '/api/auth/login', LOGIN_PAYLOAD);
      assert.notEqual(recovered.status, 429, 'still rate-limited after window reset');
      assert.equal(recovered.status, 200);
    });
  });

  // ------------------------------------------------------ register limiting

  describe('POST /api/auth/register — rate limit', () => {
    it(`allows ${RATE_LIMIT_POLICY.register.maxAttempts} requests within the window`, async () => {
      const results = [];
      for (let i = 0; i < RATE_LIMIT_POLICY.register.maxAttempts; i++) {
        results.push(
          await postJson(server.baseUrl, '/api/auth/register', {
            ...ACCOUNT,
            email: `user${i}@example.com`,
          }),
        );
      }

      for (const r of results) {
        assert.notEqual(r.status, 429, `got 429 on request #${results.indexOf(r) + 1}`);
      }
    });

    it('returns 429 after exceeding the register limit', async () => {
      // Exhaust the window. Some will succeed, later ones will 409 (duplicate),
      // but none should be 429 yet.
      for (let i = 0; i < RATE_LIMIT_POLICY.register.maxAttempts; i++) {
        await postJson(server.baseUrl, '/api/auth/register', {
          ...ACCOUNT,
          email: `spammer${i}@example.com`,
        });
      }

      // Next request must be blocked.
      const { status, headers, body } = await postJson(
        server.baseUrl,
        '/api/auth/register',
        { ...ACCOUNT, email: 'onemore@example.com' },
      );

      assert.equal(status, 429);
      assert.equal(body.success, false);
      assert.equal(body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);

      const retryAfter = headers.get('retry-after');
      assert.ok(retryAfter, 'Retry-After header is missing');
    });

    it('does not leak passwords or hashes in a 429 response', async () => {
      for (let i = 0; i < RATE_LIMIT_POLICY.register.maxAttempts; i++) {
        await postJson(server.baseUrl, '/api/auth/register', {
          ...ACCOUNT,
          email: `leak${i}@example.com`,
        });
      }

      const { body } = await postJson(server.baseUrl, '/api/auth/register', ACCOUNT);
      const serialised = JSON.stringify(body);

      assert.ok(!serialised.includes(ACCOUNT.password), 'password leaked');
      assert.ok(!serialised.includes('$2'), 'bcrypt hash leaked');
    });

    it('recovers after resetting the window', async () => {
      for (let i = 0; i < RATE_LIMIT_POLICY.register.maxAttempts; i++) {
        await postJson(server.baseUrl, '/api/auth/register', {
          ...ACCOUNT,
          email: `fill${i}@example.com`,
        });
      }

      const blocked = await postJson(server.baseUrl, '/api/auth/register', {
        ...ACCOUNT,
        email: 'blocked@example.com',
      });
      assert.equal(blocked.status, 429);

      resetRateLimiters();
      await clearUsers();

      const recovered = await postJson(server.baseUrl, '/api/auth/register', {
        ...ACCOUNT,
        email: 'recovered@example.com',
      });
      assert.notEqual(recovered.status, 429, 'still rate-limited after window reset');
      assert.equal(recovered.status, 201);
    });
  });

  // --------------------------------------------- cross-limiter independence

  describe('limiter independence', () => {
    it('login and register limiters do not interfere with each other', async () => {
      // Exhaust the register limiter.
      for (let i = 0; i < RATE_LIMIT_POLICY.register.maxAttempts; i++) {
        await postJson(server.baseUrl, '/api/auth/register', {
          ...ACCOUNT,
          email: `cross${i}@example.com`,
        });
      }

      // Register is blocked.
      const reg = await postJson(server.baseUrl, '/api/auth/register', {
        ...ACCOUNT,
        email: 'another@example.com',
      });
      assert.equal(reg.status, 429);

      // Login must still work — different limiter.
      // The original ACCOUNT was registered in beforeEach.
      const login = await postJson(server.baseUrl, '/api/auth/login', LOGIN_PAYLOAD);
      assert.notEqual(login.status, 429, 'login should not be blocked by the register limiter');
    });
  });

  // ---------------------------------------- 429 response structure contract

  describe('429 response structure', () => {
    it('matches the standard API error envelope', async () => {
      await fireRequests(
        server.baseUrl,
        '/api/auth/login',
        LOGIN_PAYLOAD,
        RATE_LIMIT_POLICY.login.maxAttempts,
      );

      const { status, body } = await postJson(server.baseUrl, '/api/auth/login', LOGIN_PAYLOAD);

      assert.equal(status, 429);
      assert.equal(typeof body.success, 'boolean');
      assert.equal(body.success, false);
      assert.equal(typeof body.message, 'string');
      assert.equal(typeof body.errorCode, 'string');
      assert.equal(body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);

      // Must not contain fields that belong to other error types.
      assert.equal(body.details, undefined, 'should not have validation details');
    });
  });
});
