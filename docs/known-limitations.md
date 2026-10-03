# Nexora — Known Limitations & Operational Bounds

**Document Classification**: User-Facing & Institutional Transparency Disclosure  
**Target Audience**: Students, Educational Institutions, Academic Administrators, Platform Operators  
**Version**: 1.0.0-PROD  
**Last Updated**: October 2026

---

## 1. Core Platform Philosophy: Grounded Truth vs. Speculative AI

Nexora is built on an **evidence-based, deterministic foundation**. Unlike platforms that use opaque "AI magic" to guess job placement odds or invent capabilities, Nexora enforces strict mathematical explainability.

This document clearly outlines what the platform does, what it does **not** do, and its verified operational boundaries.

---

## 2. AI Intelligence & Evaluation Bounds

### 2.1 Deterministic Matcher (Not Generative Speculation)
- **How Recommendations Work**: Nexora computes career role matches using an **explainable 5-dimensional rule-based heuristic** ($45\%$ required skills, $20\%$ preferred skills, $20\%$ evidence quality, $10\%$ interest alignment, $5\%$ background alignment).
- **What It Does Not Do**: The platform does **not** predict "future employability percentages", "hiring likelihoods", or "salary ranges". Market speculation (LPA claims, job opening counts) is strictly forbidden across all features.
- **Explainability**: Every recommendation exposes explicit arithmetic point contributions so students can independently verify how their score was calculated.

### 2.2 LLM Assistant Boundary (Google Gemini)
- **Role of the LLM**: Large Language Models are used strictly for **unstructured entity extraction** (reading resume text) and **interview response rubric grading** (assessing technical depth, clarity, relevance).
- **Hard Institutional Boundary**: An LLM is **never permitted to certify a skill directly**. Skill verification requires independent assessments or objective evidence checks with reproducible passing rubrics.
- **Anti-Hallucination Guardrails**: Any skill returned by an LLM that is not in the canonical skill taxonomy is automatically dropped. Proposals with >50% ungrounded skills are rejected outright.

### 2.3 Per-User AI Quota & Graceful Fallback
- **Daily Quota**: To prevent automated abuse and control infrastructure costs, each student is allocated up to **50 AI evaluations per 24-hour rolling window** (approx. $0.50 daily budget).
- **Graceful Fallback**: When the quota is reached or if the external AI provider experiences an outage, Nexora automatically falls back to deterministic rule-based analysis without blocking the student's core workflow.

---

## 3. Taxonomy, Catalogue & Opportunity Scope

### 3.1 Canonical Skill Taxonomy Scope
- **Curated Dictionary**: Nexora maintains a curated canonical taxonomy of **132 software engineering skills** (`SKILL_TAXONOMY_VERSION = 2`).
- **Limitation**: Niche proprietary tools, emerging frameworks (< 12 months old), and generic non-technical descriptors not present in the canonical ontology cannot be assigned verified strength.
- **Normalization**: Skills with varying spellings (e.g. `node`, `Node.js`, `NodeJS`) are normalized to a single canonical representation (`Node.js`).

### 3.2 Role Catalogue Scope
- **Curated Roles**: Exactly **10 software engineering roles** are officially supported:
  1. Frontend Developer
  2. Backend Developer
  3. Full Stack Developer
  4. Mobile Developer
  5. DevOps Engineer
  6. Data Analyst
  7. Data Engineer
  8. Machine Learning Engineer
  9. QA / Test Automation Engineer
  10. UI/UX Designer
- **Limitation**: Non-technical careers (sales, management, finance) are deliberately outside the scope of this engine.

### 3.3 Internal Practice Opportunities
- **Curated Internal Practicums**: Opportunities listed in Nexora are curated internal practice exercises designed to bridge skill gaps.
- **Not a Live Job Board**: Nexora is **not** an automated job scraper or live job board (e.g. LinkedIn, Indeed). It does not submit job applications on behalf of students.

---

## 4. Scalability & Operational Constraints

### 4.1 Deployment Tier Limits
- **Single-Instance Limit (Current Architecture)**: In-memory rate limiting and metrics tracking run per-process. The platform comfortably supports up to **1,000 active concurrent students** on a single node.
- **Multi-Instance Roadmap**: Scaling to 10,000+ users requires provisioning Redis for shared rate limiting and MongoDB Atlas Dedicated Cluster for read replicas.

### 4.2 File Upload Boundaries
- **Resume Upload Limits**: Maximum file size is strictly capped at **5 MB**. Only `.pdf`, `.docx`, and `.txt` MIME types are permitted.
- **Execution Sandboxing**: Server does not execute candidate code inside arbitrary containers in Phase 1; coding assessments evaluate structured solutions, test assertions, and algorithmic traces.

---

## 5. Continuous Improvement System & Issue Triage

Nexora employs a structured continuous improvement protocol:

```
[ User/Educator Feedback / Anomaly ]
                 │
                 ▼
       [ Issue Classification ]
        ├── A: Canonical Skill Missing ──────► RFC Taxonomy Addition
        ├── B: Evaluation Discrepancy ──────► Benchmark Golden Fixture
        └── C: System / Operational Bug ─────► Automated Regression Test
                 │
                 ▼
     [ 100% Gated CI Release Cycle ]
```

### 5.1 Proposing Skill Additions (Taxonomy RFC)
Educational institutions or students proposing a new canonical skill must submit:
1. Canonical display name and aliases/synonyms.
2. Domain category and difficulty tier.
3. Prerequisite skills in the canonical ontology.
4. Objective verification criteria (how evidence is tested).

### 5.2 Reporting Evaluation Anomalies
If an evaluation appears inaccurate:
- Report the specific `X-Request-Id` and `roleId`.
- The evaluation will be added as a synthetic regression case in `server/tests/fixtures/evaluationCalibration.js`.
- The benchmark runner (`runRecommendationBenchmark()`) ensures fixes cannot degrade existing baseline accuracy.
