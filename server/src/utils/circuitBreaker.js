import { ERROR_CODES } from '../constants/errorCodes.js';
import { ApiError } from './ApiError.js';
import { logger } from './logger.js';

export const CIRCUIT_STATE = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

/**
 * Standard Circuit Breaker state machine for isolating downstream/external
 * service failures (e.g., AI providers).
 *
 * States:
 * - CLOSED: Normal operations. Failures within sliding window are tracked.
 * - OPEN: Outage mode. Calls immediately fail-fast without network traffic.
 * - HALF_OPEN: Cooldown expired. Single trial request allowed to verify recovery.
 */
export class CircuitBreaker {
  /**
   * @param {object} [options]
   * @param {string} [options.name] Identifier for logging/metrics
   * @param {number} [options.failureThreshold] Failures in window to trip circuit (default: 5)
   * @param {number} [options.windowMs] Failure tracking window in ms (default: 60,000)
   * @param {number} [options.recoveryTimeoutMs] Time before trying half-open probe in ms (default: 30,000)
   * @param {(err: any) => boolean} [options.isFailure] Predicate determining if an error counts as a failure
   * @param {(from: string, to: string) => void} [options.onStateChange] State transition hook
   */
  constructor(options = {}) {
    this.name = options.name ?? 'default-circuit-breaker';
    this.failureThreshold = options.failureThreshold ?? 5;
    this.windowMs = options.windowMs ?? 60_000;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 30_000;
    this.isFailure = options.isFailure ?? ((err) => {
      // By default, 4xx validation or auth errors do not count as external service outages
      if (err?.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
        return false;
      }
      return true;
    });
    this.onStateChange = options.onStateChange ?? null;

    this._state = CIRCUIT_STATE.CLOSED;
    this._failureTimestamps = [];
    this._nextAttemptAllowedAt = 0;
    this._halfOpenInFlight = false;
  }

  getState() {
    this._pruneOldFailures();
    return {
      name: this.name,
      state: this._state,
      failureCount: this._failureTimestamps.length,
      failureThreshold: this.failureThreshold,
      nextAttemptAllowedAt: this._nextAttemptAllowedAt,
      halfOpenInFlight: this._halfOpenInFlight,
    };
  }

  isOpen() {
    return this._state === CIRCUIT_STATE.OPEN;
  }

  isClosed() {
    return this._state === CIRCUIT_STATE.CLOSED;
  }

  isHalfOpen() {
    return this._state === CIRCUIT_STATE.HALF_OPEN;
  }

  reset() {
    const prevState = this._state;
    this._state = CIRCUIT_STATE.CLOSED;
    this._failureTimestamps = [];
    this._nextAttemptAllowedAt = 0;
    this._halfOpenInFlight = false;
    if (prevState !== CIRCUIT_STATE.CLOSED) {
      this._notifyStateChange(prevState, CIRCUIT_STATE.CLOSED);
    }
  }

  trip() {
    const prevState = this._state;
    this._state = CIRCUIT_STATE.OPEN;
    this._nextAttemptAllowedAt = Date.now() + this.recoveryTimeoutMs;
    this._halfOpenInFlight = false;
    if (prevState !== CIRCUIT_STATE.OPEN) {
      this._notifyStateChange(prevState, CIRCUIT_STATE.OPEN);
    }
  }

  _pruneOldFailures(now = Date.now()) {
    const cutoff = now - this.windowMs;
    this._failureTimestamps = this._failureTimestamps.filter((ts) => ts >= cutoff);
  }

  _notifyStateChange(fromState, toState) {
    logger.warn(`Circuit breaker [${this.name}] transitioned: ${fromState} -> ${toState}`, {
      breaker: this.name,
      from: fromState,
      to: toState,
      failures: this._failureTimestamps.length,
      nextAttemptAllowedAt: this._nextAttemptAllowedAt,
    });
    if (typeof this.onStateChange === 'function') {
      try {
        this.onStateChange(fromState, toState);
      } catch (hookErr) {
        logger.error(`Circuit breaker [${this.name}] onStateChange hook failed`, hookErr);
      }
    }
  }

  recordSuccess() {
    if (this._state === CIRCUIT_STATE.HALF_OPEN) {
      const prevState = this._state;
      this._state = CIRCUIT_STATE.CLOSED;
      this._failureTimestamps = [];
      this._nextAttemptAllowedAt = 0;
      this._halfOpenInFlight = false;
      this._notifyStateChange(prevState, CIRCUIT_STATE.CLOSED);
    } else if (this._state === CIRCUIT_STATE.CLOSED) {
      this._pruneOldFailures();
    }
  }

  recordFailure(error) {
    const now = Date.now();
    if (this._state === CIRCUIT_STATE.HALF_OPEN) {
      const prevState = this._state;
      this._state = CIRCUIT_STATE.OPEN;
      this._nextAttemptAllowedAt = now + this.recoveryTimeoutMs;
      this._halfOpenInFlight = false;
      this._notifyStateChange(prevState, CIRCUIT_STATE.OPEN);
    } else if (this._state === CIRCUIT_STATE.CLOSED) {
      this._failureTimestamps.push(now);
      this._pruneOldFailures(now);
      if (this._failureTimestamps.length >= this.failureThreshold) {
        const prevState = this._state;
        this._state = CIRCUIT_STATE.OPEN;
        this._nextAttemptAllowedAt = now + this.recoveryTimeoutMs;
        this._notifyStateChange(prevState, CIRCUIT_STATE.OPEN);
      }
    }
  }

  /**
   * Executes an action protected by this circuit breaker.
   *
   * @template T
   * @param {() => Promise<T>} action
   * @returns {Promise<T>}
   */
  async execute(action) {
    const now = Date.now();

    if (this._state === CIRCUIT_STATE.OPEN) {
      if (now >= this._nextAttemptAllowedAt) {
        const prevState = this._state;
        this._state = CIRCUIT_STATE.HALF_OPEN;
        this._halfOpenInFlight = false;
        this._notifyStateChange(prevState, CIRCUIT_STATE.HALF_OPEN);
      } else {
        const err = ApiError.serviceUnavailable(
          'The AI service is temporarily unavailable due to repeated failures. Please try again shortly.',
          ERROR_CODES.AI_PROVIDER_FAILED,
        );
        err.circuitBreakerOpen = true;
        err.retryAfter = Math.max(1, Math.ceil((this._nextAttemptAllowedAt - now) / 1000));
        throw err;
      }
    }

    if (this._state === CIRCUIT_STATE.HALF_OPEN) {
      if (this._halfOpenInFlight) {
        const err = ApiError.serviceUnavailable(
          'The AI service is currently probing recovery. Please try again in a few seconds.',
          ERROR_CODES.AI_PROVIDER_FAILED,
        );
        err.circuitBreakerHalfOpen = true;
        throw err;
      }
      this._halfOpenInFlight = true;
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (err) {
      if (!this.isFailure || this.isFailure(err)) {
        this.recordFailure(err);
      } else if (this._state === CIRCUIT_STATE.HALF_OPEN) {
        this._halfOpenInFlight = false;
      }
      throw err;
    }
  }
}

/** Default singleton circuit breaker for the AI provider layer */
export const aiCircuitBreaker = new CircuitBreaker({
  name: 'ai-provider-circuit-breaker',
  failureThreshold: 5,
  windowMs: 60_000,
  recoveryTimeoutMs: 30_000,
});
