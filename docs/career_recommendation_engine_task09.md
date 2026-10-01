# Task 09 — Career Recommendation Engine: Correctness, Explainability & Independent Validation

## Overview & Architectural Scope

Task 09 transforms Nexora's career recommendation engine from basic matching into a verified, grounded, and explainable decision system:
1. **Mathematical Traceability & Point Contributions**: Every recommendation exposes explicit mathematical point contributions for each scoring dimension (`requiredSkills`, `preferredSkills`, `evidenceStrength`, `interestAlignment`, `backgroundAlignment`), proving how the total score was derived.
2. **Deterministic Multi-Tier Tie Breaking**: Ties are resolved by a 5-tier deterministic hierarchy (`score` desc -> `requiredSkills` coverage desc -> `evidenceStrength` desc -> `title` alphabetical asc -> `roleId` alphabetical asc), completely eliminating non-deterministic ranking flip-flops.
3. **Independent Validation & Anti-Hallucination Layer (`recommendationValidator.js`)**: An autonomous verification layer audits all recommendations and AI proposals before they reach students:
   - **Grounded Skill Verification**: Verifies that every skill cited in `matchedRequired` and `matchedPreferred` exists in the student's canonical CareerTwin.
   - **Evidence Strength Invariants**: Asserts that claimed skill strength does not exceed the CareerTwin's actual evidence strength (`verified` > `supported` > `claimed`).
   - **Prerequisite Competency Defense**: Evaluates role prerequisites against the student's held skills and ontology dependencies; penalizes missing foundational competencies.
   - **Authoritative Catalogue Guard**: Disallows proposals referencing uncurated, unpromoted, or draft roles.
   - **Hallucination Detection & Rejection**: Automatically applies a penalty downgrade for unsupported skills and outright rejects proposals where >50% of claimed skills are hallucinations.
4. **Missing-Data Behavior & Restraint**: Explicit null/missing academic data receives a neutral background score (50%), preventing unfair penalization of incomplete profiles, while explicit non-matching backgrounds receive 0. Market speculation (salary, openings, demand) remains strictly forbidden.

---

## Data Contracts & Scoring Dimensions

### 1. Scoring Dimensions & Weights

The total score $S \in [0, 100]$ is computed deterministically from 5 weighted dimensions:

$$\text{Score} = \text{round}\left( \sum_{i=1}^5 d_i \cdot w_i \times 100 \right)$$

| Dimension | Weight ($w_i$) | Semantic Definition | Missing Data Fallback |
| :--- | :--- | :--- | :--- |
| `requiredSkills` | 0.45 | Ratio of student's held required skills to role required skills | 0 |
| `preferredSkills` | 0.20 | Ratio of student's held preferred skills to role preferred skills | 0 |
| `evidenceStrength` | 0.20 | Mean credit across matched skills (`verified`: 1.0, `supported`: 0.7, `claimed`: 0.35) | 0 (when no matched skills) |
| `interestAlignment` | 0.10 | 1.0 for stated target role, 0.5 for matching interest keyword | 0 |
| `backgroundAlignment` | 0.05 | Field of study alignment with common backgrounds | Neutral 0.5 (if unspecified); 0 (if non-matching) |

### 2. Traceable Explanation Contract

Each match payload includes a comprehensive `traceableExplanation` block:
```json
{
  "summaryReason": "Matches 3 of 4 required skills with strong project evidence.",
  "contributingPoints": {
    "requiredSkills": 33.8,
    "preferredSkills": 10.0,
    "evidenceStrength": 14.0,
    "interestAlignment": 10.0,
    "backgroundAlignment": 2.5
  },
  "totalPoints": 70,
  "prerequisites": {
    "satisfied": ["sk_programming_fundamentals"],
    "missing": []
  },
  "constraintsConsidered": {
    "hasTargetRoles": true,
    "interestsCount": 2,
    "totalSkillsAnalyzed": 6
  }
}
```

---

## Independent Validation Layer (`recommendationValidator.js`)

The validation pipeline enforces anti-hallucination and prerequisite invariants:

```
[ AI / Engine Recommendation Proposal ]
                    │
                    ▼
       Authoritative Role Check? ─── No ──► [ REJECT: UNAUTHORITATIVE_ROLE ]
                    │ Yes
                    ▼
     Grounded Skill Verification? ─── >50% Hallucinations ──► [ REJECT: UNGROUNDED_HALLUCINATIONS ]
                    │
                    ▼
     Evidence Strength Invariants? ─── Exaggerated ──► [ AUDIT WARNING ]
                    │
                    ▼
    Prerequisite Competency Check? ─── Missing ──► [ PENALTY DOWNGRADE ]
                    │
                    ▼
       [ ACCEPTED / DOWNGRADED MATCH with Full Audit Trail ]
```

---

## Automated Verification Suite

Verified via `server/tests/careerRecommendationEngine.test.js`:
- `1. Traceable Explanations & Scoring Dimensions`: Validated exact arithmetic point contributions and neutral missing-data handling.
- `2. Multi-tier Deterministic Tie-Breaking`: Validated stable descending score ordering and alphabetical tie-breaking across runs.
- `3. Independent Validation & Anti-Hallucination Layer`: Validated acceptance of grounded matches, detection and downgrade of hallucinated skills, and rejection of proposals targeting unauthoritative roles.
- `4. End-to-End Recommendations API Integration`: Validated live endpoints `GET /api/careers/recommendations` and `GET /api/careers/roles/:roleId/match` with token authentication and CareerTwin generation.
- Full regression suite pass across `recommendation.test.js`, `recommendation.validation.test.js`, and `recommendationEdgeCases.test.js`.
