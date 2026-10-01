# Task 13 — Gemini Intelligence Architecture & AI Boundary Redesign

## Architectural Scope & Objectives
Task 13 establishes the formal **Gemini Intelligence Architecture & AI Boundary System** (`server/src/domain/ai/aiContracts.js`). It creates a strict separation between **AI Generation** and **Canonical Domain Decision-Making**. 

In Nexora:
- **AI Models CANNOT establish ground truth**. All skills, evidence tiers, role requirements, readiness metrics, and learning progressions are governed by deterministic domain engines.
- Every AI invocation must register an explicit immutable **AI Contract** specifying its purpose, allowed authority tier, input contracts, sanitizers, output schemas, token/character context bounds, and failure behavior.
- Versioning is attached to every prompt builder and completion record to enable model regression tracking.

---

## The AI Contract Registry

| Contract ID | Purpose | Authority Tier | Context Limits | Allowed Downstream Usage | Strictly Forbidden Usage |
|---|---|---|---|---|---|
| `ai_contract_resume_extraction` (v2.1.0) | Extract stated qualifications, education, and skills from candidate resume text | `EXTRACTION_CLAIMED` | Max 100k chars input, 4096 output tokens, 30s timeout | Create `claimed` evidence tier, store parsed resume data | Direct verification promotion, bypassing grounding, inventing skills, assigning proficiency |
| `ai_contract_interview_evaluation` (v2.0.0) | Evaluate verbal/written answers against rubric criteria | `ADVISORY_EVALUATION` | Max 15k chars input, 1024 output tokens, 15s timeout | Produce `ai_interview_advisory` evidence, record feedback | Overwrite deterministic assessment scores, grant verified tier alone, alter role requirements |
| `ai_contract_careertwin_narrative` (v2.0.0) | Synthesize 2-3 sentence introductory summary of computed CareerTwin | `PRESENTATION_ONLY` | Max 5k chars input, 500 output tokens, 10s timeout | Display in student dashboard header | Career matching, skill gap calculation, roadmap generation, readiness score |
| `ai_contract_role_proposal` (v1.1.0) | Draft emerging career role requirements for editorial review | `PROPOSAL_ONLY` | Max 2k chars input, 2048 output tokens, 20s timeout | Administrative draft review queue | Automatic publication, recommendation intake, readiness calculation |

---

## Authority Boundary Enforcement (`assertAiBoundary`)
- `assertAiBoundary(contractId, attemptedAction)` acts as a domain firewall preventing downstream subsystems from misusing AI outputs.
- `establish_canonical_truth` is rejected with an explicit boundary error for all AI contracts.
- Attempting to pass AI narrative into career matching or skill gap engines throws a security violation.
- Attempting to promote resume extraction directly to verified evidence throws a security violation.

---

## Verification & Automated Test Coverage
- Test Suite: `server/tests/aiContracts.test.js` (9 comprehensive tests passing)
- Regression Suites:
  - `server/tests/aiOutputValidation.test.js` (25 tests passing)
  - `server/tests/resumeGroundedExtraction.test.js` (8 tests passing)
- Verified Behaviors:
  1. Registry immutability and contract parameter integrity.
  2. Authority tier enforcement and prohibition of ground-truth invention.
  3. Context bounds enforcement (capping `maxOutputTokens`).
  4. Contract ID and prompt version metadata pass-through in completions.
