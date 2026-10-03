import { getAiProviderHealth } from '../services/ai/aiProvider.js';

/**
 * Task 49 — Lightweight In-Memory Metrics & Observability Collector
 *
 * Tracks:
 * - Request counts: total, active, by HTTP method, by status class (2xx, 3xx, 4xx, 5xx)
 * - Latency percentiles: p50, p90, p95, p99, mean, min, max via rolling sample buffer
 * - Error rate & error counts (client 4xx vs server 5xx)
 * - Node process memory & uptime
 * - Integrated AI circuit breaker telemetry
 *
 * Designed with zero external dependencies and near-zero CPU/memory overhead.
 */

const MAX_LATENCY_SAMPLES = 1000;

class MetricsCollector {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalRequests = 0;
    this.activeRequests = 0;
    this.requestsByMethod = { GET: 0, POST: 0, PATCH: 0, PUT: 0, DELETE: 0, OPTIONS: 0, HEAD: 0 };
    this.requestsByStatusClass = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    this.requestsByStatusCode = {};
    this.latencySamples = [];
    this.totalLatencyMs = 0;
    this.maxLatencyMs = 0;
    this.minLatencyMs = Infinity;
  }

  recordRequest(method) {
    this.activeRequests += 1;
    const upperMethod = (method || 'UNKNOWN').toUpperCase();
    this.requestsByMethod[upperMethod] = (this.requestsByMethod[upperMethod] || 0) + 1;
  }

  recordResponse(statusCode, durationMs) {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.totalRequests += 1;

    // Status tracking
    const status = Number(statusCode) || 500;
    this.requestsByStatusCode[status] = (this.requestsByStatusCode[status] || 0) + 1;

    if (status >= 200 && status < 300) {
      this.requestsByStatusClass['2xx'] += 1;
    } else if (status >= 300 && status < 400) {
      this.requestsByStatusClass['3xx'] += 1;
    } else if (status >= 400 && status < 500) {
      this.requestsByStatusClass['4xx'] += 1;
    } else if (status >= 500) {
      this.requestsByStatusClass['5xx'] += 1;
    }

    // Latency tracking
    const roundedDuration = Number(durationMs.toFixed(2));
    this.totalLatencyMs += roundedDuration;
    if (roundedDuration > this.maxLatencyMs) this.maxLatencyMs = roundedDuration;
    if (roundedDuration < this.minLatencyMs) this.minLatencyMs = roundedDuration;

    if (this.latencySamples.length >= MAX_LATENCY_SAMPLES) {
      this.latencySamples.shift();
    }
    this.latencySamples.push(roundedDuration);
  }

  getPercentile(sorted, percentile) {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
  }

  getSummary() {
    const sortedLatencies = [...this.latencySamples].sort((a, b) => a - b);
    const samplesCount = sortedLatencies.length;
    const meanLatency = samplesCount > 0 ? Number((this.totalLatencyMs / this.totalRequests).toFixed(2)) : 0;
    const minLatency = this.minLatencyMs === Infinity ? 0 : this.minLatencyMs;

    const totalErrors = this.requestsByStatusClass['4xx'] + this.requestsByStatusClass['5xx'];
    const errorRate = this.totalRequests > 0
      ? Number(((totalErrors / this.totalRequests) * 100).toFixed(2))
      : 0;

    const mem = process.memoryUsage();
    const toMb = (bytes) => Number((bytes / (1024 * 1024)).toFixed(2));

    let aiHealth = null;
    try {
      aiHealth = getAiProviderHealth();
    } catch {
      // Non-blocking
    }

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      requests: {
        total: this.totalRequests,
        active: this.activeRequests,
        byMethod: { ...this.requestsByMethod },
        byStatusClass: { ...this.requestsByStatusClass },
        byStatusCode: { ...this.requestsByStatusCode },
      },
      latencyMs: {
        samplesRecorded: samplesCount,
        min: minLatency,
        max: this.maxLatencyMs,
        mean: meanLatency,
        p50: this.getPercentile(sortedLatencies, 50),
        p90: this.getPercentile(sortedLatencies, 90),
        p95: this.getPercentile(sortedLatencies, 95),
        p99: this.getPercentile(sortedLatencies, 99),
      },
      errors: {
        clientErrors4xx: this.requestsByStatusClass['4xx'],
        serverErrors5xx: this.requestsByStatusClass['5xx'],
        totalErrors,
        errorRatePercent: errorRate,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        memoryUsageMb: {
          rss: toMb(mem.rss),
          heapTotal: toMb(mem.heapTotal),
          heapUsed: toMb(mem.heapUsed),
          external: toMb(mem.external),
        },
      },
      ai: aiHealth,
    };
  }
}

export const metricsCollector = new MetricsCollector();

/**
 * Express middleware that measures request duration and updates metrics counters.
 */
export function metricsMiddleware(req, res, next) {
  metricsCollector.recordRequest(req.method);
  const startHrTime = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedHrTime = process.hrtime.bigint() - startHrTime;
    const durationMs = Number(elapsedHrTime) / 1e6;
    metricsCollector.recordResponse(res.statusCode, durationMs);
  });

  next();
}
