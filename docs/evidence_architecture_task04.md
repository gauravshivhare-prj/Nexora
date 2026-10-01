# Task 04 — Evidence Architecture & Evidence Lifecycle Engine

## 1. Executive Summary & Objective

In technical career development, uncorroborated claims undermine trust. A candidate typing "Expert in React" into a profile or having an ungrounded LLM generate a glowing review does not constitute demonstrated engineering competence. 

**Task 04** formalizes the **Claim → Support → Verification** evidentiary lifecycle engine in Nexora. Every competency attribute is tied to an explicit evidence provenance record with calibrated confidence scores, staleness decay horizons, dispute detection, strict anti-AI promotion invariants, and non-downgrade guarantees.

---

## 2. Core Architecture: Claim → Support → Verification

```
  ┌──────────────────────────────────────────────────────────────┐
  │                        EVIDENCE TIERS                        │
  └──────────────────────────────────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
     ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
     │   CLAIMED    │   │  SUPPORTED   │   │   VERIFIED   │
     │  Weight: 0.4 │   │  Weight: 0.7 │   │  Weight: 1.0 │
     │  Conf: ~0.35 │   │  Conf: ~0.70 │   │  Conf: ~0.95 │
     └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
            │                  │                  │
            │  + Tangible      │  + Proctored     │
            │    Artifact      │    Exam / Human  │
            │    (Repo/Cert)   │    Interview     │
            └─────────────────►└─────────────────►│
```

### 2.1 The Three Evidentiary Tiers

| Evidentiary Tier | Sources | Calibrated Confidence | Description | Promotion Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **`CLAIMED`** | `self_declared`, `resume`, `ai_suggestion` | `0.10 - 0.35` | Self-reported statement or AI extraction without external proof. | Baseline tier for user inputs. |
| **`SUPPORTED`** | `project`, `certification`, `ai_interview` | `0.60 - 0.80` | Corroborated by a concrete artifact (GitHub repo, verifiable credential, or AI advisory session). | Must supply verified repo URL, credential ID, or pass AI advisory evaluation. |
| **`VERIFIED`** | `assessment`, `human_interview`, `institutional` | `0.85 - 1.00` | Demonstrable proof validated by deterministic proctored assessment or human technical examiner. | Score $\ge$ passMark (0.70 for assessments, 0.75 for human interviews). |

---

## 3. Strict Institutional Invariants & Policy Boundaries

### 3.1 Anti-AI-Promotion Invariant
> [!IMPORTANT]
> **AI evaluations are strictly ADVISORY.** 
> An AI mock interview, LLM evaluator, or automated chatbot **NEVER** produces `VERIFIED` evidence directly. Even a perfect score (1.0) awarded by an AI evaluation yields `strength: 'supported'`, `isAdvisory: true`, and `outcome: 'uncertain'`. Only a human examiner or a deterministic proctored code assessment engine can grant `VERIFIED` status.

### 3.2 Non-Downgrade Invariant
> [!TIP]
> Once a student earns `VERIFIED` status for a competency (e.g. scored 92% on a proctored React assessment), submitting a subsequent weaker claim (such as a resume update with a lower self-rating or an unverified hobby project) **CANNOT downgrade** the verified status. The skill retains `effectiveStrength: 'verified'`.

### 3.3 Dispute & Contradiction Detection
When a student self-claims a skill (`CLAIMED`), but fails consecutive proctored evaluations with a score below threshold without any passing record:
- The skill evidence state is flagged `isDisputed: true`.
- Status is updated to `EVIDENCE_STATUS.DISPUTED`.
- Composite confidence is severely penalized ($\le 0.25$).

### 3.4 Staleness Horizons & Confidence Decay
Skills decay over time if not refreshed. Nexora enforces distinct expiration horizons:
- **Proctored Assessments**: 180 days (retention check)
- **Technical Interviews**: 365 days
- **Projects**: 365 days
- **Certifications**: 730 days (2 years)
- **Self-Declared Claims**: 90 days (if uncorroborated)

When a record passes its expiration horizon:
- `isStale: true`
- Confidence decays by a factor of 20% ($0.80 \times \text{confidence}$).
- Downstream readiness and roadmap systems prompt the student for a refresher challenge.

### 3.5 Invalidation Engine & Audit Trail
Administrators or students can formally invalidate evidence records (e.g., duplicate entries, disputed attempts, proctoring violations):
- Sets `status: 'invalidated'`, records `invalidatedAt`, `invalidationReason`, and `invalidatedBy`.
- Invalidated records are **immediately excluded** from `loadVerifiedEvidence()` and CareerTwin synthesis.
- Maintains an append-only `auditTrail` on each record.

---

## 4. API Endpoints & Contracts

All endpoints require standard `Bearer <JWT>` authentication.

### 4.1 `POST /api/skill-evidence/claim`
Student registers a self-declared competency claim.
```json
// Request
{
  "skill": "React",
  "detail": "Studied React hooks and component lifecycle"
}

// Response (201 Created)
{
  "success": true,
  "message": "Skill claim recorded",
  "data": {
    "evidence": {
      "id": "6abdde7347d5db39cd60c446",
      "canonicalSkillId": "sk_react",
      "skillKey": "react",
      "skillName": "React",
      "strength": "claimed",
      "status": "active",
      "confidence": 0.35,
      "eligibleForVerified": false
    }
  }
}
```

### 4.2 `POST /api/skill-evidence/support`
Student submits a tangible project repository or certification credential.
```json
// Request
{
  "skill": "React",
  "source": "project",
  "repoUrl": "https://github.com/student/nexora-fe",
  "detail": "Production React dashboard with state management"
}

// Response (201 Created)
{
  "success": true,
  "message": "Supporting artifact recorded",
  "data": {
    "evidence": {
      "id": "6abdde7347d5db39cd60c447",
      "canonicalSkillId": "sk_react",
      "strength": "supported",
      "confidence": 0.70
    }
  }
}
```

### 4.3 `POST /api/skill-evidence/:evidenceId/invalidate`
Invalidates an evidence record with mandatory reason.
```json
// Request
{
  "reason": "Student requested deletion of deprecated certification"
}

// Response (200 OK)
{
  "success": true,
  "message": "Evidence record invalidated",
  "data": {
    "evidence": {
      "id": "6abdde7347d5db39cd60c446",
      "status": "invalidated",
      "invalidationReason": "Student requested deletion of deprecated certification"
    }
  }
}
```

### 4.4 `GET /api/skill-evidence/summary`
Returns the consolidated evidence state across all student competencies, including composite confidence, active evidence breakdown, and next refresh due dates.

---

## 5. Verification & Automated Test Suite

The test suite in [`server/tests/evidenceLifecycle.test.js`](file:///c:/Users/akans/OneDrive/Desktop/Nexora/server/tests/evidenceLifecycle.test.js) validates all 9 key requirements:
1. **Claim $\to$ Support $\to$ Verification Transitions** (Pass)
2. **Anti-AI-Promotion Invariants** (Pass)
3. **Non-Downgrade Invariants** (Pass)
4. **Dispute Detection for Failing Claims** (Pass)
5. **Staleness Horizons & Confidence Decay** (Pass)
6. **Invalidation Engine & Audit Trail** (Pass)
7. **Multi-Tenant IDOR Protection** (Pass)
8. **Canonical Skill Ontology Integration & Validation** (Pass)
9. **Full Ledger Recomputation** (Pass)
