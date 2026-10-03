# Task 30 — Cross-Feature Intelligence Consistency & Reconciliation Engine

## 1. Overview & Purpose
Nexora aggregates student career intelligence across disparate modules:
1. **Canonical Student State** (`CanonicalStudentState`): Immutable ledger of truth with provenance tiers.
2. **CareerTwin** (`CareerTwin`): Derived, consolidated view of skills, interests, and target roles.
3. **Skill Gap Analysis** (`SkillGap`): Role requirement evaluation matching held vs expected skills.
4. **Career Readiness** (`Readiness`): Actionable status, blocking skills, and evidence-weighted readiness score.
5. **Institutional Evidence Checks** (`SkillEvidenceCheck`): Authoritative proctored assessments and verified human evaluations.
6. **Career Recommendations** (`MatchRole`): Deterministic ranking of career roles.

Derived data distributed across micro-phases can diverge or become contradictory if state transitions are partial or asynchronous. The **Cross-Feature Intelligence Consistency & Reconciliation Engine** provides automated, deterministic contradiction detection, staleness checks, and self-healing reconciliation.

---

## 2. Invariant Contracts & Contradiction Taxonomy

| Code | Severity | Invariant / Rule |
| :--- | :---: | :--- |
| `TWIN_GAP_SKILL_MISMATCH` | **Error** | A skill held in CareerTwin as `verified` or `supported` must not be reported as `missing` in Skill Gap analysis for any role requiring/preferring that skill. Conversely, gap analysis must not report `verified` if CareerTwin lacks verified strength. |
| `UNVERIFIED_EVIDENCE_IN_TWIN` | **Error** | Any skill in CareerTwin marked with `strength: 'verified'` or containing verified evidence items must be grounded in an authoritative `SkillEvidenceCheck` with `eligibleForVerified: true`, `outcome: 'pass'`, and active status. |
| `INVALIDATED_EVIDENCE_IN_TWIN` | **Error** | A skill must not retain `verified` status in CareerTwin if the underlying institutional check has been marked `invalidated` or `disputed`. |
| `READINESS_GAP_BLOCKER_MISMATCH` | **Error** | Readiness `blockingSkills` must exactly match the non-verified required skills in Skill Gap (`missing`, `claimed`, `supported`). No verified skill may appear as a blocker, and no required non-verified skill may be omitted. |
| `CANONICAL_TWIN_DIVERGENCE` | **Error** | Skills present in CanonicalStudentState as `verified` must exist with `verified` strength in CareerTwin. |
| `RECOMMENDATION_SCORE_INCONSISTENCY` | **Warning** | Role recommendation scores must be grounded in skill coverage. A student with 0 matching skills and 0 target role alignment cannot receive an elevated match score (>35). |
| `STALE_CAREER_TWIN` | **Warning** | CareerTwin `generatedAt` timestamp must not precede recent institutional evidence checks or resume analyses, and tracked source counts must match actual authoritative records. |
| `MISSING_CAREER_TWIN` | **Warning** | When a student has profile skills or evidence checks, an active CareerTwin should be generated to support downstream features. |

---

## 3. Reconciliation Actions & Self-Healing Engine

When violations are detected, the engine deterministically outputs required reconciliation actions:
- `REBUILD_TWIN`: CareerTwin has diverged, lacks recent evidence checks, or is missing. The engine invokes `rebuildCareerTwin(userId)` to delete stale cached state and regenerate a grounded twin from authoritative sources.
- `REFRESH_GAP`: Skill gap analysis was computed against an outdated twin; downstream callers should re-evaluate role gaps.
- `RECOMPUTE_READINESS`: Readiness blocking skills require re-projection against the updated skill gap.
- `REFRESH_RECOMMENDATIONS`: Career match scores should be re-ranked against current twin skills.

### Self-Healing Pipeline
When requested via `autoReconcile=true` (or `POST /api/student/consistency/reconcile` / `POST /api/admin/consistency/:userId/reconcile`), the reconciliation service automatically executes `rebuildCareerTwin(userId)` and performs a second verification pass to guarantee that errors have been cleared.

---

## 4. API Endpoints & Security Architecture

1. **Student Self-Check** (`GET /api/student/consistency`, `POST /api/student/consistency/reconcile`):
   - Scoped strictly to `req.auth.userId` via JWT authentication.
   - Zero IDOR/BOLA exposure: students cannot inspect or trigger reconciliation for other users.
2. **Admin Global Audit** (`GET /api/admin/consistency/:userId`, `POST /api/admin/consistency/:userId/reconcile`):
   - Restricted to authenticated users with `role: 'admin'`.
   - Rejects non-admin students with `403 Forbidden`.
   - Allows curriculum reviewers and administrators to audit consistency across student accounts.

---

## 5. Verification & Testing Standards
- Pure domain unit tests: `tests/consistencyChecker.test.js`.
- Integration & security tests: verifies 0 violations on clean state, detection of planted contradictions, IDOR protection, admin role gating, and automated self-healing.
