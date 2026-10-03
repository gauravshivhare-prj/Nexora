# Career Readiness Contract

## Purpose

Career Readiness is a deterministic explanation of the evidence already
available for one catalogue role. It is a projection of the existing
CareerTwin and skill-gap contracts, not an AI judgement and not a second
ranking score.

## Response shape

```js
{
  roleId: 'backend-developer',
  evidenceStatus: 'insufficient_data' | 'partial' | 'supported' | 'verified',
  dataStatus: 'fresh' | 'stale' | 'incomplete',
  required: { total, missing, claimed, supported, verified },
  preferred: { total, missing, claimed, supported, verified },
  blockingSkills: [
    {
      key,
      name,
      importance: 'required',
      status: 'missing' | 'claimed' | 'supported' | 'verified',
      reason,
      evidence,
    },
  ],
  basedOn: {
    careerTwinGeneratedAt,
    catalogueVersion,
    contractVersion: 1,
  },
}
```

`required` and `preferred` counts must equal the corresponding counts from the
existing skill-gap result. `blockingSkills` contains required skills that are
not verified; preferred skills never block the evidence status.

## Evidence rules

The only skill evidence states are `missing`, `claimed`, `supported`, and
`verified`, in increasing strength. Profile or resume assertions are claimed;
project or certification evidence is supported; passing deterministic
assessments or human-evaluated interviews are verified. AI-only interview
output never becomes verified.

The readiness evidence status is derived as follows:

- `insufficient_data`: no usable CareerTwin or role comparison exists.
- `partial`: at least one required skill is missing or claimed.
- `supported`: every required skill is supported or verified, and at least one
  required skill is not verified.
- `verified`: every required skill is verified.

`dataStatus` reports freshness independently. `stale` means the stored
CareerTwin no longer represents current profile, resume, or evidence-check
inputs. `incomplete` is reserved for relevant source data that is pending,
failed, or only partially usable. Missing optional sections must not cause a
crash or invent evidence.

## Mathematical Readiness Score Engine (Tasks 17 & 23)

In addition to qualitative evidence categories, Nexora computes a deterministic, mathematically grounded readiness score in $[0, 100]$ when requested (`?includeScore=true` or via frontend services).

### Evidence Status Weights (`STATUS_WEIGHTS`)

Each skill in the gap analysis is assigned an evidence weight based on its strongest verified provenance:

| Status | Weight | Rationale |
|---|---|---|
| `verified` | **1.00** | Direct verification through passing rigorous assessments or human-evaluated technical interviews ($\ge 75\%$). Represents proven, testable competence. |
| `supported` | **0.65** | Concrete artifact corroboration (code in GitHub repository, live deployed project, or accredited credential). Demonstrates applied usage without formal examination. |
| `claimed` | **0.25** | Self-asserted in student profile or listed in resume text without external artifact link or verification. |
| `missing` | **0.00** | Zero evidence found in any profile or resume source. |

### Contribution Model

Total readiness balances non-negotiable fundamentals against complementary depth:

- **Required Skills (70% Contribution)**:
  $$\text{RequiredScore} = \left( \frac{\sum_{s \in \text{Required}} w(s)}{|\text{Required}|} \right) \times 70$$
- **Preferred Skills (30% Contribution)**:
  $$\text{PreferredScore} = \left( \frac{\sum_{s \in \text{Preferred}} w(s)}{|\text{Preferred}|} \right) \times 30$$
- **Overall Score**:
  $$\text{Score} = \text{round}(\text{RequiredScore} + \text{PreferredScore})$$

### Interview Boost Mechanics

Passing a live technical interview for a required skill adds an interview boost of $+0.35$ to that skill's evidence weight:
$$w_{\text{boosted}}(s) = \min(1.0, w(s) + 0.35)$$
For example, a skill that is currently `supported` ($0.65$) reaches $0.65 + 0.35 = 1.00$ (full verified equivalence) upon passing the interview check.

### Score Bands

- **`interview-ready`** ($90 - 100$): Comprehensive verified and supported skills meeting all baseline job prerequisites.
- **`strong`** ($75 - 89$): Substantial demonstrated evidence across required skills; minor gaps in preferred areas.
- **`developing`** ($25 - 74$): Fundamental claimed or partial supported evidence; requires hands-on projects or verification to achieve job-readiness.
- **`beginning`** ($0 - 24$): Missing evidence across primary required skills.

### Historical Tracking & Snapshots (Task 23)

When readiness is calculated with score evaluation, a historical snapshot is automatically recorded in `ReadinessSnapshot`:

- **Collection**: `readinesssnapshots`
- **Schema**: `user`, `roleId`, `score`, `evidenceStatus`, `band`, `confidence`, `requiredScore`, `preferredScore`, `blockingSkillsCount`, `interviewBoostApplied`, `skillStates`, `createdAt`
- **Endpoints**:
  - `GET /api/readiness/history/:roleId`
  - `GET /api/careers/roles/:roleId/readiness/history`
- **Rate limiting & Deduplication**: Snapshots within a 5-minute window with identical score and status are automatically deduplicated.

## Explicit non-goals

The contract does not use raw LLM output to determine readiness, fabricate evidence, or alter deterministic calculations. All scoring rules are pure functions executed directly against verified domain models.
