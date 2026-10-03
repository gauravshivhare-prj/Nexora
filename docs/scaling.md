# Scalability Architecture: 100 → 1K → 10K → 100K Users (Task 43)

## Executive Summary
This document defines Nexora's architectural scaling progression from a single-instance development and prototype environment to a high-throughput, multi-region production deployment serving up to 100,000 concurrent active students.

---

## 1. Growth Tier Analysis & Roadmap

| Tier | Active Users | Target Throughput | Primary Bottleneck | Required Architecture Changes |
|---|---|---|---|---|
| **Tier 1 (Current)** | 100 | ~10 req/s | Single Node.js event loop | In-memory rate limiting, default Mongoose pool |
| **Tier 2** | 1,000 | ~100 req/s | In-memory limiter synchronization | Redis-backed sliding window rate limiter, pool tuning |
| **Tier 3** | 10,000 | ~1,000 req/s | Primary DB connection limits & disk I/O | MongoDB Atlas M30+ cluster, horizontal app auto-scaling |
| **Tier 4** | 100,000 | ~10,000 req/s | Read latency & cross-feature aggregation | DB read replicas, Redis caching layer, CDN asset edge |

---

## 2. Tier 1 (Current: ~100 Users)
- **Deployment**: Single Render Web Service (0.5 CPU, 512MB RAM) + MongoDB Atlas M0/M2.
- **Connection Pool**:
  - `MONGODB_POOL_SIZE`: 20 connections max.
  - `MONGODB_MIN_POOL_SIZE`: 5 connections warm.
- **Rate Limiting**: In-memory sliding window with periodic timer sweep.
- **State**: Stateless JWT authentication with database-backed session lockouts.

---

## 3. Tier 2 (1,000 Users — Adding Distributed State)
- **Bottlenecks**:
  - Running >1 server instance behind a round-robin load balancer causes in-memory rate limiting to fragment (each instance counts quota independently).
- **Architecture Updates**:
  1. **Redis Rate Limiting**:
     - Deploy Redis Cloud or AWS ElastiCache instance.
     - Replace memory array in `server/src/middleware/rateLimiter.js` with Redis sorted sets (`ZADD`, `ZREMRANGEBYSCORE`, `ZCARD`) using atomic sliding window transactions.
  2. **Connection Pool Sizing**:
     - `MONGODB_POOL_SIZE` configured to 25–50 connections per instance.
     - Render deployed with 2–3 instances (horizontal scale).

---

## 4. Tier 3 (10,000 Users — Cluster & Sharding Optimization)
- **Bottlenecks**:
  - Database primary node write saturation on AI evaluation quotas and interview session ticks.
  - Slow aggregation queries under high concurrent loads.
- **Architecture Updates**:
  1. **MongoDB Atlas Dedicated Cluster (M30/M40)**:
     - 8GB–16GB RAM, multi-AZ replica set (1 Primary, 2 Secondaries).
     - Dedicated IOPS volume with automated storage scaling.
  2. **Query Offloading via Secondary Reads**:
     - Read-only endpoints (`GET /api/careers/roles`, `/api/assessments`, historical snapshots) configured with `readPreference: 'secondaryPreferred'`.
  3. **AI Provider Circuit Breaking & Queueing**:
     - Gemini provider calls protected with circuit breaker state machine (`server/src/utils/circuitBreaker.js`).
     - Heavy background operations (PDF resume extraction) offloaded to BullMQ worker pool.

---

## 5. Tier 4 (100,000 Users — High-Scale Edge Architecture)
- **Bottlenecks**:
  - Cross-regional latency for client dashboards.
  - Database connection pool exhaustion across tens of application containers.
- **Architecture Updates**:
  1. **Edge CDN & Caching**:
     - Cloudflare Enterprise edge terminating SSL and serving static bundles.
     - Micro-caching of public reference catalogues (`/api/careers/roles`, `/api/assessments`) with `s-maxage=3600, stale-while-revalidate=86400`.
  2. **MongoDB Connection Pooling with Atlas Serverless / Mongocryptd**:
     - Dedicated MongoDB connection proxy (e.g. AWS DocumentDB proxy or Atlas connection aggregation) to prevent connection storms.
  3. **Readiness Snapshot & CareerTwin Event Sourcing**:
     - Asynchronous materialization of CareerTwin summaries on Kafka/RabbitMQ events rather than on-demand rebuilds.

---

## 6. Scaling Readiness Checklist

### Operational Readiness Matrix
- [x] **Configurable DB Pool Size**: `MONGODB_POOL_SIZE` and `MONGODB_MIN_POOL_SIZE` exposed via environment variables.
- [x] **Compound Indexing**: All student queries backed by compound indexes (`{ user: 1, createdAt: -1 }`).
- [x] **List Pagination**: Uniform `page` and `limit` on all collection read endpoints.
- [x] **Circuit Breaker Fail-Fast**: AI provider protected by sliding-window circuit breaker with 5-failure threshold.
- [x] **Load Testing Script**: Dedicated `scripts/load-test.mjs` available for CI and pre-deploy benchmarking.
- [ ] **Redis Rate Limiting**: Scheduled for Tier 2 deployment (when replica count > 1).
- [ ] **Secondary Read Preferences**: Scheduled for Tier 3 Atlas replica set migration.
