#!/usr/bin/env node

/**
 * Lightweight HTTP load test script using Node.js native fetch / http.
 *
 * Usage:
 *   node scripts/load-test.mjs [url] [concurrency] [totalRequests]
 *
 * Example:
 *   node scripts/load-test.mjs http://localhost:5000/api/health 10 100
 */

export async function runLoadTest({
  url = 'http://localhost:5000/api/health',
  concurrency = 10,
  totalRequests = 100,
  headers = {},
} = {}) {
  const latencies = [];
  let successful = 0;
  let failed = 0;
  let requestsDispatched = 0;

  const startTime = Date.now();

  async function worker() {
    while (true) {
      if (requestsDispatched >= totalRequests) {
        return;
      }
      requestsDispatched += 1;

      const reqStart = Date.now();
      try {
        const res = await fetch(url, { method: 'GET', headers });
        await res.text();
        const duration = Date.now() - reqStart;
        latencies.push(duration);

        if (res.status >= 200 && res.status < 400) {
          successful += 1;
        } else {
          failed += 1;
        }
      } catch {
        const duration = Date.now() - reqStart;
        latencies.push(duration);
        failed += 1;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const totalTimeMs = Math.max(1, Date.now() - startTime);
  const throughput = (totalRequests / (totalTimeMs / 1000)).toFixed(2);

  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((acc, val) => acc + val, 0);
  const avg = (sum / latencies.length).toFixed(2);
  const min = latencies[0] ?? 0;
  const max = latencies[latencies.length - 1] ?? 0;
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p90 = latencies[Math.floor(latencies.length * 0.9)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;

  return {
    url,
    totalRequests,
    concurrency,
    successful,
    failed,
    totalTimeMs,
    throughputReqSec: Number(throughput),
    latencyMs: {
      min,
      max,
      avg: Number(avg),
      p50,
      p90,
      p95,
      p99,
    },
  };
}

// If executed directly from command line
if (process.argv[1]?.endsWith('load-test.mjs')) {
  const url = process.argv[2] || 'http://localhost:5000/api/health';
  const concurrency = Number.parseInt(process.argv[3] || '10', 10);
  const totalRequests = Number.parseInt(process.argv[4] || '100', 10);

  console.log(`Starting load test against ${url} with concurrency ${concurrency} and ${totalRequests} total requests...`);

  runLoadTest({ url, concurrency, totalRequests })
    .then((results) => {
      console.log('\n--- Load Test Results ---');
      console.log(`Target URL:       ${results.url}`);
      console.log(`Total Requests:   ${results.totalRequests}`);
      console.log(`Concurrency:      ${results.concurrency}`);
      console.log(`Successful:       ${results.successful}`);
      console.log(`Failed:           ${results.failed}`);
      console.log(`Total Duration:   ${results.totalTimeMs}ms`);
      console.log(`Throughput:       ${results.throughputReqSec} req/sec`);
      console.log('\nLatency Distribution:');
      console.log(`  Min:  ${results.latencyMs.min}ms`);
      console.log(`  Avg:  ${results.latencyMs.avg}ms`);
      console.log(`  P50:  ${results.latencyMs.p50}ms`);
      console.log(`  P90:  ${results.latencyMs.p90}ms`);
      console.log(`  P95:  ${results.latencyMs.p95}ms`);
      console.log(`  P99:  ${results.latencyMs.p99}ms`);
      console.log(`  Max:  ${results.latencyMs.max}ms`);
      console.log('-------------------------\n');
    })
    .catch((err) => {
      console.error('Load test error:', err);
      process.exit(1);
    });
}
