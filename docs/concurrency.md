# Concurrency, Race Conditions & Distributed-State Safety (Task 44)

## Executive Summary
This document specifies Nexora's concurrency control, optimistic concurrency control (OCC), Compare-And-Swap (CAS) state machines, and race condition mitigations across student journeys, assessments, interviews, and CareerTwin generation.

---

## 1. Concurrency Principles & Invariants

1. **Idempotence**: Repetitive or racing client requests must result in the same deterministic final state without throwing 500 internal server errors.
2. **Atomic State Transitions**: No interview session or assessment attempt may be completed more than once, and verified evidence checks must never be duplicated.
3. **Optimistic Concurrency Control (OCC)**: Single-document user aggregates (`StudentProfile`, `CareerTwin`) utilize Mongoose version keys (`__v`) to detect and safely sequence concurrent mutations.
4. **Collision Auto-Recovery**: MongoDB unique constraint collisions (`E11000`) on concurrent first-time upserts must be automatically caught and gracefully retried as updates.

---

## 2. Race Conditions & Mitigations

### 2.1 Concurrent Profile Upsert
- **Scenario**: A new student with no profile triggers multiple parallel `PATCH /api/profile` requests (e.g. fast onboarding wizard or multi-tab editing).
- **Hazard**: Two concurrent `findOneAndUpdate(..., { upsert: true })` calls can race. The first creates the document; the second fails with duplicate key error on `{ user: 1 }`.
- **Mitigation (`server/src/services/profile.service.js`)**:
  - The update operation includes `$setOnInsert: { user: userId }` and increments `$inc: { __v: 1 }`.
  - In the event of an `E11000` or `VersionError`, the service catches the error, strips `$setOnInsert`, and retries the mutation against the newly created document.
  - Verified in `concurrency.integrity.test.js` (Subtest 1).

### 2.2 Concurrent CareerTwin Generation
- **Scenario**: Multiple actions trigger simultaneous CareerTwin generation (e.g. resume analysis completion + student clicking "Generate Twin" simultaneously).
- **Hazard**: Duplicate document creation or conflicting parallel updates to the student's digital twin.
- **Mitigation (`server/src/services/careerTwin.service.js`)**:
  - Rebuilding the twin is a pure deterministic function of inputs.
  - The persistence step uses atomic `findOneAndUpdate` with `$inc: { __v: 1 }` and `$setOnInsert: { user: userId }`.
  - Catches `11000` duplicate key collisions and `VersionError`, gracefully falling back to update the existing twin record.
  - Verified in `concurrency.integrity.test.js` (Subtest 6).

### 2.3 Concurrent Assessment Attempt Creation
- **Scenario**: Student clicks "Start Assessment" multiple times rapidly or opens multiple tabs.
- **Hazard**: Multiple active attempts for the same assessment are created, bypassing attempt limits.
- **Mitigation (`server/src/services/assessment.service.js`)**:
  - Atomic query checks for any active `in_progress` attempt for `{ user: userId, assessmentId }`.
  - If an active attempt exists, it is returned immediately (idempotent reuse).
  - Unique compound index `{ user: 1, assessmentId: 1, attemptNumber: 1 }` prevents duplicate attempt numbers.
  - Verified in `concurrency.integrity.test.js` (Subtest 2).

### 2.4 Concurrent Assessment Submission & Double-Evaluation
- **Scenario**: Client submits answers simultaneously across multiple network threads or retransmissions.
- **Hazard**: Multiple evaluations run simultaneously, costing redundant computation and creating duplicate verified evidence records.
- **Mitigation (`server/src/services/assessment.service.js`)**:
  - Compare-And-Swap (CAS) guard: Updates status from `in_progress` to `evaluated` atomically.
  - Subsequent submissions find the attempt already `evaluated` and are rejected with HTTP 400 `Attempt is already evaluated`.
  - Verified in `concurrency.integrity.test.js` (Subtest 3).

### 2.5 Concurrent Interview Completion & Evidence Creation
- **Scenario**: Rapid consecutive clicks or automated scripts trigger `/complete` on an interview session.
- **Hazard**: Multiple calls to `completeSession` transition the session and emit duplicate skill evidence checks.
- **Mitigation (`server/src/services/interviewSession.service.js`)**:
  - Atomic CAS update on session status: `findOneAndUpdate({ _id: sessionId, user: userId, status: 'in_progress' }, { $set: { status: 'completed' } })`.
  - Only the winning atomic CAS transition proceeds to calculate scores and issue evidence checks. All losing requests receive HTTP 400 `INTERVIEW_INVALID_STATE`.
  - Verified in `concurrency.integrity.test.js` (Subtest 4).

### 2.6 Concurrent Question Answer Submissions
- **Scenario**: Student submits multiple answers to the same question simultaneously.
- **Hazard**: Duplicate evaluation attempts recorded against the same question attempt index.
- **Mitigation (`server/src/services/interviewSession.service.js`)**:
  - In-flight evaluation guard locks question evaluations per session in memory or checks atomic array index before dispatching model evaluations.
  - Losing concurrent answer submissions receive HTTP 409 `An evaluation is already in progress for this question`.
  - Verified in `concurrency.integrity.test.js` (Subtest 5).

---

## 3. Distributed Locking Roadmap (Tier 2 & Above)

In multi-instance clustered deployments (Render replicas > 1 or container auto-scaling), in-memory in-flight evaluation locks must be upgraded to distributed locks:

1. **Redis Redlock Algorithm**:
   - Acquire resource lock: `SET locks:interview:${sessionId}:${questionId} $uuid NX PX 30000`.
   - If lock acquisition fails, immediately return 409 conflict with retry interval.
   - Upon completion, atomically release lock via Lua script comparing token value.
2. **MongoDB Two-Phase Commits / Transactions**:
   - Multi-document transactions (`session.withTransaction`) reserved for cross-collection atomic updates (e.g. user account deletion or administrative resets).
