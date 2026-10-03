import { logger } from './logger.js';

/**
 * Checks if an error is considered transient and eligible for retry.
 *
 * @param {any} error
 * @returns {boolean}
 */
export function isTransientError(error) {
  if (!error) return false;

  // Circuit breaker open or quota exceeded should never be retried
  if (error.circuitBreakerOpen || error.errorCode === 'AI_QUOTA_EXCEEDED') {
    return false;
  }

  // 4xx client errors (bad request, validation, auth, not found) must not be retried
  if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
    return false;
  }

  // Known transient network and server error codes
  const networkCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN']);
  if (error.code && networkCodes.has(error.code)) {
    return true;
  }

  // Timeouts or AbortErrors
  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    return true;
  }

  // 5xx upstream server errors
  if (typeof error.statusCode === 'number' && error.statusCode >= 500) {
    return true;
  }

  // Operational 503 or generic upstream failures
  if (error.statusCode === 503 || error.errorCode === 'AI_PROVIDER_FAILED') {
    return true;
  }

  return false;
}

/**
 * Executes an async operation with retry and exponential/linear backoff.
 *
 * @template T
 * @param {() => Promise<T>} fn Async function to execute
 * @param {object} [options]
 * @param {number} [options.maxRetries=1] Maximum number of retry attempts (default: 1)
 * @param {number} [options.backoffMs] Backoff delay in ms (default: 10ms in test, 2000ms otherwise)
 * @param {(err: any, attempt: number) => boolean} [options.shouldRetry=isTransientError]
 * @param {(err: any, attempt: number, delayMs: number) => void} [options.onRetry]
 * @returns {Promise<T>}
 */
export async function executeWithRetry(fn, options = {}) {
  const maxRetries = options.maxRetries ?? (
    process.env.AI_MAX_RETRIES ? Number.parseInt(process.env.AI_MAX_RETRIES, 10) : 1
  );

  const defaultDelay = process.env.NODE_ENV === 'production' ? 2000 : 20;
  const initialBackoffMs = options.backoffMs ?? (
    process.env.AI_RETRY_BACKOFF_MS ? Number.parseInt(process.env.AI_RETRY_BACKOFF_MS, 10) : defaultDelay
  );

  const shouldRetry = options.shouldRetry ?? isTransientError;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > maxRetries || !shouldRetry(err, attempt)) {
        throw err;
      }

      const delayMs = initialBackoffMs * Math.pow(2, attempt - 1);
      logger.warn(`Retrying operation (attempt ${attempt}/${maxRetries}) after transient error: ${err.message ?? err}`, {
        attempt,
        maxRetries,
        delayMs,
        errorCode: err.errorCode,
        statusCode: err.statusCode,
      });

      if (typeof options.onRetry === 'function') {
        try {
          options.onRetry(err, attempt, delayMs);
        } catch {
          // ignore hook error
        }
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
