import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { env } from '../src/config/env.js';
import { CONNECTION_OPTIONS } from '../src/config/database.js';
import { runLoadTest } from '../../scripts/load-test.mjs';
import { startTestServer } from './helpers/testServer.js';

let server;

describe('Task 43 — Scalability Architecture & Load Testing Suite', () => {
  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  describe('1. Connection Pool Configuration', () => {
    it('exposes configurable MongoDB connection pool sizes in env', () => {
      assert.ok(typeof env.mongodbPoolSize === 'number');
      assert.ok(env.mongodbPoolSize >= 1);
      assert.ok(typeof env.mongodbMinPoolSize === 'number');
      assert.ok(env.mongodbMinPoolSize >= 1);
      assert.ok(env.mongodbPoolSize >= env.mongodbMinPoolSize);
    });

    it('injects maxPoolSize and minPoolSize into CONNECTION_OPTIONS', () => {
      assert.equal(CONNECTION_OPTIONS.maxPoolSize, env.mongodbPoolSize);
      assert.equal(CONNECTION_OPTIONS.minPoolSize, env.mongodbMinPoolSize);
      assert.equal(CONNECTION_OPTIONS.serverSelectionTimeoutMS, 5000);
    });
  });

  describe('2. Load Test Runner (scripts/load-test.mjs)', () => {
    it('executes concurrent load test against test server and produces valid metrics', async () => {
      const results = await runLoadTest({
        url: `${server.baseUrl}/api/health`,
        concurrency: 5,
        totalRequests: 25,
      });

      assert.equal(results.totalRequests, 25);
      assert.equal(results.concurrency, 5);
      assert.equal(results.successful, 25);
      assert.equal(results.failed, 0);
      assert.ok(results.totalTimeMs > 0);
      assert.ok(results.throughputReqSec > 0);

      const { latencyMs } = results;
      assert.ok(typeof latencyMs.min === 'number');
      assert.ok(typeof latencyMs.avg === 'number');
      assert.ok(typeof latencyMs.p50 === 'number');
      assert.ok(typeof latencyMs.p95 === 'number');
      assert.ok(typeof latencyMs.max === 'number');
      assert.ok(latencyMs.min <= latencyMs.max);
      assert.ok(latencyMs.p50 <= latencyMs.p95);
      assert.ok(latencyMs.p95 <= latencyMs.max);
    });
  });
});
