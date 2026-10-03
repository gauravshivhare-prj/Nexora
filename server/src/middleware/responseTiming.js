import { logger } from '../utils/logger.js';

export const API_VERSION = '1.0.0';

/** Threshold in milliseconds above which a request is logged as slow */
const SLOW_REQUEST_THRESHOLD_MS = 2000;

/**
 * Task 33 — Response Timing & API Versioning Middleware
 *
 * Adds `X-API-Version` and high-precision `X-Response-Time` headers to every response.
 * Detects and logs slow requests exceeding 2000ms for observability.
 */
export function responseTiming(req, res, next) {
  const start = process.hrtime.bigint();

  res.setHeader('X-API-Version', API_VERSION);

  const originalWriteHead = res.writeHead;
  res.writeHead = function (...args) {
    if (!res.headersSent) {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      res.setHeader('X-Response-Time', `${durationMs.toFixed(1)}ms`);
    }
    return originalWriteHead.apply(this, args);
  };

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
      logger.warn(
        `Slow request detected: [${req.id || 'anonymous'}] ${req.method} ${req.originalUrl} took ${durationMs.toFixed(1)}ms`,
      );
    }
  });

  next();
}
