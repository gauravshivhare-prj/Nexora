# Architecture Specification — Resilience, Circuit Breaker & Failure Recovery (Task 41)

## Executive Summary
This document outlines Nexora's failure recovery, resilience, and circuit breaker architecture introduced in Task 41. It protects platform stability and provides graceful degradation under downstream AI provider outages, transient network spikes, and partial database/aggregation failures.

---

## 1. Circuit Breaker Architecture (`server/src/utils/circuitBreaker.js`)

Nexora employs a state machine protecting all outbound AI calls to Google Gemini (`requestCompletion` in `aiProvider.js`):

```
     +----------------------------------------------------+
     |                                                    |
     v                                                    |
+--------+       5 failures in 60s window         +------+ | Trial probe
| CLOSED | -------------------------------------> | OPEN | | succeeds
+--------+                                        +------+ |
     ^                                                |    |
     |                                                |    | Cooldown (30s)
     |                Trial probe fails               v    | expires
     +----------------------------------------- +-----------+
                                                | HALF_OPEN |
                                                +-----------+
```

### State Definitions & Thresholds
| Parameter | Default Value | Description |
|---|---|---|
| `failureThreshold` | 5 | Consecutive or sliding window failures required to trip the breaker into `OPEN` |
| `windowMs` | 60,000ms (60s) | Sliding window for tracking failure timestamps |
| `recoveryTimeoutMs` | 30,000ms (30s) | Time breaker remains in `OPEN` before allowing a trial probe in `HALF_OPEN` |
| `isFailure` | Predicate | Differentiates upstream failures (5xx, timeouts, network drops) from client errors (4xx validation/auth). 4xx errors NEVER trip the breaker. |

### Fail-Fast Behavior
When in `OPEN` state, all inbound requests fail fast immediately without dispatching network calls or consuming CPU:
- **HTTP Status**: `503 Service Unavailable`
- **Error Code**: `AI_PROVIDER_FAILED`
- **Metadata**: `circuitBreakerOpen: true`, `retryAfter: <seconds until probe>`
- **Telemetry**: State transitions log at `WARN` with structured metadata.

---

## 2. Transient Retry Engine (`server/src/utils/retry.js`)

To absorb brief network glitches, DNS blips, and momentary 5xx responses from the upstream model API, `executeWithRetry` handles transient failures with backoff:

1. **Transient Error Identification**:
   - Upstream HTTP 500, 502, 503, 504
   - System network errors: `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `ECONNREFUSED`, `EAI_AGAIN`
   - Node.js `TimeoutError` and `AbortError`
2. **Non-Transient Invariants (Never Retried)**:
   - Client errors (HTTP 400, 401, 403, 404, 409, 422)
   - Schema validation and JSON parse failures
   - Daily quota exhaustion (`AI_QUOTA_EXCEEDED`)
   - Any error when the circuit breaker is already in `OPEN` state
3. **Backoff Schedule**:
   - `maxRetries`: 1 (configurable via `AI_MAX_RETRIES`)
   - `backoffMs`: 2000ms in production (exponential `backoffMs * 2^(attempt - 1)`), 20ms in test/development (configurable via `AI_RETRY_BACKOFF_MS`).

---

## 3. Dashboard Summary Partial Failure Isolation (`server/src/services/summary.service.js`)

The student dashboard summary endpoint (`GET /api/summary`) aggregates status across profiles, resumes, CareerTwin, role recommendations, skill gaps, and personalized roadmaps.

To prevent any single section failure from breaking the student dashboard:
1. **Parallel Top-Level Reads**: Profile, CareerTwin, Resume counts, Assessment counts, and Interview session counts are read via `Promise.allSettled`.
2. **Isolated Defaults**: A rejected read in one section (e.g., transient database error loading CareerTwin) populates that specific section with an honest empty/degraded state (`exists: false`, counts: 0) while all other sections render normally.
3. **Resilient Personalization**: Journey milestone progress (`computeJourneyProgress`) and dashboard section ordering (`prioritizeDashboardSections`) are wrapped in defensive handlers; if a corrupted profile preference prevents sorting, the dashboard safely falls back to standard ordering without error.
4. **Summary Invariants Preserved**:
   - No `readiness`, `completionPercent`, `percentComplete`, or `overallScore` is ever added to summary output.

---

## 4. Verification & Testing

The resilience architecture is validated by:
- `server/tests/circuitBreaker.test.js`: 16 comprehensive unit & integration tests covering state transitions, half-open trials, fail-fast behavior, retry backoff, and AI provider integration.
- `server/tests/providerFailureUx.test.js`: Verified clean UI error resolution and lack of secret leakage during outages.
- `server/tests/interviewFailureIsolation.test.js`: Confirmed interview sessions remain uncorrupted during mock AI failures.
- `server/tests/summary.reliability.test.js`: Confirmed partial failure degradation when specific sub-queries reject.
