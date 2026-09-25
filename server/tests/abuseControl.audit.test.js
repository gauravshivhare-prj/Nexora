import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { signAccessToken } from '../src/utils/jwt.js';
import {
  clearResumes,
  clearUsers,
  postJson,
  resetRateLimiters,
  sendJsonWithToken,
  startTestServer,
} from './helpers/testServer.js';

describe('abuse control audit (G18)', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearUsers();
    await clearResumes();
    resetRateLimiters();
  });

  describe('auth endpoint throttling', () => {
    it('throttles registration abuse after 20 attempts with 429 and Retry-After header', async () => {
      // Send 20 register attempts (max is 20)
      for (let i = 1; i <= 20; i += 1) {
        const res = await postJson(server.baseUrl, '/api/auth/register', {
          name: `User ${i}`,
          email: `abuse.reg.${i}@example.com`,
          password: 'ValidPassword123!',
        });
        assert.equal(res.status, 201, `Attempt ${i} should succeed`);
      }

      // 21st attempt must be blocked by rate limiter
      const blockedRes = await postJson(server.baseUrl, '/api/auth/register', {
        name: 'User 21',
        email: 'abuse.reg.21@example.com',
        password: 'ValidPassword123!',
      });

      assert.equal(blockedRes.status, 429);
      assert.equal(blockedRes.body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);
      assert.ok(blockedRes.headers.get('retry-after'), 'Retry-After header must be present');
    });

    it('throttles login brute-force attacks after 30 attempts with 429', async () => {
      // Send 30 failed login attempts (max is 30)
      for (let i = 1; i <= 30; i += 1) {
        const res = await postJson(server.baseUrl, '/api/auth/login', {
          email: 'victim@example.com',
          password: `WrongPassword${i}!`,
        });
        assert.equal(res.status, 401, `Login attempt ${i} should fail auth`);
      }

      // 31st attempt must be throttled
      const blockedRes = await postJson(server.baseUrl, '/api/auth/login', {
        email: 'victim@example.com',
        password: 'AnotherWrongPassword!',
      });

      assert.equal(blockedRes.status, 429);
      assert.equal(blockedRes.body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);
      assert.ok(blockedRes.headers.get('retry-after'));
    });
  });

  describe('resource and AI abuse throttling', () => {
    it('throttles excessive resume creation requests after 30 attempts', async () => {
      const authRes = await postJson(server.baseUrl, '/api/auth/register', {
        name: 'Resume Spammer',
        email: 'spammer@example.com',
        password: 'ValidPassword123!',
      });
      const userId = authRes.body.data.user.id;
      const token = signAccessToken({ id: userId });

      // Send 30 resume creations (hit rate limiter at 31)
      for (let i = 1; i <= 30; i += 1) {
        await sendJsonWithToken(server.baseUrl, '/api/resumes', {
          method: 'POST',
          token,
          payload: {
            text: `Resume text number ${i}\nSkills: Node.js, JavaScript, Python`,
            label: `Resume ${i}`,
          },
        });
      }

      // 31st request must be throttled with 429
      const blockedRes = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
        method: 'POST',
        token,
        payload: {
          text: 'Resume text overflow\nSkills: Go, Rust',
          label: 'Resume Overflow',
        },
      });

      assert.equal(blockedRes.status, 429);
      assert.equal(blockedRes.body.errorCode, ERROR_CODES.RATE_LIMIT_EXCEEDED);
    });

    it('user-scoped limiters isolate User A from User B', async () => {
      const userARes = await postJson(server.baseUrl, '/api/auth/register', {
        name: 'User A',
        email: 'user.a@example.com',
        password: 'ValidPassword123!',
      });
      const userIdA = userARes.body.data.user.id;
      const tokenA = signAccessToken({ id: userIdA });

      const userBRes = await postJson(server.baseUrl, '/api/auth/register', {
        name: 'User B',
        email: 'user.b@example.com',
        password: 'ValidPassword123!',
      });
      const userIdB = userBRes.body.data.user.id;
      const tokenB = signAccessToken({ id: userIdB });

      // Exhaust User A's allowance (30 requests)
      for (let i = 1; i <= 30; i += 1) {
        await sendJsonWithToken(server.baseUrl, '/api/resumes', {
          method: 'POST',
          token: tokenA,
          payload: {
            text: `Resume content ${i}\nSkills: Node.js`,
            label: `Resume ${i}`,
          },
        });
      }

      const blockedResA = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
        method: 'POST',
        token: tokenA,
        payload: {
          text: 'Resume content A-overflow',
          label: 'Resume Overflow',
        },
      });
      assert.equal(blockedResA.status, 429);

      // User B should NOT be blocked by User A's exhausted quota
      const allowedResB = await sendJsonWithToken(server.baseUrl, '/api/resumes', {
        method: 'POST',
        token: tokenB,
        payload: {
          text: 'Resume content for User B\nSkills: TypeScript, React',
          label: 'Resume B',
        },
      });
      assert.equal(allowedResB.status, 201);
    });
  });
});
