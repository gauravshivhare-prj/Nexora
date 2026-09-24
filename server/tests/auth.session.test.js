import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { env } from '../src/config/env.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';
import {
  clearUsers,
  getWithToken,
  postJson,
  postRaw,
  requestWithHeaders,
  resetRateLimiters,
  startTestServer,
} from './helpers/testServer.js';

const ACCOUNT = {
  name: 'Gaurav Shivhare',
  email: 'gaurav@example.com',
  password: 'Str0ngPassphrase',
};

/** Claims a token must carry to be accepted by the API. */
const TOKEN_CLAIMS = { issuer: 'nexora-api', audience: 'nexora-client' };

/** Asserts a response is the single, indistinguishable login failure. */
function assertInvalidCredentials(response) {
  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.errorCode, ERROR_CODES.INVALID_CREDENTIALS);
  assert.equal(response.body.message, 'Invalid email or password.');
}

describe('authentication session', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await clearUsers();
    await postJson(server.baseUrl, '/api/auth/register', ACCOUNT);
  });

  /** Logs in and returns the issued token. */
  async function login(overrides = {}) {
    return postJson(server.baseUrl, '/api/auth/login', {
      email: ACCOUNT.email,
      password: ACCOUNT.password,
      ...overrides,
    });
  }

  async function tokenFor() {
    const { body } = await login();
    return body.data.token;
  }

  // ---------------------------------------------------------------- login

  describe('POST /api/auth/login', () => {
    it('accepts valid credentials and returns a user and token', async () => {
      const { status, body } = await login();

      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.message, 'Login successful');
      assert.equal(body.data.user.email, ACCOUNT.email);
      assert.equal(body.data.user.name, ACCOUNT.name);
      assert.equal(body.data.user.role, 'student');
      assert.equal(body.data.user.isActive, true);
      assert.ok(body.data.token, 'no token issued');
      assert.equal(body.data.token.split('.').length, 3, 'not a JWS');
    });

    it('never returns the password or its hash', async () => {
      const { body } = await login();
      const serialised = JSON.stringify(body);

      assert.ok(!serialised.includes(ACCOUNT.password), 'plaintext password leaked');
      assert.ok(!serialised.includes('passwordHash'), 'passwordHash key leaked');
      assert.ok(!serialised.includes('$2b$'), 'a bcrypt hash leaked');
      assert.deepEqual(Object.keys(body.data.user).sort(), [
        'createdAt',
        'email',
        'id',
        'isActive',
        'name',
        'role',
      ]);
    });

    it('accepts a differently-cased email', async () => {
      const { status } = await login({ email: 'GAURAV@EXAMPLE.COM' });
      assert.equal(status, 200);
    });

    it('rejects a wrong password', async () => {
      assertInvalidCredentials(await login({ password: 'Wr0ngPassword' }));
    });

    it('rejects an unknown email', async () => {
      assertInvalidCredentials(await login({ email: 'nobody@example.com' }));
    });

    it('answers identically for an unknown email and a wrong password', async () => {
      // Account enumeration: the two failures must be indistinguishable.
      const unknown = await login({ email: 'nobody@example.com' });
      const wrongPassword = await login({ password: 'Wr0ngPassword' });

      assert.equal(unknown.status, wrongPassword.status);
      assert.deepEqual(unknown.body, wrongPassword.body);
    });

    it('rejects a deactivated account with the same generic failure', async () => {
      await mongoose.connection
        .collection('users')
        .updateOne({ email: ACCOUNT.email }, { $set: { isActive: false } });

      assertInvalidCredentials(await login());
    });

    it('rejects an invalid email format', async () => {
      const { status, body } = await login({ email: 'not-an-email' });

      assert.equal(status, 400);
      assert.equal(body.errorCode, ERROR_CODES.VALIDATION_ERROR);
      assert.ok(body.details.some((d) => d.field === 'email'));
    });

    it('rejects a missing password', async () => {
      const { status, body } = await postJson(server.baseUrl, '/api/auth/login', {
        email: ACCOUNT.email,
      });

      assert.equal(status, 400);
      assert.equal(body.errorCode, ERROR_CODES.VALIDATION_ERROR);
      assert.ok(body.details.some((d) => d.field === 'password'));
    });

    it('rejects a missing email', async () => {
      const { status, body } = await postJson(server.baseUrl, '/api/auth/login', {
        password: ACCOUNT.password,
      });

      assert.equal(status, 400);
      assert.ok(body.details.some((d) => d.field === 'email'));
    });

    it('rejects malformed JSON', async () => {
      const { status, body } = await postRaw(server.baseUrl, '/api/auth/login', '{"email":');

      assert.equal(status, 400);
      assert.equal(body.errorCode, ERROR_CODES.MALFORMED_REQUEST);
    });

    it('fails safely against a legacy document with no passwordHash', async () => {
      // The nexora.users collection has held documents from an unrelated
      // project, shaped { password, isVerified, credits } with no
      // passwordHash, role or isActive. Reading user.passwordHash gives
      // undefined; this proves that path is a normal 401 rather than a 500,
      // and that such a record can never be authenticated into.
      await mongoose.connection.collection('users').insertOne({
        name: 'Legacy Account',
        email: 'legacy@example.com',
        password: '$2b$10$abcdefghijklmnopqrstuvwxyz012345678901234567890123456',
        isVerified: true,
        credits: 20,
      });

      const response = await postJson(server.baseUrl, '/api/auth/login', {
        email: 'legacy@example.com',
        password: 'anything-at-all-1',
      });

      assertInvalidCredentials(response);
    });

    it('does not apply the registration password policy to login', async () => {
      // A weak password must fail as wrong credentials, not as a 400 — that
      // would disclose the policy and break pre-existing accounts.
      assertInvalidCredentials(await login({ password: 'x' }));
    });
  });

  // ------------------------------------------------------------------ jwt

  describe('token handling', () => {
    it('issues a token carrying only a subject and standard claims', async () => {
      const decoded = jwt.decode(await tokenFor(), { complete: true });

      assert.equal(decoded.header.alg, 'HS256');
      assert.deepEqual(Object.keys(decoded.payload).sort(), [
        'aud',
        'exp',
        'iat',
        'iss',
        'sub',
      ]);

      // No identity or profile data in a payload anyone can base64-decode.
      const payload = JSON.stringify(decoded.payload);
      assert.ok(!payload.includes(ACCOUNT.email));
      assert.ok(!payload.includes(ACCOUNT.name));
      assert.ok(!payload.includes(ACCOUNT.password));
      assert.ok(!payload.toLowerCase().includes('hash'));
      assert.ok(!payload.includes('student'));
    });

    it('accepts a valid token', async () => {
      const { status } = await getWithToken(server.baseUrl, '/api/auth/me', await tokenFor());
      assert.equal(status, 200);
    });

    it('rejects a malformed token', async () => {
      const { status, body } = await getWithToken(server.baseUrl, '/api/auth/me', 'not.a.jwt');

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_INVALID);
    });

    it('rejects a token signed with the wrong secret', async () => {
      const forged = jwt.sign({}, 'a-different-secret-that-is-long-enough', {
        subject: new mongoose.Types.ObjectId().toString(),
        expiresIn: '1h',
        ...TOKEN_CLAIMS,
      });

      const { status, body } = await getWithToken(server.baseUrl, '/api/auth/me', forged);

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_INVALID);
    });

    it('rejects an expired token', async () => {
      const expired = jwt.sign({}, env.jwtSecret, {
        subject: new mongoose.Types.ObjectId().toString(),
        expiresIn: '-10s',
        ...TOKEN_CLAIMS,
      });

      const { status, body } = await getWithToken(server.baseUrl, '/api/auth/me', expired);

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_EXPIRED);
      assert.equal(body.message, 'Authentication token has expired.');
    });

    it('rejects an unsigned "alg: none" token', async () => {
      // The classic JWT confusion attack: strip the signature and claim the
      // token needs none. Rejected because the algorithm is pinned.
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: new mongoose.Types.ObjectId().toString(),
          iss: 'nexora-api',
          aud: 'nexora-client',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url');

      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/auth/me',
        `${header}.${payload}.`,
      );

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_INVALID);
    });

    it('rejects a token issued for another audience', async () => {
      const foreign = jwt.sign({}, env.jwtSecret, {
        subject: new mongoose.Types.ObjectId().toString(),
        expiresIn: '1h',
        issuer: 'someone-else',
        audience: 'someone-elses-client',
      });

      const { status, body } = await getWithToken(server.baseUrl, '/api/auth/me', foreign);

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_INVALID);
    });

    it('rejects a missing Authorization header', async () => {
      const { status, body } = await requestWithHeaders(server.baseUrl, '/api/auth/me');

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
    });

    it('rejects malformed Authorization headers', async () => {
      const malformed = [
        '',
        'Bearer',
        'Bearer ',
        'sometoken',
        'Bearer a b',
      ];

      for (const authorization of malformed) {
        const { status, body } = await requestWithHeaders(server.baseUrl, '/api/auth/me', {
          headers: { Authorization: authorization },
        });

        assert.equal(status, 401, `expected 401 for "${authorization}"`);
        assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
      }
    });

    it('rejects a non-Bearer authentication scheme', async () => {
      const { status, body } = await requestWithHeaders(server.baseUrl, '/api/auth/me', {
        headers: { Authorization: 'Basic Z2F1cmF2OnBhc3N3b3Jk' },
      });

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
    });

    it('accepts a lowercase "bearer" scheme', async () => {
      // RFC 7235 makes the scheme case-insensitive.
      const { status } = await requestWithHeaders(server.baseUrl, '/api/auth/me', {
        headers: { Authorization: `bearer ${await tokenFor()}` },
      });

      assert.equal(status, 200);
    });
  });

  // ------------------------------------------------------------------- me

  describe('GET /api/auth/me', () => {
    it('returns the authenticated user', async () => {
      const { status, body } = await getWithToken(
        server.baseUrl,
        '/api/auth/me',
        await tokenFor(),
      );

      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.user.email, ACCOUNT.email);
      assert.equal(body.data.user.name, ACCOUNT.name);
    });

    it('never exposes the password hash', async () => {
      const { body } = await getWithToken(server.baseUrl, '/api/auth/me', await tokenFor());
      const serialised = JSON.stringify(body);

      assert.ok(!serialised.includes('passwordHash'));
      assert.ok(!serialised.includes('$2b$'));
      assert.ok(!serialised.includes(ACCOUNT.password));
      assert.deepEqual(Object.keys(body.data.user).sort(), [
        'createdAt',
        'email',
        'id',
        'isActive',
        'name',
        'role',
      ]);
    });

    it('rejects a token for a deleted account', async () => {
      const token = await tokenFor();
      await clearUsers();

      const { status, body } = await getWithToken(server.baseUrl, '/api/auth/me', token);

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_INVALID);
    });

    it('rejects a token for a deactivated account immediately', async () => {
      // Deactivation must take effect at once, not when the token expires.
      const token = await tokenFor();
      await mongoose.connection
        .collection('users')
        .updateOne({ email: ACCOUNT.email }, { $set: { isActive: false } });

      const { status, body } = await getWithToken(server.baseUrl, '/api/auth/me', token);

      assert.equal(status, 403);
      assert.equal(body.errorCode, ERROR_CODES.ACCOUNT_INACTIVE);
    });

    it('rejects a deactivated token on every protected route', async () => {
      const token = await tokenFor();
      await mongoose.connection
        .collection('users')
        .updateOne({ email: ACCOUNT.email }, { $set: { isActive: false } });

      const { status, body } = await getWithToken(server.baseUrl, '/api/summary', token);

      assert.equal(status, 403);
      assert.equal(body.errorCode, ERROR_CODES.ACCOUNT_INACTIVE);
    });

    it('rejects a token whose subject is not a valid id', async () => {
      const nonsense = jwt.sign({}, env.jwtSecret, {
        subject: 'not-an-object-id',
        expiresIn: '1h',
        ...TOKEN_CLAIMS,
      });

      const { status, body } = await getWithToken(server.baseUrl, '/api/auth/me', nonsense);

      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_INVALID);
    });
  });

  // --------------------------------------------------------------- logout

  describe('POST /api/auth/logout', () => {
    it('succeeds and tells the client to discard its token', async () => {
      const { status, body } = await postJson(server.baseUrl, '/api/auth/logout', {});

      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.message, 'Logout successful');
    });

    it('mutates nothing in the database', async () => {
      const before = await mongoose.connection.collection('users').findOne({ email: ACCOUNT.email });

      await postJson(server.baseUrl, '/api/auth/logout', {});

      const afterLogout = await mongoose.connection
        .collection('users')
        .findOne({ email: ACCOUNT.email });
      assert.deepEqual(afterLogout, before, 'logout changed the user document');
      assert.equal(await mongoose.connection.collection('users').countDocuments(), 1);
    });

    it('leaves an already-issued token working, since JWTs are stateless', async () => {
      // Documents the real behaviour rather than implying server-side
      // revocation that does not exist. Revocation would need a blacklist.
      const token = await tokenFor();
      await postJson(server.baseUrl, '/api/auth/logout', {});

      const { status } = await getWithToken(server.baseUrl, '/api/auth/me', token);
      assert.equal(status, 200);
    });
  });
});
