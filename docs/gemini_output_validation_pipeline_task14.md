# Task 14 — Gemini Output Validation, Hallucination Control & Business Validation

## Architectural Scope & Objectives
Task 14 implements a unified, reusable **Multi-Stage AI Output Validation Pipeline** (`server/src/domain/ai/aiValidationPipeline.js`) that enforces rigorous hallucination control, business constraint checks, prerequisite graph conformity, and security auditing across all AI-generated payloads.

---

## The 6 Validation Stages

```
   Raw Model Output (String / JSON)
                 │
                 ▼
┌─────────────────────────────────┐
│ 1. SYNTAX & BOUNDS CHECK        │ ➔ Rejects unclosed JSON, bare scalars, oversized payloads (>200k chars),
│    (aiJson & Prototype Defense) │   and prototype pollution (`__proto__`, `prototype`, `constructor`).
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ 2. SCHEMA & NUMERIC RANGE CHECK │ ➔ Enforces contract required keys, string length caps, array bounds,
│    (Type & Mathematical Bounds) │   and numeric intervals ([0.0, 1.0] score bounds, graduation year bounds).
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ 3. DOMAIN TAXONOMY VALIDATION   │ ➔ Normalizes competencies against master ontology (`skillOntology.js`);
│    (Ontology & Alias Matching)  │   drops fake/unrecognized frameworks.
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ 4. GROUNDING & EVIDENCE CHECK   │ ➔ Matches extracted facts against source text spans; validates that
│    (Source Text & Twin State)   │   CareerTwin summaries mention ONLY skills present in student twin.
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ 5. PREREQUISITE & DAG AUDIT     │ ➔ Verifies that proposed sequences do not invert dependency order
│    (Ontology DAG Enforcement)   │   (e.g., React cannot precede JavaScript).
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ 6. CONSISTENCY & SAFETY AUDIT   │ ➔ Scans for prompt injection tokens and detects internal semantic
│    (Injection & Contradiction)  │   contradictions (e.g. overallScore >= 0.8 with failing feedback comments).
└────────────────┬────────────────┘
                 │
                 ▼
       Verified Output Payload
```

---

## Safe Fallback & Uncertain Behavior
- **`AI_FAILURE_POLICY.OMIT_PRESENTATION`**: For non-decision presentation elements (such as `CAREERTWIN_NARRATIVE`), any validation failure omits the narrative cleanly without throwing errors or interrupting core product flows.
- **`AI_FAILURE_POLICY.REJECT_WITH_502`**: For candidate extraction, invalid/untrustworthy outputs fail cleanly with 502, preserving student records from data corruption.
- **`AI_FAILURE_POLICY.SAFE_SERVICE_UNAVAILABLE`**: For live interview evaluations, timeouts or provider errors return safe 503 without revealing prompt internals or stacks.

---

## Verification & Automated Test Coverage
- Test Suite: `server/tests/aiValidationPipeline.test.js` (10 tests passing)
- Co-tested Suites:
  - `server/tests/aiContracts.test.js` (9 tests passing)
  - `server/tests/aiOutputValidation.test.js` (25 tests passing)
- Coverage across all 6 pipeline stages:
  1. Syntax parsing and prototype pollution security rejection.
  2. Schema completeness and numeric range bounds.
  3. Non-canonical skill filtering.
  4. Hallucination dropping against resume source text and CareerTwin state.
  5. Prerequisite DAG inversion rejection.
  6. Injection defense and contradiction detection.
