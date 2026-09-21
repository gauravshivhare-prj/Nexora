import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

/**
 * Creates an in-memory, per-IP sliding-window rate limiter.
 *
 * Each invocation returns a fresh Express middleware with its own request
 * store, so different endpoints can have independent limits.
 *
 * Implementation notes:
 * - Entries are stored in a plain Map keyed by IP address.
 * - Each entry is an array of request timestamps within the current window.
 * - Stale timestamps are pruned on every request, so memory stays bounded by
 *   the number of unique IPs that are actively hitting the endpoint.
 * - A periodic sweep removes entries whose entire window has expired, so IPs
 *   that stop making requests do not leak memory.
 *
 * Not suitable for horizontally scaled deployments (each process has its own
 * store). When multiple instances are needed, swap this for a Redis-backed
 * limiter — the middleware signature stays the same.
 *
 * @param {{ windowMs: number, maxAttempts: number }} options
 * @returns {function} Express middleware
 */
export function createRateLimiter({ windowMs, maxAttempts }) {
  /** @type {Map<string, number[]>} IP → array of request timestamps */
  const store = new Map();

  // Periodic sweep: every `windowMs` ms, drop entries that are entirely
  // outside the window so memory from one-off visitors is reclaimed.
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of store) {
      const fresh = timestamps.filter((t) => now - t < windowMs);
      if (fresh.length === 0) {
        store.delete(key);
      } else {
        store.set(key, fresh);
      }
    }
  }, windowMs);

  // Allow the process to exit even if the interval is still scheduled.
  if (sweepInterval.unref) sweepInterval.unref();

  /**
   * The middleware itself.
   *
   * On every request it prunes stale timestamps, checks the count, and either
   * records the new timestamp or rejects the request with 429.
   */
  function rateLimitMiddleware(req, _res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    // Prune timestamps outside the window.
    const existing = store.get(ip) || [];
    const windowStart = now - windowMs;
    const recent = existing.filter((t) => t > windowStart);

    if (recent.length >= maxAttempts) {
      // Earliest expiry: when the oldest timestamp in the window ages out.
      const oldestInWindow = Math.min(...recent);
      const retryAfterMs = oldestInWindow + windowMs - now;
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      logger.warn(
        `Rate limit exceeded: ${ip} on ${req.method} ${req.originalUrl} ` +
          `(${recent.length}/${maxAttempts} in ${windowMs / 1000}s window)`,
      );

      const error = ApiError.tooManyRequests(
        'Too many requests. Please try again later.',
      );

      // Attach retryAfter so the error handler can set the header.
      error.retryAfter = retryAfterSeconds;

      next(error);
      return;
    }

    recent.push(now);
    store.set(ip, recent);
    next();
  }

  /**
   * Clears all tracked state. Intended for tests so rate-limit counters do
   * not leak between test cases and cause flaky failures.
   */
  rateLimitMiddleware.reset = () => store.clear();

  /**
   * Stops the periodic sweep timer. Call during graceful shutdown or test
   * teardown if the interval would keep the process alive.
   */
  rateLimitMiddleware.destroy = () => clearInterval(sweepInterval);

  return rateLimitMiddleware;
}
