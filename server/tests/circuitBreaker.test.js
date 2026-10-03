import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ApiError } from '../src/utils/ApiError.js';
import { CircuitBreaker, CIRCUIT_STATE, aiCircuitBreaker } from '../src/utils/circuitBreaker.js';
import { executeWithRetry, isTransientError } from '../src/utils/retry.js';
import {
  registerAiProvider,
  resetAiProviders,
  requestCompletion,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';

describe('CircuitBreaker & Failure Resilience Suite (Task 41)', () => {
  beforeEach(() => {
    resetAiProviders();
  });

  describe('1. CircuitBreaker State Machine & Transitions', () => {
    it('initializes in CLOSED state with 0 failures', () => {
      const breaker = new CircuitBreaker({ name: 'test-breaker' });
      assert.equal(breaker.getState().state, CIRCUIT_STATE.CLOSED);
      assert.equal(breaker.getState().failureCount, 0);
      assert.equal(breaker.isClosed(), true);
      assert.equal(breaker.isOpen(), false);
      assert.equal(breaker.isHalfOpen(), false);
    });

    it('stays CLOSED when operations succeed', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });
      const result = await breaker.execute(async () => 'success-payload');
      assert.equal(result, 'success-payload');
      assert.equal(breaker.getState().state, CIRCUIT_STATE.CLOSED);
      assert.equal(breaker.getState().failureCount, 0);
    });

    it('stays CLOSED below failure threshold', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });
      await assert.rejects(
        () => breaker.execute(async () => { throw new Error('fail 1'); }),
        /fail 1/,
      );
      assert.equal(breaker.getState().state, CIRCUIT_STATE.CLOSED);
      assert.equal(breaker.getState().failureCount, 1);

      await assert.rejects(
        () => breaker.execute(async () => { throw new Error('fail 2'); }),
        /fail 2/,
      );
      assert.equal(breaker.getState().state, CIRCUIT_STATE.CLOSED);
      assert.equal(breaker.getState().failureCount, 2);
    });

    it('transitions to OPEN upon reaching failure threshold', async () => {
      let stateChanged = false;
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeoutMs: 100,
        onStateChange(from, to) {
          if (from === CIRCUIT_STATE.CLOSED && to === CIRCUIT_STATE.OPEN) {
            stateChanged = true;
          }
        },
      });

      await assert.rejects(() => breaker.execute(async () => { throw new Error('fail 1'); }));
      await assert.rejects(() => breaker.execute(async () => { throw new Error('fail 2'); }));

      assert.equal(stateChanged, true);
      assert.equal(breaker.getState().state, CIRCUIT_STATE.OPEN);
      assert.equal(breaker.isOpen(), true);
    });

    it('fails fast when OPEN without invoking inner action', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 5000 });
      await assert.rejects(() => breaker.execute(async () => { throw new Error('fail'); }));

      let actionCalled = false;
      await assert.rejects(
        () => breaker.execute(async () => {
          actionCalled = true;
          return 'should-not-run';
        }),
        (err) => {
          assert.equal(err.statusCode, 503);
          assert.equal(err.circuitBreakerOpen, true);
          assert.ok(err.retryAfter > 0);
          return true;
        },
      );
      assert.equal(actionCalled, false);
    });

    it('transitions to HALF_OPEN after recovery timeout and closes upon success', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        recoveryTimeoutMs: 25,
      });

      await assert.rejects(() => breaker.execute(async () => { throw new Error('fail'); }));
      assert.equal(breaker.isOpen(), true);

      // Wait for recovery timeout to elapse
      await new Promise((resolve) => setTimeout(resolve, 35));

      // First call in half-open state should succeed and close the breaker
      const probeResult = await breaker.execute(async () => 'recovered');
      assert.equal(probeResult, 'recovered');
      assert.equal(breaker.isClosed(), true);
      assert.equal(breaker.getState().failureCount, 0);
    });

    it('transitions from HALF_OPEN back to OPEN if probe fails', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        recoveryTimeoutMs: 25,
      });

      await assert.rejects(() => breaker.execute(async () => { throw new Error('initial failure'); }));
      assert.equal(breaker.isOpen(), true);

      // Wait for recovery timeout
      await new Promise((resolve) => setTimeout(resolve, 35));

      // Probe failure
      await assert.rejects(
        () => breaker.execute(async () => { throw new Error('probe failure'); }),
        /probe failure/,
      );

      assert.equal(breaker.isOpen(), true);
    });

    it('ignores 4xx validation errors and does not trip breaker', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      for (let i = 0; i < 5; i++) {
        await assert.rejects(
          () => breaker.execute(async () => {
            throw ApiError.badRequest('Client validation failed', 'VALIDATION_ERROR');
          }),
          /Client validation failed/,
        );
      }
      assert.equal(breaker.isClosed(), true);
      assert.equal(breaker.getState().failureCount, 0);
    });

    it('supports manual reset and trip', () => {
      const breaker = new CircuitBreaker();
      breaker.trip();
      assert.equal(breaker.isOpen(), true);
      breaker.reset();
      assert.equal(breaker.isClosed(), true);
    });
  });

  describe('2. Retry Logic with Backoff (executeWithRetry)', () => {
    it('executes without retry on initial success', async () => {
      let callCount = 0;
      const result = await executeWithRetry(async () => {
        callCount += 1;
        return 'done';
      });
      assert.equal(result, 'done');
      assert.equal(callCount, 1);
    });

    it('retries transient failure and succeeds on 2nd attempt', async () => {
      let callCount = 0;
      const result = await executeWithRetry(
        async () => {
          callCount += 1;
          if (callCount === 1) {
            throw ApiError.serviceUnavailable('Temporary 503', 'AI_PROVIDER_FAILED');
          }
          return 'recovered';
        },
        { maxRetries: 1, backoffMs: 5 },
      );
      assert.equal(result, 'recovered');
      assert.equal(callCount, 2);
    });

    it('fails after exceeding maxRetries on continuous transient failures', async () => {
      let callCount = 0;
      await assert.rejects(
        () => executeWithRetry(
          async () => {
            callCount += 1;
            throw ApiError.serviceUnavailable('Persistent 503', 'AI_PROVIDER_FAILED');
          },
          { maxRetries: 2, backoffMs: 5 },
        ),
        /Persistent 503/,
      );
      assert.equal(callCount, 3);
    });

    it('does not retry 4xx client errors', async () => {
      let callCount = 0;
      await assert.rejects(
        () => executeWithRetry(
          async () => {
            callCount += 1;
            throw ApiError.badRequest('Malformed input', 'VALIDATION_ERROR');
          },
          { maxRetries: 2, backoffMs: 5 },
        ),
        /Malformed input/,
      );
      assert.equal(callCount, 1);
    });

    it('identifies transient vs non-transient errors correctly', () => {
      assert.equal(isTransientError(ApiError.serviceUnavailable('Down', 'AI_PROVIDER_FAILED')), true);
      assert.equal(isTransientError({ statusCode: 502 }), true);
      assert.equal(isTransientError({ code: 'ECONNRESET' }), true);
      assert.equal(isTransientError({ name: 'TimeoutError' }), true);

      assert.equal(isTransientError(ApiError.badRequest('Bad', 'VALIDATION_ERROR')), false);
      assert.equal(isTransientError({ statusCode: 429, errorCode: 'AI_QUOTA_EXCEEDED' }), false);
      assert.equal(isTransientError({ circuitBreakerOpen: true, statusCode: 503 }), false);
    });
  });

  describe('3. AI Provider Circuit Breaker Integration', () => {
    it('trips the aiCircuitBreaker after 5 consecutive provider failures and fails fast', async () => {
      let callAttempts = 0;
      registerAiProvider({
        name: 'mock-failing-provider',
        async complete() {
          callAttempts += 1;
          throw new Error('Simulated upstream Gemini connection reset');
        },
      });
      useAiProvider('mock-failing-provider');

      // Set breaker failureThreshold to 3 for fast verification in this test
      aiCircuitBreaker.failureThreshold = 3;
      aiCircuitBreaker.recoveryTimeoutMs = 100;

      // 3 failures should trip the breaker
      for (let i = 0; i < 3; i++) {
        await assert.rejects(
          () => requestCompletion({ user: 'Please analyze this resume.' }),
          (err) => err.statusCode === 503 && err.errorCode === 'AI_PROVIDER_FAILED',
        );
      }

      assert.equal(aiCircuitBreaker.isOpen(), true);
      const callCountBeforeFailFast = callAttempts;

      // 4th request must fail-fast without calling complete()
      await assert.rejects(
        () => requestCompletion({ user: 'Another request while open.' }),
        (err) => {
          assert.equal(err.statusCode, 503);
          assert.equal(err.circuitBreakerOpen, true);
          return true;
        },
      );

      // Call attempts did not increase because circuit breaker intercepted it!
      assert.equal(callAttempts, callCountBeforeFailFast);
    });

    it('resets breaker when resetAiProviders() is invoked', () => {
      aiCircuitBreaker.trip();
      assert.equal(aiCircuitBreaker.isOpen(), true);
      resetAiProviders();
      assert.equal(aiCircuitBreaker.isClosed(), true);
    });
  });
});
