import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { User } from '../src/models/index.js';
import {
  clearUsers,
  getWithToken,
  postJson,
  resetRateLimiters,
  startTestServer,
} from './helpers/testServer.js';
import { fakePassword } from './helpers/fakeSecrets.js';
import { logger } from '../src/utils/logger.js';
import { metricsCollector } from '../src/middleware/metrics.js';

describe('TASK 49 — Production Release, Observability & Operational Readiness', () => {
  let server;
  let runCounter = 0;
  const suiteId = 'observability';

  before(async () => {
    server = await startTestServer({ suiteId });
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    resetRateLimiters();
    metricsCollector.reset();
    await clearUsers();
  });

  async function createStudent(name, email, password) {
    const regRes = await postJson(server.baseUrl, '/api/auth/register', { name, email, password });
    assert.equal(regRes.status, 201);
    const loginRes = await postJson(server.baseUrl, '/api/auth/login', { email, password });
    assert.equal(loginRes.status, 200);
    return {
      userId: loginRes.body.data.user.id,
      token: loginRes.body.data.token,
    };
  }

  async function createAdmin(name, email, password) {
    const { userId } = await createStudent(name, email, password);
    await User.updateOne({ _id: userId }, { $set: { role: 'admin' } });
    const loginRes = await postJson(server.baseUrl, '/api/auth/login', { email, password });
    assert.equal(loginRes.status, 200);
    return {
      userId,
      token: loginRes.body.data.token,
    };
  }

  describe('1. Structured JSON Logging in Production Mode', () => {
    it('outputs parseable, single-line JSON logs in production mode with PII redaction', () => {
      const originalEnv = process.env.NODE_ENV;
      const logs = [];
      const originalLog = console.log;
      const originalErr = console.error;

      try {
        process.env.NODE_ENV = 'production';
        console.log = (line) => logs.push(line);
        console.error = (line) => logs.push(line);

        logger.info('User action completed', { action: 'twin_rebuild', duration: 42 });
        logger.warn('Token provided in plain log: Bearer secretToken123456789 from test@example.com');
        logger.error('Database query timed out', new Error('Connection timeout on shard'));

        assert.equal(logs.length, 3);

        // Verify JSON parseability and structure
        const infoParsed = JSON.parse(logs[0]);
        assert.equal(infoParsed.level, 'info');
        assert.equal(infoParsed.message, 'User action completed');
        assert.equal(infoParsed.context.action, 'twin_rebuild');
        assert.ok(infoParsed.timestamp);

        const warnParsed = JSON.parse(logs[1]);
        assert.equal(warnParsed.level, 'warn');
        // Redaction verification
        assert.ok(warnParsed.message.includes('Bearer [REDACTED]'));
        assert.ok(warnParsed.message.includes('[REDACTED_EMAIL]'));
        assert.equal(warnParsed.message.includes('secretToken123456789'), false);
        assert.equal(warnParsed.message.includes('test@example.com'), false);

        const errParsed = JSON.parse(logs[2]);
        assert.equal(errParsed.level, 'error');
        assert.equal(errParsed.message, 'Database query timed out');
        assert.equal(errParsed.error.name, 'Error');
        assert.equal(errParsed.error.message, 'Connection timeout on shard');
      } finally {
        process.env.NODE_ENV = originalEnv;
        console.log = originalLog;
        console.error = originalErr;
      }
    });
  });

  describe('2. In-Memory Metrics Telemetry & Percentile Calculation', () => {
    it('computes accurate latency percentiles and request distribution', () => {
      metricsCollector.reset();

      // Simulate 100 response latencies: 1ms to 100ms
      for (let i = 1; i <= 100; i++) {
        metricsCollector.recordRequest('GET');
        metricsCollector.recordResponse(200, i);
      }

      // Add a couple of 4xx and 5xx responses
      metricsCollector.recordRequest('POST');
      metricsCollector.recordResponse(404, 25);
      metricsCollector.recordRequest('DELETE');
      metricsCollector.recordResponse(500, 150);

      const summary = metricsCollector.getSummary();

      assert.equal(summary.requests.total, 102);
      assert.equal(summary.requests.byMethod.GET, 100);
      assert.equal(summary.requests.byMethod.POST, 1);
      assert.equal(summary.requests.byMethod.DELETE, 1);
      assert.equal(summary.requests.byStatusClass['2xx'], 100);
      assert.equal(summary.requests.byStatusClass['4xx'], 1);
      assert.equal(summary.requests.byStatusClass['5xx'], 1);

      assert.equal(summary.latencyMs.p50, 50);
      assert.equal(summary.latencyMs.p90, 91);
      assert.equal(summary.latencyMs.p95, 96);
      assert.equal(summary.latencyMs.p99, 100);
      assert.equal(summary.latencyMs.max, 150);
      assert.equal(summary.latencyMs.min, 1);

      assert.equal(summary.errors.clientErrors4xx, 1);
      assert.equal(summary.errors.serverErrors5xx, 1);
      assert.ok(summary.errors.errorRatePercent > 1.9 && summary.errors.errorRatePercent < 2.0);

      assert.ok(summary.system.nodeVersion);
      assert.ok(summary.system.memoryUsageMb.heapUsed > 0);
    });
  });

  describe('3. Production Metrics API Endpoints Access Control & Privacy', () => {
    it('rejects unauthenticated requests to GET /api/health/metrics with 401', async () => {
      const res = await getWithToken(server.baseUrl, '/api/health/metrics', null);
      assert.equal(res.status, 401);
    });

    it('rejects standard student accounts from GET /api/health/metrics with 403', async () => {
      runCounter += 1;
      const studentEmail = `student.${Date.now()}.${runCounter}@example.com`;
      const { token } = await createStudent('Standard Student', studentEmail, fakePassword());

      const res = await getWithToken(server.baseUrl, '/api/health/metrics', token);
      assert.equal(res.status, 403);
    });

    it('allows admin operators to retrieve full system metrics from GET /api/health/metrics and /api/admin/metrics', async () => {
      runCounter += 1;
      const adminEmail = `admin.${Date.now()}.${runCounter}@example.com`;
      const { token } = await createAdmin('Platform Operator', adminEmail, fakePassword());

      // 1. Check GET /api/health/metrics
      const healthMetricsRes = await getWithToken(server.baseUrl, '/api/health/metrics', token);
      assert.equal(healthMetricsRes.status, 200);
      assert.equal(healthMetricsRes.headers.get('cache-control'), 'no-store');

      const data = healthMetricsRes.body.data;
      assert.ok(data.requests);
      assert.ok(data.requests.total >= 1);
      assert.ok(data.latencyMs);
      assert.ok(data.system.memoryUsageMb);
      assert.ok(data.system.nodeVersion);
      assert.ok(data.ai);

      // Verify zero sensitive data leakage in metrics
      const serialized = JSON.stringify(data);
      assert.equal(serialized.includes('password'), false);
      assert.equal(serialized.includes('secret'), false);
      assert.equal(serialized.includes('Bearer'), false);

      // 2. Check GET /api/admin/metrics
      const adminMetricsRes = await getWithToken(server.baseUrl, '/api/admin/metrics', token);
      assert.equal(adminMetricsRes.status, 200);
      assert.equal(adminMetricsRes.headers.get('cache-control'), 'no-store');
      assert.equal(adminMetricsRes.body.data.requests.total, healthMetricsRes.body.data.requests.total + 1);
    });
  });
});
