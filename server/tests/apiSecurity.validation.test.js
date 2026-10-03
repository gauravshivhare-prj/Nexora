import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  clearUsers,
  resetRateLimiters,
  startTestServer,
} from './helpers/testServer.js';
import { fakePassword } from './helpers/fakeSecrets.js';
import { validateBody } from '../src/middleware/validateBody.js';
import { ERROR_CODES } from '../src/constants/errorCodes.js';

let server;

describe('Task 33 — API Security, Request ID Tracing, Response Timing & Validation Suite', () => {
  before(async () => {
    server = await startTestServer('apisec_t33');
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearUsers();
    resetRateLimiters();
  });

  describe('1. Request ID Middleware & Correlation Tracing', () => {
    it('generates a valid UUID for requests without an incoming X-Request-Id', async () => {
      const res = await fetch(`${server.baseUrl}/api/auth/me`);
      const reqId = res.headers.get('x-request-id');

      assert.ok(reqId, 'X-Request-Id header must be present on response');
      assert.match(
        reqId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        'Generated X-Request-Id must be a valid UUID v4',
      );
    });

    it('preserves a valid client-supplied correlation ID', async () => {
      const clientTraceId = 'client-trace-abc-12345';
      const res = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: {
          'X-Request-Id': clientTraceId,
        },
      });
      const reqId = res.headers.get('x-request-id');

      assert.equal(reqId, clientTraceId, 'Client-supplied request ID must be preserved');
    });

    it('rejects malformed client request IDs and substitutes a secure random UUID', async () => {
      const invalidIds = [
        'bad;injection=header',
        'a'.repeat(65), // > 64 chars
        'id with spaces',
        '<script>alert(1)</script>',
      ];

      for (const badId of invalidIds) {
        const res = await fetch(`${server.baseUrl}/api/auth/me`, {
          headers: {
            'X-Request-Id': badId,
          },
        });
        const reqId = res.headers.get('x-request-id');

        assert.notEqual(reqId, badId, `Malformed ID "${badId}" must be discarded`);
        assert.match(
          reqId,
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          'Must fall back to generating a valid UUID v4',
        );
      }
    });
  });

  describe('2. Response Timing & API Versioning', () => {
    it('emits X-API-Version: 1.0.0 on all responses', async () => {
      const res = await fetch(`${server.baseUrl}/api/auth/me`);
      const version = res.headers.get('x-api-version');

      assert.equal(version, '1.0.0', 'X-API-Version header must equal 1.0.0');
    });

    it('emits a high-precision X-Response-Time header on all responses', async () => {
      const res = await fetch(`${server.baseUrl}/api/auth/me`);
      const responseTime = res.headers.get('x-response-time');

      assert.ok(responseTime, 'X-Response-Time header must be present');
      assert.match(
        responseTime,
        /^\d+(\.\d+)?ms$/,
        'X-Response-Time must be formatted with numeric milliseconds (e.g. 1.5ms)',
      );
    });
  });

  describe('3. Error Envelope Tracing Propagation', () => {
    it('includes requestId in 404 Not Found error JSON payload matching response header', async () => {
      const res = await fetch(`${server.baseUrl}/api/non-existent-route-${Date.now()}`);
      assert.equal(res.status, 404);

      const headerId = res.headers.get('x-request-id');
      const body = await res.json();

      assert.equal(body.success, false);
      assert.equal(body.errorCode, ERROR_CODES.NOT_FOUND);
      assert.equal(body.requestId, headerId, 'Error body must include matching requestId');
    });

    it('includes requestId in 401 Unauthorized error JSON payload', async () => {
      const customId = 'auth-fail-trace-123';
      const res = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: { 'X-Request-Id': customId },
      });
      assert.equal(res.status, 401);

      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.errorCode, ERROR_CODES.AUTH_TOKEN_MISSING);
      assert.equal(body.requestId, customId);
    });

    it('includes requestId in 400 Bad Request registration validation error', async () => {
      const res = await fetch(`${server.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'invalid-email', password: fakePassword() }),
      });
      assert.equal(res.status, 400);

      const headerId = res.headers.get('x-request-id');
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.requestId, headerId);
    });
  });

  describe('4. Declarative Body Validation Middleware (validateBody)', () => {
    it('rejects non-object request payloads with 400 when schema defines fields', async () => {
      const schema = {
        title: { type: 'string', required: true },
      };
      const middleware = validateBody(schema);

      const req = { body: ['array', 'not', 'object'] };
      let errorThrown = null;
      await middleware(req, {}, (err) => {
        errorThrown = err;
      });

      assert.ok(errorThrown, 'Must throw error on non-object body');
      assert.equal(errorThrown.statusCode, 400);
      assert.equal(errorThrown.errorCode, ERROR_CODES.VALIDATION_ERROR);
      assert.ok(errorThrown.details.some((d) => d.field === 'body'));
    });

    it('detects missing required fields and collects all errors in a single pass', async () => {
      const schema = {
        title: { type: 'string', required: true },
        count: { type: 'number', required: true },
      };
      const middleware = validateBody(schema);

      const req = { body: {} };
      let errorThrown = null;
      await middleware(req, {}, (err) => {
        errorThrown = err;
      });

      assert.ok(errorThrown);
      assert.equal(errorThrown.statusCode, 400);
      assert.equal(errorThrown.details.length, 2);
      assert.ok(errorThrown.details.some((d) => d.field === 'title'));
      assert.ok(errorThrown.details.some((d) => d.field === 'count'));
    });

    it('rejects unknown fields when allowUnknown is false (default)', async () => {
      const schema = {
        allowedField: { type: 'string' },
      };
      const middleware = validateBody(schema);

      const req = {
        body: {
          allowedField: 'valid',
          maliciousInjection: 'unexpected',
        },
      };
      let errorThrown = null;
      await middleware(req, {}, (err) => {
        errorThrown = err;
      });

      assert.ok(errorThrown);
      assert.ok(errorThrown.details.some((d) => d.field === 'maliciousInjection'));
    });

    it('permits unknown fields when allowUnknown is explicitly true', async () => {
      const schema = {
        allowedField: { type: 'string' },
      };
      const middleware = validateBody(schema, { allowUnknown: true });

      const req = {
        body: {
          allowedField: 'valid',
          extraInfo: 'allowed',
        },
      };
      let errorThrown = null;
      let nextCalled = false;
      await middleware(req, {}, (err) => {
        if (err) errorThrown = err;
        else nextCalled = true;
      });

      assert.equal(errorThrown, null);
      assert.equal(nextCalled, true);
    });

    it('validates types, string length bounds, enums, and custom validators', async () => {
      const schema = {
        role: { type: 'string', enum: ['student', 'admin', 'instructor'] },
        age: { type: 'number' },
        bio: { type: 'string', minLength: 5, maxLength: 50 },
        customCode: {
          custom: (val) => (val === 'VALID_CODE' ? true : 'Invalid access code supplied'),
        },
      };
      const middleware = validateBody(schema);

      // Case A: Multiple violations
      const badReq = {
        body: {
          role: 'superuser',
          age: 'not-a-number',
          bio: 'hi',
          customCode: 'WRONG_CODE',
        },
      };
      let errorThrown = null;
      await middleware(badReq, {}, (err) => {
        errorThrown = err;
      });

      assert.ok(errorThrown);
      assert.equal(errorThrown.details.length, 4);
      assert.ok(errorThrown.details.some((d) => d.field === 'role' && d.message.includes('one of')));
      assert.ok(errorThrown.details.some((d) => d.field === 'age' && d.message.includes('number')));
      assert.ok(errorThrown.details.some((d) => d.field === 'bio' && d.message.includes('at least 5')));
      assert.ok(errorThrown.details.some((d) => d.field === 'customCode' && d.message.includes('Invalid access code')));

      // Case B: Fully valid
      const goodReq = {
        body: {
          role: 'admin',
          age: 25,
          bio: 'Hello world, this is a valid bio.',
          customCode: 'VALID_CODE',
        },
      };
      let goodError = null;
      let goodNext = false;
      await middleware(goodReq, {}, (err) => {
        if (err) goodError = err;
        else goodNext = true;
      });

      assert.equal(goodError, null);
      assert.equal(goodNext, true);
    });
  });

  describe('5. CORS and Security Headers Configuration', () => {
    it('exposes X-Request-Id, X-Response-Time, and X-API-Version in Access-Control-Expose-Headers on preflight', async () => {
      const res = await fetch(`${server.baseUrl}/api/auth/me`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'X-Request-Id, Content-Type',
        },
      });

      const exposedHeaders = res.headers.get('access-control-expose-headers') || '';
      assert.ok(
        exposedHeaders.includes('X-Request-Id') || exposedHeaders.includes('x-request-id'),
        'CORS must expose X-Request-Id header',
      );
      assert.ok(
        exposedHeaders.includes('X-Response-Time') || exposedHeaders.includes('x-response-time'),
        'CORS must expose X-Response-Time header',
      );
      assert.ok(
        exposedHeaders.includes('X-API-Version') || exposedHeaders.includes('x-api-version'),
        'CORS must expose X-API-Version header',
      );
    });
  });
});
