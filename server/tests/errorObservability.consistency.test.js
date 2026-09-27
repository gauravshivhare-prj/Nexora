import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import mongoose from 'mongoose';

import { ERROR_CODES } from '../src/constants/errorCodes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { ApiError } from '../src/utils/ApiError.js';
import { logger } from '../src/utils/logger.js';

describe('error and observability consistency (G20)', () => {
  function createMockResponse() {
    const res = {
      statusCode: null,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      set(key, val) {
        this.headers[key] = val;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };
    return res;
  }

  describe('errorHandler translation', () => {
    it('normalises ApiError into consistent client response envelope', () => {
      const err = ApiError.notFound('Resource not found', ERROR_CODES.NOT_FOUND);
      const req = { method: 'GET', originalUrl: '/api/test' };
      const res = createMockResponse();

      errorHandler(err, req, res, () => {});

      assert.equal(res.statusCode, 404);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, 'Resource not found');
      assert.equal(res.body.errorCode, ERROR_CODES.NOT_FOUND);
    });

    it('translates duplicate key (11000) into 409 CONFLICT', () => {
      const err = new Error('E11000 duplicate key error');
      err.code = 11000;
      const req = { method: 'POST', originalUrl: '/api/test' };
      const res = createMockResponse();

      errorHandler(err, req, res, () => {});

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.errorCode, ERROR_CODES.CONFLICT);
      assert.doesNotMatch(res.body.message, /E11000/);
    });

    it('translates malformed JSON SyntaxError into 400 MALFORMED_REQUEST', () => {
      const err = new SyntaxError('Unexpected token in JSON');
      err.status = 400;
      err.body = '{ bad json }';
      const req = { method: 'POST', originalUrl: '/api/test' };
      const res = createMockResponse();

      errorHandler(err, req, res, () => {});

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.errorCode, ERROR_CODES.MALFORMED_REQUEST);
    });

    it('translates generic Mongo connection failure into 503 DATABASE_ERROR', () => {
      const err = new Error('Server selection timed out');
      err.name = 'MongoNetworkError';
      const req = { method: 'GET', originalUrl: '/api/test' };
      const res = createMockResponse();

      errorHandler(err, req, res, () => {});

      assert.equal(res.statusCode, 503);
      assert.equal(res.body.errorCode, ERROR_CODES.DATABASE_ERROR);
      assert.match(res.body.message, /Database is currently unavailable/);
    });

    it('attaches Retry-After header on 429 rate limit errors', () => {
      const err = ApiError.tooManyRequests('Too many requests');
      err.retryAfter = 60;
      const req = { method: 'POST', originalUrl: '/api/test' };
      const res = createMockResponse();

      errorHandler(err, req, res, () => {});

      assert.equal(res.statusCode, 429);
      assert.equal(res.headers['Retry-After'], '60');
    });

    it('sanitizes sensitive query params in error handler log output', () => {
      const captured = [];
      const origWarn = logger.warn;
      logger.warn = (msg) => captured.push(msg);

      try {
        const err = ApiError.badRequest('Invalid params');
        const req = {
          method: 'GET',
          originalUrl: '/api/test?token=SECRET_BEARER_TOKEN&key=SECRET_API_KEY&safe=123',
        };
        const res = createMockResponse();

        errorHandler(err, req, res, () => {});

        assert.equal(captured.length, 1);
        assert.doesNotMatch(captured[0], /SECRET_BEARER_TOKEN/);
        assert.doesNotMatch(captured[0], /SECRET_API_KEY/);
        assert.match(captured[0], /\[REDACTED\]/);
      } finally {
        logger.warn = origWarn;
      }
    });
  });

  describe('logger secret scrubbing', () => {
    it('automatically redacts sensitive keys in log metadata', () => {
      const logs = [];
      const origInfo = console.log;
      console.log = (line, meta) => logs.push({ line, meta });

      try {
        logger.info('User authenticated', {
          userId: 'user-123',
          password: 'TopSecretPassword!',
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token',
          apiKey: 'AIzaSySecretApiKey',
          nested: {
            secret: 'ConfidentialSecret',
            authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.safe',
            publicInfo: 'harmless',
          },
        });

        assert.equal(logs.length, 1);
        const loggedMeta = logs[0].meta;
        assert.equal(loggedMeta.password, '[REDACTED]');
        assert.equal(loggedMeta.token, '[REDACTED]');
        assert.equal(loggedMeta.apiKey, '[REDACTED]');
        assert.equal(loggedMeta.nested.secret, '[REDACTED]');
        assert.equal(loggedMeta.nested.authorization, '[REDACTED]');
        assert.equal(loggedMeta.nested.publicInfo, 'harmless');
      } finally {
        console.log = origInfo;
      }
    });
  });
});
