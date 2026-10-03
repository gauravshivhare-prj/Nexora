# Task 36 — Database Security, Query Safety & Data Architecture

## Overview

Task 36 solidifies Nexora's MongoDB persistence tier, establishing mandatory TLS encryption for production deployments, Mongoose slow-query observability, comprehensive index coverage across all 10 domain models, and an authoritative data architecture ledger.

---

## 1. Database Connection Security & TLS Policy

### Module: `server/src/config/database.js`
- **Mandatory Production TLS**:
  - In `production`, any non-local connection URI must enforce TLS (`mongodb+srv://` or parameters `ssl=true` / `tls=true`).
  - Insecure connection attempts in production throw a startup-blocking error:
    `Insecure production database connection: MONGODB_URI must use TLS encryption.`
  - In development and test environments, non-TLS connections log an actionable security warning:
    `MongoDB connection is not using TLS encryption. Ensure production deployments configure mongodb+srv:// or ssl=true.`
  - Local loopback connections (`127.0.0.1`, `localhost`, `*_test`) are safely exempted during automated integration testing.

---

## 2. Query Performance & Slow Query Detection

### Threshold: `SLOW_QUERY_THRESHOLD_MS = 500`
- **Mongoose Global Plugin**:
  Hooks into `find`, `findOne`, `findOneAndUpdate`, and `countDocuments` operations across all models.
- **High-Precision Duration Tracking**:
  Measures execution duration via `process.hrtime.bigint()`. Any operation taking $\ge 500\text{ms}$ automatically logs an observability alert:
  `Slow query detected: <Model>.<op> took 612.4ms`
  enabling early detection of unindexed query growth before reaching production scale.

---

## 3. Data Architecture & Model Registry

Nexora operates 10 Mongoose models, with strict field whitelist schemas and guaranteed index initialization via `ensureModelIndexes()`:

| Model | Primary Owner Key | High-Cardinality Indexes | Purpose |
|---|---|---|---|
| **`User`** | `_id` | `email` (unique) | Authentication identity, password hash (`select: false`), role (`student`, `admin`), account lockout counters. |
| **`StudentProfile`** | `user` | `user` (unique) | Canonical student education, technical interests, goals, and onboarding status. |
| **`Resume`** | `user` | `{ user: 1, createdAt: -1 }`<br>`{ user: 1, "analysis.status": 1, createdAt: -1 }`<br>`{ user: 1, contentHash: 1 }` | Stored resumes, raw extracted text, grounded skills, timeline conflicts, and dual SHA-256 deduplication hashes. |
| **`CareerTwin`** | `user` | `user` (unique) | Verified and supported skill evidence aggregation, narrative summary, and staleness markers. |
| **`SkillEvidenceCheck`**| `user` | `{ user: 1, completedAt: -1 }`<br>`{ user: 1, eligibleForVerified: 1, completedAt: -1 }` | Evidence evaluation records with verification eligibility flags. |
| **`Assessment`** | `slug` | `slug` (unique)<br>`category`<br>`difficulty` | Curated assessment catalog metadata, duration limits, and pass criteria. |
| **`AssessmentAttempt`**| `user` | `{ user: 1, assessmentId: 1, attemptNumber: 1 }` (unique)<br>`{ user: 1, assessmentId: 1, status: 1, attemptNumber: -1 }` | Candidate assessment test attempts, answers, scored results, and completion status. |
| **`InterviewSession`** | `user` | `{ user: 1, createdAt: -1 }`<br>`{ user: 1, status: 1 }`<br>`{ status: 1, expiresAt: 1 }` | Interactive interview sessions, question history, and TTL/expiration lifecycle markers. |
| **`ReadinessSnapshot`**| `user` | `{ user: 1, roleId: 1, createdAt: -1 }` | Historical readiness score tracking for delta analysis and progress visualization. |
| **`AuditLog`** | `actor` / `targetUser` | `{ createdAt: -1 }`<br>`{ targetUser: 1, createdAt: -1 }`<br>`{ actor: 1, createdAt: -1 }`<br>`{ action: 1, createdAt: -1 }` | Immutable security audit ledger tracking administrative, reconciliation, and authentication events. |

---

## 4. Query Safety & Injection Defense

- **No Raw Body Passthrough**: Controllers never pass raw `req.body` directly to MongoDB filters (`$where`, `$regex`, or raw JSON). All query parameters are coerced to known types or validated with `ValidationCollector` and `validateBody`.
- **Startup Index Guarantee**: `server.js` calls `await ensureModelIndexes()` before listening on HTTP ports, ensuring unique constraints cannot be bypassed by race conditions during initial server boot.

---

## 5. Verification & Test Coverage

The implementation is verified by:
- `server/tests/mongoIndexes.audit.test.js`: 9 tests verifying index initialization, compound index coverage across all models, unique constraints, and TLS URI validation.
- `server/tests/production.configuration.test.js`: Production startup invariants and health status.
- `server/tests/production.errors.test.js`: Production error handling and stack trace suppression.
- `server/tests/production.hardening.test.js`: Production security and trust-proxy policies.
