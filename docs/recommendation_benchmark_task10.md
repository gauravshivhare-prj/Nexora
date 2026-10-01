# Task 10 — Recommendation Evaluation & Ground-Truth Benchmark System

## Overview & Architectural Scope

Task 10 implements an automated evaluation and ground-truth benchmark framework for Nexora's career recommendation engine (`recommendationBenchmark.js`). Rather than evaluating recommendation quality subjectively, this system establishes rigorous quantitative benchmarks, adversarial boundaries, and regression baselines.

### Key Capabilities
1. **Representative Ground-Truth Student Personas**: Evaluates across distinct engineering, data, design, and infrastructure tracks to verify precision, score calibration, and proper banding.
2. **Adversarial & Boundary Robustness**:
   - *Buzzword Churn*: Tests profiles filled with hyped buzzwords (Quantum AI, Web3, NeuroLink) with zero fundamental skills. Enforces $\text{Score} \le 15$ and 0 ungrounded skills admitted.
   - *Contradictory Intent vs Proven Evidence*: Tests profiles whose stated target role directly contradicts verified evidence (e.g., student target is "Frontend Developer", but holds verified SQL, Node.js, REST APIs and zero frontend skills). Proves that concrete skill fit subordinates contradictory stated intent.
   - *Sparse & Silent Profiles*: Asserts zero false-positive recommendations without throwing errors.
3. **Monotonic Input Sensitivity Verification**: Proves mathematically that promoting skill evidence strength ($S_1: \text{claimed} \rightarrow S_2: \text{supported} \rightarrow S_3: \text{verified}$) strictly increases role match scores monotonically ($S_1 < S_2 < S_3$).
4. **Deterministic Invariance**: Guarantees identical ranking and score breakdown across runs given identical student state.
5. **Quality Gate & Regression Baseline Guard**: Evaluates live recommendations against hard regression baseline thresholds (`RECOMMENDATION_BENCHMARK_BASELINES`), ensuring future prompt or model modifications cannot silently degrade recommendation quality.

---

## Canonical Personas & Ground-Truth Contracts

| Persona ID | Description | Target Track | Expected Rank #1 Role | Expected Score Range | Expected Band |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `persona_foundational_backend` | Beginner CS student learning JS & Node.js basics | Backend Engineering | `backend-developer` | [30, 65] | `promising` |
| `persona_advanced_fullstack` | Senior student with verified React, Node, SQL, Docker, Git | Full Stack Engineering | `full-stack-developer` | [75, 100] | `strong` |
| `persona_non_cs_data_pivot` | Mechanical Engineering student learning Python, SQL, Excel | Data Analytics | `data-analyst` | [40, 75] | `promising` |
| `persona_design_specialist` | Design student with Figma, Wireframing, CSS, UI Design | UI/UX Design | `ui-ux-designer` | [45, 85] | `promising` / `strong` |
| `persona_devops_engineer` | IT student with Docker, Git, Linux, CI/CD, AWS | DevOps / Cloud | `devops-engineer` | [50, 90] | `promising` / `strong` |

---

## Regression Baselines & Gate Criteria

The benchmark runner enforces the following hard invariants (`RECOMMENDATION_BENCHMARK_BASELINES`):

$$\begin{aligned}
\text{Precision@1} &\ge 1.00 \quad (100\%) \\
\text{Precision@3} &\ge 1.00 \quad (100\%) \\
\text{Hallucination Rate} &= 0.00\% \\
\text{Contradiction Failures} &= 0 \\
\text{Monotonicity Score} &= 1.00 \quad (100\%) \\
\text{Explanation Completeness} &= 1.00 \quad (100\%)
\end{aligned}$$

---

## API & Runner Endpoints

- **Service Runner**: `executeBenchmark()` via `recommendation.service.js` invokes `runRecommendationBenchmark()`.
- **Protected Endpoint**: `GET /api/careers/benchmark`
  - Requires valid JWT authentication.
  - Returns complete JSON report with `passedGate: true`, metric scores, per-persona evaluation, and failure diagnostics.

---

## Automated Verification Suite

Verified via `server/tests/recommendationBenchmark.test.js`:
- `1. Representative Ground-Truth Personas Evaluation`: 100% Precision@1 on all 5 student tracks; senior student achieves $\ge 75$ score; non-CS pivot student cleanly maps to Data Analyst.
- `2. Adversarial & Boundary Robustness`: Buzzword profile capped $\le 15$; concrete Backend skills beat contradictory Frontend stated goal; empty profile produces 0 recommendations.
- `3. Monotonic Input Sensitivity & Deterministic Invariance`: Monotonic score progression confirmed ($22 \rightarrow 51 \rightarrow 76$); repeat runs yield identical outputs.
- `4. Automated Benchmark Runner & Regression Gate`: `runRecommendationBenchmark()` passes all quality gates with 0 failures.
- `5. Benchmark API Endpoint Integration`: `GET /api/careers/benchmark` returns 200 with full audit payload; unauthenticated requests rejected with 401.
