# Nexora — Canonical Student Data Model & Source-of-Truth Architecture (Task 02)

## 1. Overview & Objective
Task 02 reconstructs the canonical data model for the student and all derived intelligence across Nexora. In previous iterations, `StudentProfile`, `Resume`, and `CareerTwin` held potentially competing representations of skills, projects, and education. 

The **Canonical Student Data Model (`server/src/domain/student/canonicalStudent.js`)** establishes a single, conflict-resolved, provenance-backed source of truth for the entire platform.

---

## 2. The 5 Provenance Tiers

Every student fact is tagged with one of five deterministic provenance tiers:

| Tier | Enum (`PROVENANCE_TIER`) | Trust Weight | Authoritative Boundary | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | `USER_ENTERED` | `0.40` | Self-reported | Explicitly provided by the student via Profile forms (personal info, academic details, declared skills, projects, certs). |
| **Tier 2** | `IMPORTED` | `0.85` | Third-party institutional | Imported from verified external integrations (university SIS, Coursera, Credly, GitHub OAuth). |
| **Tier 3** | `AI_EXTRACTED` | `0.50` | Unverified AI parsing | Parsed from unstructured artifacts (e.g. Resume PDF/DOCX) by Gemini LLM, strictly grounded against source text. |
| **Tier 4** | `SYSTEM_DERIVED` | `0.70` | Platform algorithmic | Deterministically derived by Nexora logic (project technology promotion, skill gap scoring, readiness indexing). |
| **Tier 5** | `EXTERNALLY_VERIFIED` | `1.00` | Institutional proof | Earned through passing institutional assessments or human technical interviews. |

---

## 3. Precedence & Conflict Resolution Invariants

1. **Hierarchy Precedence**:
   `EXTERNALLY_VERIFIED` > `IMPORTED` > `SYSTEM_DERIVED` > `USER_ENTERED` > `AI_EXTRACTED`.
   A fact from a higher provenance tier strictly supersedes a competing fact from a lower tier.
2. **Non-Downgrade Invariant**:
   A verified skill (e.g. earned via intermediate assessment pass) can **never** be downgraded or overwritten by a subsequent self-reported profile update or unverified AI interview.
3. **Separation of Self-Declared Level from Verified Capability**:
   Self-reported skill levels (e.g. `"expert"`) are preserved in `selfDeclaredLevel` for candidate aspirations, but **never** elevate evidence strength to `verified`.
4. **Project Promotion Rule**:
   Technologies listed under a verified/entered project promote matching skills from `claimed` to `supported` (`SYSTEM_DERIVED`).

---

## 4. Provenance Ledger & Audit Trail
Every compiled canonical state maintains a comprehensive `provenanceLedger` recording:
- `factId`: Unique deterministic identifier
- `entityType`: `'skill'` | `'project'` | `'certification'` | `'academic'`
- `entityKey`: Canonical comparison key (e.g. `'react'`, `'python'`)
- `provenanceTier`: One of the 5 tiers
- `sourceId`: ID of the contributing document (Profile ID, Resume ID, EvidenceCheck ID)
- `timestamp`: Creation/update timestamp
- `confidence`: Mathematical confidence weight (0.0 to 1.0)
- `strength`: `'claimed'` | `'supported'` | `'verified'`
- `payload`: Exact payload contents

---

## 5. Downstream Integration & Backward Compatibility

- **CareerTwin Service**: Consumes canonical student state to project the active digital twin.
- **Skill Gap & Recommendations**: Evaluates target role requirements against canonical verified and supported competencies.
- **Readiness Engine**: Computes role readiness from canonical evidence coverage.
- **Summary / Dashboard**: Directly exposes canonical source counts and top recommendations.
- **Public Projections**: Retains `toPublicProfile` and `toPublicCareerTwin` DTO allow-lists to guarantee zero client contract breakage.

---

## 6. Certification
* **Status**: **FIXED** (Canonical Student Model implemented in `server/src/domain/student/canonicalStudent.js` and verified with automated test suite `server/tests/canonicalStudent.test.js`).
