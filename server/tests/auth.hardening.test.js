import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { User } from '../src/models/index.js';
import {
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  startTestServer,
} from './helpers/testServer.js';
import { fakePassword } from './helpers/fakeSecrets.js';

describe('TASK 31 — Authentication Architecture Security Hardening', () => {
  let server;
  const INITIAL_PASSWORD = fakePassword();
  const NEW_PASSWORD = fakePassword() + 'New99!';

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    await clearUsers();
  });

  async function registerAndLogin(email, password = INITIAL_PASSWORD) {
    await postJson(server.baseUrl, '/api/auth/register', {
      name: 'Auth Security Student',
      email,
      password,
    });

    const { body } = await postJson(server.baseUrl, '/api/auth/login', {
      email,
      password,
    });

    return {
      token: body.data.token,
      user: body.data.user,
    };
  }

  describe('Phase 1 — Token Refresh Endpoint (POST /api/auth/refresh)', () => {
    it('refreshes an active session token and returns fresh token with user and metadata', async () => {
      const email = 'refresh.student@nexora.test';
      const { token: originalToken } = await registerAndLogin(email);

      const { status, body } = await sendJsonWithToken(server.baseUrl, '/api/auth/refresh', {
        method: 'POST',
        token: originalToken,
      });

      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.token, 'Must return a fresh access token');
      assert.equal(body.data.user.email, email);
      assert.ok(body.data.meta.refreshedAt, 'Must include refreshedAt timestamp');

      // Fresh token works for protected resources
      const meResponse = await getWithToken(server.baseUrl, '/api/auth/me', body.data.token);
      assert.equal(meResponse.status, 200);
      assert.equal(meResponse.body.data.user.email, email);
    });

    it('rejects refresh request when Authorization token is missing', async () => {
      const { status, body } = await postJson(server.baseUrl, '/api/auth/refresh', {});
      assert.equal(status, 401);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
    });

    it('rejects refresh request when user account has been deactivated', async () => {
      const email = 'deactivated.refresh@nexora.test';
      const { token } = await registerAndLogin(email);

      await User.updateOne({ email }, { $set: { isActive: false } });

      const { status, body } = await sendJsonWithToken(server.baseUrl, '/api/auth/refresh', {
        method: 'POST',
        token,
      });

      assert.equal(status, 403);
      assert.equal(body.errorCode, ERROR_CODES.ACCOUNT_INACTIVE);
    });
  });

  describe('Phase 2 — Account-Level Brute-Force Lockout Protection', () => {
    it('locks out account after 10 failed login attempts for 30 minutes', async () => {
      const email = 'bruteforce.target@nexora.test';
      await registerAndLogin(email);

      const WRONG_PASSWORD = fakePassword() + 'Wrong!';

      // 9 failed attempts should return 401 INVALID_CREDENTIALS
      for (let i = 1; i <= 9; i++) {
        const res = await postJson(server.baseUrl, '/api/auth/login', {
          email,
          password: WRONG_PASSWORD,
        });
        assert.equal(res.status, 401);
        assert.equal(res.body.errorCode, ERROR_CODES.INVALID_CREDENTIALS);
      }

      // Check DB recorded 9 failed attempts
      const userAfter9 = await User.findOne({ email }).select('+failedLoginAttempts +lockoutUntil');
      assert.equal(userAfter9.failedLoginAttempts, 9);
      assert.equal(userAfter9.lockoutUntil, null);

      // 10th failed attempt triggers lockout
      const tenthRes = await postJson(server.baseUrl, '/api/auth/login', {
        email,
        password: WRONG_PASSWORD,
      });
      assert.equal(tenthRes.status, 401);

      const lockedUser = await User.findOne({ email }).select('+failedLoginAttempts +lockoutUntil');
      assert.equal(lockedUser.failedLoginAttempts, 10);
      assert.ok(lockedUser.lockoutUntil instanceof Date);
      assert.ok(lockedUser.lockoutUntil.getTime() > Date.now());

      // 11th attempt (even with CORRECT password) is locked out with 429 and ACCOUNT_LOCKED
      const lockedRes = await postJson(server.baseUrl, '/api/auth/login', {
        email,
        password: INITIAL_PASSWORD,
      });
      assert.equal(lockedRes.status, 429);
      assert.equal(lockedRes.body.errorCode, ERROR_CODES.ACCOUNT_LOCKED);
      assert.ok(lockedRes.body.message.includes('locked'));
    });

    it('resets failed login attempts counter upon successful login', async () => {
      const email = 'counter.reset@nexora.test';
      await registerAndLogin(email);

      const WRONG_PASSWORD = fakePassword() + 'Wrong!';

      // 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await postJson(server.baseUrl, '/api/auth/login', {
          email,
          password: WRONG_PASSWORD,
        });
      }

      const userBefore = await User.findOne({ email }).select('+failedLoginAttempts');
      assert.equal(userBefore.failedLoginAttempts, 3);

      // Successful login resets counter
      const successLogin = await postJson(server.baseUrl, '/api/auth/login', {
        email,
        password: INITIAL_PASSWORD,
      });
      assert.equal(successLogin.status, 200);

      const userAfter = await User.findOne({ email }).select('+failedLoginAttempts +lockoutUntil');
      assert.equal(userAfter.failedLoginAttempts, 0);
      assert.equal(userAfter.lockoutUntil, null);
    });
  });

  describe('Phase 3 — Password Change Endpoint (POST /api/auth/change-password)', () => {
    it('successfully changes password and allows login with new password', async () => {
      const email = 'password.change@nexora.test';
      const { token } = await registerAndLogin(email);

      const { status, body } = await sendJsonWithToken(
        server.baseUrl,
        '/api/auth/change-password',
        {
          method: 'POST',
          token,
          payload: {
            currentPassword: INITIAL_PASSWORD,
            newPassword: NEW_PASSWORD,
          },
        },
      );

      assert.equal(status, 200);
      assert.equal(body.success, true);
      assert.equal(body.message, 'Password changed successfully.');

      // Old password no longer works
      const oldLogin = await postJson(server.baseUrl, '/api/auth/login', {
        email,
        password: INITIAL_PASSWORD,
      });
      assert.equal(oldLogin.status, 401);

      // New password works
      const newLogin = await postJson(server.baseUrl, '/api/auth/login', {
        email,
        password: NEW_PASSWORD,
      });
      assert.equal(newLogin.status, 200);
      assert.ok(newLogin.body.data.token);
    });

    it('rejects password change when current password is wrong', async () => {
      const email = 'wrong.current@nexora.test';
      const { token } = await registerAndLogin(email);

      const { status, body } = await sendJsonWithToken(
        server.baseUrl,
        '/api/auth/change-password',
        {
          method: 'POST',
          token,
          payload: {
            currentPassword: fakePassword() + 'Incorrect!',
            newPassword: NEW_PASSWORD,
          },
        },
      );

      assert.equal(status, 400);
      assert.equal(body.errorCode, ERROR_CODES.INVALID_CREDENTIALS);
    });

    it('rejects password change when new password is identical to current password', async () => {
      const email = 'identical.password@nexora.test';
      const { token } = await registerAndLogin(email);

      const { status, body } = await sendJsonWithToken(
        server.baseUrl,
        '/api/auth/change-password',
        {
          method: 'POST',
          token,
          payload: {
            currentPassword: INITIAL_PASSWORD,
            newPassword: INITIAL_PASSWORD,
          },
        },
      );

      assert.equal(status, 400);
      assert.equal(body.errorCode, ERROR_CODES.CREDENTIAL_SAME_AS_CURRENT);
    });

    it('rejects password change when new password does not meet complexity requirements', async () => {
      const email = 'weak.password@nexora.test';
      const { token } = await registerAndLogin(email);

      const { status, body } = await sendJsonWithToken(
        server.baseUrl,
        '/api/auth/change-password',
        {
          method: 'POST',
          token,
          payload: {
            currentPassword: INITIAL_PASSWORD,
            newPassword: 'short', // Too short, fails minLength
          },
        },
      );

      assert.equal(status, 400);
      assert.equal(body.errorCode, ERROR_CODES.VALIDATION_ERROR);
    });
  });
});
