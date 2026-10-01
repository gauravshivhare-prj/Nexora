# Task 11 — Complete Skill-Gap Intelligence Engine

## Overview & Architectural Scope

Task 11 rebuilds Nexora's skill-gap intelligence engine (`computeSkillGap.js`) into a multi-dimensional, grounded comparison engine:
1. **Canonical Skill Mapping & Anti-Inference Protection**:
   - Resolves skills using the canonical ontology DAG (`skillOntology.js`).
   - Anti-Inference Invariant: Skills are NEVER marked as satisfied solely because an AI model inferred or guessed them. Only grounded evidence (`CLAIMED`, `SUPPORTED`, `VERIFIED`) with genuine provenance counts.
   - Cross-Module Grounding Invariant: The engine NEVER reports a skill as `MISSING` if the CareerTwin holds valid current evidence for it.
2. **Partial Satisfaction & Proficiency Gaps**:
   - Compares the student's demonstrated or self-declared proficiency against the target role's `proficiencyExpectations` (`overallMinimum` and per-skill expectations).
   - If actual proficiency is below role expectation (e.g. beginner vs intermediate), flags `proficiencyGap.hasDeficit = true` and classifies `satisfactionState = 'partially_satisfied'`.
3. **Prerequisite Gaps & Dependency Blockers**:
   - Recursively inspects the skill ontology DAG for prerequisite dependencies.
   - If a student targets an advanced skill (e.g. React or Node.js) but lacks foundational competencies (`Programming Fundamentals`, `JavaScript`, `HTML/CSS`), the engine flags `prerequisiteGaps` and `hasPrerequisiteBlocker = true`.
4. **Evidence Staleness & Conflict Detection**:
   - **Staleness**: Flags evidence older than 24 months (`730 days`) as `isStale = true` with concrete refresher recommendations.
   - **Conflict Detection**: Detects discrepancies between self-claimed levels and lower verification results (e.g. self-declared `expert` with an assessment score $< 50\%$).
5. **Exact Actionable Remediation**:
   - Every skill gap carries an explicit `actionableRemediation` and `suggestedEvidence` list explaining exactly what concrete evidence would close the gap.
6. **Enriched Summary Metrics**:
   - Reports `total`, `missing`, `claimed`, `supported`, `verified`, `partiallySatisfied`, `prerequisiteBlockersCount`, and `staleEvidenceCount` without fabricating misleading single-percentage readiness figures.

---

## Data Contracts & Gap States

### Gap Status & Satisfaction States

```
GAP_STATUS:
  ├── MISSING   (no evidence found)
  ├── CLAIMED   (listed on profile without project/cert backing)
  ├── SUPPORTED (backed by project or certification)
  └── VERIFIED  (proven by passed assessment or structured interview)

SATISFACTION_STATE:
  ├── MISSING              (status is MISSING)
  ├── PARTIALLY_SATISFIED  (status is CLAIMED, or proficiency deficit exists, or missing prerequisites)
  └── SATISFIED            (status is SUPPORTED/VERIFIED, proficiency meets role expectation, prerequisites met)
```

### Assessed Skill Output Schema

```json
{
  "key": "nodejs",
  "canonicalId": "sk_nodejs",
  "name": "Node.js",
  "importance": "required",
  "status": "supported",
  "satisfactionState": "partially_satisfied",
  "yourSkill": "Node.js",
  "selfDeclaredLevel": "beginner",
  "expectedLevel": "intermediate",
  "proficiencyGap": {
    "hasDeficit": true,
    "expected": "intermediate",
    "actual": "beginner",
    "reason": "Role expects intermediate proficiency, but current demonstrated level is beginner."
  },
  "prerequisiteGaps": [],
  "hasPrerequisiteBlocker": false,
  "isStale": false,
  "conflictingEvidence": { "hasConflict": false, "detail": null },
  "evidence": [
    {
      "source": "project",
      "strength": "supported",
      "detail": "REST API service"
    }
  ],
  "reason": "You have pointed at concrete work involving Node.js. However, Role expects intermediate proficiency...",
  "actionableRemediation": "Deepen practical implementation to advance from beginner to intermediate level.",
  "suggestedEvidence": [ ... ]
}
```

---

## Automated Verification Suite

Verified via `server/tests/skillGapEngine.test.js`:
- `1. Proficiency Deficit & Partial Satisfaction`: Validated deficit detection when student is below role expectation, and full satisfaction when expectations and prerequisites are met.
- `2. Prerequisite Gaps & Blockers`: Validated prerequisite blocker identification for missing foundational competencies (e.g. React missing HTML/CSS/Programming Fundamentals).
- `3. Stale Evidence & Conflicting Evidence`: Validated detection of $>24$ month old evidence and conflicts between expert claims and failing assessment scores.
- `4. Anti-Inference & Cross-Module Invariant`: Validated rejection of ungrounded AI inferences and confirmed CareerTwin held skills are never reported missing.
- `5. End-to-End API Integration`: Validated live endpoint `GET /api/careers/roles/:roleId/skill-gap` with JWT authentication and CareerTwin generation.
- Full regression verification across `skillGap.test.js`, `skillGap.validation.test.js`, and `skillGapQuality.test.js`.
