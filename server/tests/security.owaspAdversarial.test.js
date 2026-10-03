import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { fakePassword } from './helpers/fakeSecrets.js';
import {
  clearProfiles,
  clearUsers,
  getWithToken,
  postJson,
  postRaw,
  requestWithHeaders,
  resetRateLimiters,
  sendJsonWithToken,
  startTestServer,
} from './helpers/testServer.js';
import { User, StudentProfile } from '../src/models/index.js';

describe('OWASP & Adversarial Security Suite (Task 46)', () => {
  let server;

  before(async () => {
    server = await startTestServer({ suiteId: 'owasp' });
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await clearUsers();
    await clearProfiles();
  });

  describe('1. Prototype Pollution Defense', () => {
    it('rejects or ignores __proto__ in registration and prevents Object.prototype contamination', async () => {
      assert.equal(Object.prototype.polluted, undefined);
      assert.equal({}.polluted, undefined);

      const payload = JSON.stringify({
        name: 'Pollution Test',
        email: 'proto.test@example.com',
        password: fakePassword(),
        __proto__: { polluted: true },
      });

      const res = await postRaw(server.baseUrl, '/api/auth/register', payload);
      assert.ok([201, 400].includes(res.status));

      // Invariant: Object.prototype must remain clean
      assert.equal(Object.prototype.polluted, undefined);
      assert.equal({}.polluted, undefined);
    });

    it('rejects constructor.prototype pollution payloads on profile PATCH', async () => {
      const password = fakePassword();
      await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Profile Proto User',
        email: 'proto.profile@example.com',
        password,
      });

      const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
        email: 'proto.profile@example.com',
        password,
      });
      const token = loginRes.body.data.token;

      const rawPayload = JSON.stringify({
        career: { targetRole: 'frontend-developer' },
        constructor: {
          prototype: {
            isAdmin: true,
          },
        },
      });

      const res = await fetch(`${server.baseUrl}/api/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: rawPayload,
      });

      // Must be rejected as unrecognised profile field
      assert.equal(res.status, 400);
      assert.equal(Object.prototype.isAdmin, undefined);
      assert.equal({}.isAdmin, undefined);
    });
  });

  describe('2. Mass Assignment Defense', () => {
    it('strips role, isActive, and permissions in registration payload', async () => {
      const password = fakePassword();
      const payload = {
        name: 'Mass Assign User',
        email: 'mass.assign@example.com',
        password,
        role: 'admin',
        isActive: false,
        permissions: ['ALL_PERMISSIONS', 'SUPERADMIN'],
        __v: 42,
      };

      const res = await postJson(server.baseUrl, '/api/auth/register', payload);
      assert.equal(res.status, 201);
      assert.equal(res.body.data.user.role, 'student', 'Role must default strictly to student');

      // Verify directly in MongoDB document
      const userInDb = await User.findOne({ email: 'mass.assign@example.com' });
      assert.ok(userInDb);
      assert.equal(userInDb.role, 'student');
      assert.equal(userInDb.isActive, true);
      assert.equal(userInDb.permissions, undefined);
      assert.equal(userInDb.__v, 0);
    });

    it('rejects attempts to overwrite user ownership or escalate privileges on profile PATCH', async () => {
      const password = fakePassword();
      await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Profile Owner',
        email: 'owner@example.com',
        password,
      });

      const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
        email: 'owner@example.com',
        password,
      });
      const token = loginRes.body.data.token;

      const maliciousPatch = {
        career: { targetRole: 'backend-developer' },
        user: '60c72b2f9b1d8b001c8e4c99',
        role: 'admin',
        isSuperuser: true,
      };

      const patchRes = await sendJsonWithToken(server.baseUrl, '/api/profile', {
        method: 'PATCH',
        token,
        payload: maliciousPatch,
      });

      assert.equal(patchRes.status, 400);
      assert.equal(patchRes.body.success, false);
      assert.match(patchRes.body.message, /not a recognised profile field/i);
    });
  });

  describe('3. NoSQL Operator Injection Defense', () => {
    it('rejects MongoDB query operator objects in login credentials with 400 validation error', async () => {
      const nosqlLogin = {
        email: { $gt: '' },
        password: { $gt: '' },
      };

      const res = await postJson(server.baseUrl, '/api/auth/login', nosqlLogin);
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.errorCode, 'VALIDATION_ERROR');
    });

    it('rejects MongoDB query operator objects in registration with 400 validation error', async () => {
      const nosqlRegister = {
        name: { $ne: null },
        email: { $regex: '.*@.*' },
        password: { $gt: '' },
      };

      const res = await postJson(server.baseUrl, '/api/auth/register', nosqlRegister);
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.errorCode, 'VALIDATION_ERROR');
    });

    it('rejects or safely coerces query parameters with NoSQL injection brackets', async () => {
      const password = fakePassword();
      await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Query Injection User',
        email: 'query.inject@example.com',
        password,
      });

      const loginRes = await postJson(server.baseUrl, '/api/auth/login', {
        email: 'query.inject@example.com',
        password,
      });
      const token = loginRes.body.data.token;

      const res = await getWithToken(server.baseUrl, '/api/assessments?difficulty[$ne]=beginner', token);
      // Express parses brackets into query objects; endpoint validates string enum or safely handles it
      assert.ok([200, 400].includes(res.status));
      assert.notEqual(res.status, 500);
    });
  });

  describe('4. Header Injection & HTTP Response Splitting Defense', () => {
    it('prevents CRLF carriage-return injection in Authorization header', async () => {
      try {
        const res = await fetch(`${server.baseUrl}/api/auth/me`, {
          headers: {
            Authorization: 'Bearer valid.token.here\r\nSet-Cookie: evil=session\r\n',
          },
        });
        // If node fetch accepts the header, server must reject or sanitize without spitting header
        assert.ok([400, 401].includes(res.status));
        assert.equal(res.headers.get('set-cookie'), null);
      } catch (err) {
        // Node's native fetch / undici throws TypeError: Invalid character in header value, which is safe
        assert.match(err.message, /invalid character|header/i);
      }
    });

    it('sanitizes or rejects CRLF characters in custom tracing headers', async () => {
      try {
        const res = await fetch(`${server.baseUrl}/api/health`, {
          headers: {
            'X-Request-Id': 'req-123\r\nInjected-Header: malicious',
          },
        });
        assert.equal(res.headers.get('injected-header'), null);
      } catch (err) {
        assert.match(err.message, /invalid character|header/i);
      }
    });
  });
});
