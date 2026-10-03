# Task 38: AI Cost, Rate Limiting, Quotas & Resource-Abuse Protection

## 1. Overview & Objectives

Nexora incorporates AI across three core features:
1. **Resume Analysis & Fact Extraction** (`resume.service.js`)
2. **Behavioral & Technical Interview Evaluation** (`interviewEvaluation.service.js`)
3. **CareerTwin Narrative Synthesis** (`careerTwin.service.js`)

Unbounded access to frontier LLM APIs presents substantial denial-of-wallet (DoW) and resource-exhaustion risks. Task 38 delivers a comprehensive, multi-layered resource-abuse and cost-management architecture:
- **Per-User Daily AI Quota**: Enforces a strict, configurable daily quota (default: 50 AI evaluations/day) persisted in MongoDB across restarts.
- **Dynamic Cost & Token Estimation**: Accurately models Gemini token economics and logs real-time cost attribution for every evaluation.
- **Graceful Degradation**: Protects system availability by serving deterministic intelligence even when an individual student's AI evaluation budget has been exhausted.
- **Distributed Migration Roadmap**: Outlines the transition from single-instance in-memory sliding windows to distributed Redis stores.

---

## 2. Gemini Token Economics & Cost Estimation Engine

Nexora estimates token counts and calculates real-time cost in USD using [`server/src/domain/ai/aiCostEstimator.js`](file:///c:/Users/akans/OneDrive/Desktop/Nexora/server/src/domain/ai/aiCostEstimator.js).

### Pricing Schedule (March 2026 Reference)
| Model Tier | Input Cost ($ / 1M Tokens) | Output Cost ($ / 1M Tokens) | Target Use Case |
|---|---|---|---|
| **Gemini 1.5 Flash** | $0.075 | $0.30 | Primary real-time evaluation & narrative engine |
| **Gemini 1.5 Pro** | $1.25 | $5.00 | Deep document extraction & complex coding analysis |

### Token Estimation Heuristic
- **Input Tokens**: Approximated at $\lceil \text{inputChars} / 4 \rceil$ UTF-8 characters per token.
- **Output Tokens**: Bounded strictly by contract context limits (e.g., 250 for CareerTwin, 350 for interview answers, 500 for resume extraction).
- **Cost Formula**:
  $$\text{Cost}_{\text{USD}} = \left(\frac{\text{InputTokens}}{1,000,000} \times \text{Rate}_{\text{in}}\right) + \left(\frac{\text{OutputTokens}}{1,000,000} \times \text{Rate}_{\text{out}}\right)$$

All costs are calculated deterministically to 6 decimal places and logged on completion for observability and billing audits.

---

## 3. Persistent Per-User Quota Architecture

### Data Model (`UserAiQuota.model.js`)
Stored in a dedicated MongoDB collection with atomic upsert semantics:
- `user`: References authenticated `User._id`.
- `dateKey`: UTC date formatted as `YYYY-MM-DD`.
- `count`: Total evaluations consumed during this UTC calendar day.
- `estimatedCostUsd`: Total accumulated cost incurred by this user today.
- `calls`: Capped audit history of the last 100 evaluation invocations.
- `createdAt`: Includes an automated MongoDB TTL index expiring after 30 days (`expires: 2592000`).
- Compound Index: `{ user: 1, dateKey: 1 }` (unique constraint prevents duplicate date records).

### Quota Service (`server/src/services/ai/aiQuota.service.js`)
- `checkUserAiQuota(userId)`: Pre-flight check prior to provider invocation. If `count >= getDailyQuota()`, calculates remaining seconds until UTC midnight and throws an HTTP 429 `ApiError` with `errorCode: 'AI_QUOTA_EXCEEDED'` and `Retry-After: <seconds>`.
- `recordAiUsage({ userId, contractId, model, inputChars, outputTokens })`: Atomically increments usage and logs operational cost metrics.
- `getUserAiQuotaStatus(userId)`: Exposes current usage, remaining quota, and time-to-reset via `GET /api/student/ai-quota`.

---

## 4. Graceful Degradation & Invariant Protection

| Feature | Quota Exceeded Behavior | User Experience |
|---|---|---|
| **Resume Analysis** | Rejects with HTTP 429 `AI_QUOTA_EXCEEDED` + `Retry-After` header. | Informs student that daily AI quota was reached and displays reset time. Unanalysed resume remains intact. |
| **Interview Answer Evaluation** | Rejects with HTTP 429 `AI_QUOTA_EXCEEDED` + `Retry-After` header. | Prevents question lockup; answer remains preserved for retry when quota resets. |
| **CareerTwin Generation** | **Graceful Degradation (200 OK)**: Omits AI narrative while building complete twin. | CareerTwin generation succeeds with all deterministic skills, gaps, readiness, and roadmaps intact. Emits warning explaining narrative was omitted due to daily limit. |

---

## 5. Distributed Scaling & Redis Migration Path

### Current State: Single-Instance
- Sliding window rate limiting (`rateLimiter.js`) utilizes in-memory `Map` with periodic sweep timers.
- Daily AI evaluation quotas (`UserAiQuota.model.js`) are persisted in MongoDB and already function across multi-replica deployments.

### Multi-Instance Production Architecture
For horizontal scaling across multiple Node.js processes or Kubernetes pods:
1. **Shared Rate Limiting**:
   - Replace in-memory `store` in `rateLimiter.js` with Redis sorted sets (`ZADD` / `ZREMRANGEBYSCORE` / `ZCARD`) or atomic token bucket Lua scripts.
   - Recommended library: `rate-limiter-flexible` with `ioredis`.
2. **Keying Strategy**:
   - `ratelimit:{route}:{user|ip}:{window}`
3. **Failover Protocol**:
   - If Redis is unreachable, fail open with conservative local in-memory fallback rather than failing user requests with 500 errors.
