# Task 12 — Skill Priority, Dependency & Learning-Order Engine

## Architectural Scope & Objectives
The **Skill Priority, Dependency & Learning-Order Engine** (`server/src/domain/roadmap/skillPriorityEngine.js`) converts unordered, raw skill-gap lists into deterministic, pedagogically sound, and explainable learning sequences. It eliminates generic random orderings, respects strict directed acyclic graph (DAG) prerequisites from the canonical skill ontology, adapts to student time commitments, and provides clear `whyBefore` reasoning for every scheduled competency.

---

## Key Engineering Deliverables

### 1. Multi-Factor Priority Scoring Model
Every candidate gap is evaluated across four distinct weighted dimensions:
- **Downstream Unblocking Influence (DAG centrality)**: Boosts skills that act as prerequisites for multiple other competencies in the target role (+15 points per dependent skill, capped at +45).
- **Role Requirement Tier**: `required` (+50 points) prioritized ahead of `preferred` (+20 points).
- **Prerequisite Readiness**: If all foundational prerequisites are already satisfied or held by the student (+30 points); penalized (-40 points) if upstream prerequisites are unlearned.
- **Student Career Goal Alignment**: Matching student goal keywords grants immediate focus priority (+15 points).

### 2. Kahn's Topological Sorting with Dynamic Priority Queuing
- Builds an in-memory dependency graph connecting required prerequisites to downstream dependents.
- Employs a Kahn's topological sort driven by a priority max-heap/sorted ready-queue.
- Guaranteed: No skill is ever scheduled ahead of its prerequisite (e.g., Programming Fundamentals precedes JavaScript; JavaScript and HTML/CSS precede React).
- Safe fallback handles edge cases and isolates any cycle attempts.

### 3. Pacing & Time-Constraint Adaptation
- Calculates realistic milestone pacing given `availableHoursPerWeek` (bounded between 5 and 40 hrs/week).
- Assigns banded learning effort hours:
  - `missing`: Substantial effort (40 hrs)
  - `claimed`: Moderate effort (20 hrs)
  - `supported` (partial): Quick polish (10 hrs)
- Computes cumulative effort and projects estimated weeks for each sequential milestone.

### 4. Sequence Verification & Inversion Detection
- `validateLearningSequence(sequence)` audits any proposed sequence (including external or AI-proposed roadmaps).
- Detects dependency inversions and produces structured violation payloads (`DEPENDENCY_INVERSION`, `CIRCULAR_DEPENDENCY`).

### 5. Deterministic Why-Before Explanations
- Every sequenced milestone is annotated with an explicit `whyBefore` explanation explaining why it appears at this exact position:
  - Prerequisite foundational unblocker
  - Direct extension of recently acquired prerequisites
  - Core role requirement
  - Distinguishing specialization

---

## Verification & Automated Test Coverage
- Test Suite: `server/tests/skillPriorityEngine.test.js` (9 comprehensive tests passing)
- Regression Suite: `server/tests/roadmap.test.js` (31 tests passing) and `server/tests/aiOutputValidation.test.js` (25 tests passing)
- Verification areas covered:
  1. Monotonic topological DAG ordering (`Fundamentals < JavaScript < Node.js < Express.js`).
  2. Multi-factor priority score boosting and unready prerequisite penalization.
  3. Dynamic pacing adaptation (5 hrs/week vs 25 hrs/week timeline compression).
  4. Detection of inverted sequences (`React` scheduled ahead of `JavaScript`).
  5. Traceable `whyBefore` attribution for each milestone.
