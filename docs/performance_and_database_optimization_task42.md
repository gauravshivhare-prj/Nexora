# Architecture Specification — Performance, Database Optimization & Pagination (Task 42)

## Executive Summary
This document specifies Nexora's performance optimization, database query indexing, list pagination architecture, and HTTP response caching introduced in Task 42.

---

## 1. Unified Pagination Architecture (`server/src/utils/pagination.js`)

To prevent unbounded collection queries, memory bloat, and high network payload sizes as data scales, Nexora provides a uniform pagination interface.

### Request Query Parameters
- `page`: 1-indexed page number (default: `1`, minimum: `1`).
- `limit`: Number of items per page (default: `20`, maximum: `100`).

### Pagination Metadata Shape
All paginated list endpoints return uniform pagination metadata alongside their items:
```json
{
  "page": 1,
  "limit": 20,
  "total": 45,
  "totalPages": 3,
  "hasNextPage": true,
  "hasPrevPage": false
}
```

### Paginated Endpoints
1. `GET /api/assessments`: Active assessment definitions catalogue. Supports `?page=&limit=` with filters `?skill=&difficulty=&group=`.
2. `GET /api/assessments/attempts`: Historical assessment attempts for the authenticated student. Supports `?page=&limit=` and `?assessmentId=`.
3. `GET /api/interviews/sessions`: Historical interview sessions for the authenticated student. Supports `?page=&limit=`.
4. `GET /api/resumes`: Saved resumes for the authenticated student. Supports `?page=&limit=`.

### Non-Breaking Backward Compatibility
To prevent breaking existing frontend callers and integration tests:
- Responses continue returning original item collections (`resumes`, `sessions`, `assessments`, `attempts`) and `count` fields.
- Service-level function calls without pagination parameters continue returning full arrays.

---

## 2. Database Compound Indexing & Query Safety

Nexora enforces strict compound indexing on all student-scoped collections, ensuring all list, sorting, and lifecycle queries are index-backed:

| Collection | Compound Index | Query Pattern Covered |
|---|---|---|
| `Resume` | `{ user: 1, createdAt: -1 }` | Paginated reverse-chronological list of student resumes |
| `Resume` | `{ user: 1, "analysis.status": 1, createdAt: -1 }` | CareerTwin aggregation of parsed resumes |
| `InterviewSession` | `{ user: 1, createdAt: -1 }` | Paginated student interview session history |
| `InterviewSession` | `{ user: 1, status: 1 }` | Active vs completed session filtering |
| `InterviewSession` | `{ status: 1, expiresAt: 1 }` | Background session timeout cleanup queries |
| `AssessmentAttempt` | `{ user: 1, createdAt: -1 }` | Paginated student assessment attempt history |
| `AssessmentAttempt` | `{ user: 1, assessmentId: 1, attemptNumber: 1 }` (unique) | Idempotent attempt deduplication |
| `AssessmentAttempt` | `{ user: 1, assessmentId: 1, status: 1, attemptNumber: -1 }` | Latest assessment score & verification queries |

All indexes are verified at server startup via `ensureModelIndexes()` and audited in `mongoIndexes.audit.test.js`.

---

## 3. Read-Only Computation Caching Headers

Computationally intensive derived endpoints that evaluate pure functions over CareerTwin and reference catalogues send HTTP caching headers:

- **Cache-Control Header**: `Cache-Control: private, max-age=60`
- **Protected Endpoints**:
  - `GET /api/careers/roles/:roleId/skill-gap`
  - `GET /api/careers/roles/:roleId/readiness`
  - `GET /api/careers/roles/:roleId/readiness/history`
  - `GET /api/careers/roles/:roleId/roadmap`
- **Security Rule**: The `private` directive guarantees that student-specific evidence is cached only by the user's browser and never by shared intermediate CDNs or forward proxies.

---

## 4. Verification & Latency Benchmarks

Tested with zero regressions across:
- `tests/performanceAndPagination.test.js`: 9/9 tests verifying parsing bounds, array slicing, endpoint responses, cache headers, and index definitions.
- `tests/mongoIndexes.audit.test.js`: 9/9 tests verifying index consistency.
- `tests/performance.sanity.test.js`: Sub-30ms average response times across all core reads.
