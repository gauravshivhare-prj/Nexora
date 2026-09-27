# Nexora — Quality & Limitations Report

**Document Version**: 1.0  
**Target Release**: MVP (Phase 1–9 Verification & Delivery)  
**Classification**: Engineering & Architectural Transparency Report  

---

## Executive Summary

Nexora is designed as an **evidence-based, deterministic career readiness and employability platform**. Its core mission is to provide students with transparent, verifiable insight into their technical capabilities, skill gaps, and career readiness.

To maintain integrity, student trust, and institutional credibility, this report formally documents the verified boundaries, architectural constraints, external dependencies, and deliberate non-goals of the Nexora platform. Specifically, this document:
1. **Clarifies Machine Learning Capabilities**: Clarifies that Nexora's recommendation, gap, and readiness engines use deterministic, explainable mathematical heuristics and set theory rather than speculative, black-box deep learning or generative statistical approximations.
2. **Defines Curated Taxonomy Scope**: Details the exact boundaries of the canonical skill taxonomy (`SKILL_TAXONOMY_VERSION = 2`), role catalogue (`CATALOGUE_VERSION = 1`), and assessment banks.
3. **Documents External AI Dependencies**: Analyzes the platform's reliance on external Large Language Models (Google Gemini), rate limits, failure modes, prompt injection defenses, and the strict institutional boundary that forbids AI output from directly certifying skills.
4. **Outlines Operational & Runtime Limitations**: Identifies in-memory rate limiting, code execution constraints, attempt caps, text-only interview formats, and lack of live external job-board scraping.

---

## 1. Machine Learning & Recommendation Capabilities (Zero Exaggeration)

Modern educational technology frequently overstates "AI" and "Machine Learning" capabilities, claiming predictive algorithms that "foresee hiring success" or "AI models that match candidates to jobs with neural precision." **Nexora explicitly rejects this approach.**

### 1.1 Deterministic 5-Dimensional Heuristic (Not Deep Learning)
The career recommendation engine (`server/src/domain/careers/matchRole.js`, `scoring.js`) does **not** employ a deep neural network, matrix factorization, or collaborative filtering model trained on proprietary user behavior data. Instead, it is an **explainable, deterministic 5-dimensional rule-based heuristic**:

$$\text{MatchScore} = 0.45 \cdot S_{\text{required}} + 0.20 \cdot S_{\text{preferred}} + 0.20 \cdot E_{\text{strength}} + 0.10 \cdot I_{\text{alignment}} + 0.05 \cdot B_{\text{background}}$$

- **Required Skills Match ($45\%$)**: Arithmetic fraction of the role's required skills present in the student's CareerTwin.
- **Preferred Skills Match ($20\%$)**: Arithmetic fraction of the role's preferred skills present in the student's CareerTwin.
- **Evidence Strength Weight ($20\%$)**: Normalized mean credit of matched skills based on concrete proof:
  - `claimed`: 0.40 credit
  - `supported`: 0.80 credit
  - `verified`: 1.00 credit
- **Interest Alignment ($10\%$)**: Categorical keyword overlap between candidate career interests and role metadata.
- **Academic Background ($5\%$)**: Alignment between academic degree/branch and target role prerequisites.

**Why this design?**
- **Explainability**: Every score component is directly broken down and surfaced to the student in human-readable terms (`matchBreakdown`).
- **Reproducibility**: The identical CareerTwin evaluated against the identical role catalogue produces the exact identical score and rank 100% of the time (`tests/repeatabilityValidation.test.js`).
- **Auditability**: Educational institutions can inspect why a student received a specific recommendation without opacity.

### 1.2 Explainable Baseline Evaluation (Not Model Overfitting)
In `server/tests/mlBaseline.validation.test.js`, the test suite reports $100\%$ top-1 accuracy on labeled synthetic profile fixtures (`BASELINE_EVALUATION_FIXTURES`).
- **Transparency Note**: This metric evaluates the mathematical fidelity of the explainable heuristic against canonical archetypes; it does **not** claim statistical generalization across unseen, noisy, real-world population distributions.
- No model training or gradient descent takes place in Nexora's core matching service.

### 1.3 Categorical Set Theory for Skill Gaps & Roadmaps
- **Skill Gap Engine (`computeSkillGap.js`)**: Employs classical discrete set difference between role requirement sets and CareerTwin skill sets. It assigns categorical statuses (`missing`, `claimed`, `supported`, `verified`) without probabilistic speculation.
- **Roadmap Engine (`buildRoadmap.js`)**: Applies deterministic topological prerequisite closure. Foundation prerequisites strictly precede advanced dependencies. Item effort estimations (`quick`, `moderate`, `substantial`) are rule-based metadata tags, not generative plans.
- **Readiness Engine (`computeReadiness.js`)**: Projects readiness strictly as a 4-state enum (`insufficient_data`, `partial`, `supported`, `verified`). It deliberately omits composite percentages, numerical scores, or speculative employability probabilities.

---

## 2. Curated Taxonomy & Catalogue Scope

Nexora enforces strict canonical data models to prevent taxonomy drift and hallucinated technical skills. However, this precision comes with deliberate scope boundaries:

### 2.1 Canonical Skill Taxonomy (`SKILL_TAXONOMY_VERSION = 2`)
- **Authoritative Vocabulary**: `server/src/domain/skills/skillKey.js` maintains a curated dictionary of **132 canonical technical skills** across standard engineering domains (Web, Backend, Frontend, Cloud/DevOps, Database, Mobile, Systems, Security, Core Computer Science).
- **Normalization Invariant**: All input strings are normalized via `skillKey(name)` and mapped to canonical display names via `canonicalSkill(name)`.
- **Known Scope Limitation**:
  - Emerging technologies, highly specialized libraries, internal enterprise frameworks, or non-technical soft skills not present in the 132-skill dictionary cannot achieve canonical representation.
  - Unrecognized skills uploaded via resumes are either mapped to their closest canonical equivalent (e.g. `postgres` $\to$ `PostgreSQL`) or discarded from verified evaluation pipelines as ungrounded strings.

### 2.2 Career Role Catalogue (`CATALOGUE_VERSION = 1`)
- **Catalogue Size**: Exactly **10 software engineering roles** are defined in `server/src/domain/careers/roleCatalogue.js`:
  1. `frontend-developer`
  2. `backend-developer`
  3. `fullstack-developer`
  4. `mobile-developer`
  5. `devops-engineer`
  6. `data-engineer`
  7. `machine-learning-engineer`
  8. `qa-automation-engineer`
  9. `cloud-architect`
  10. `security-engineer`
- **Known Scope Limitation**:
  - Non-software technology roles (e.g. IT support, hardware/firmware engineering, business intelligence, product management) and non-technology professions are outside the MVP catalogue.
  - Adding new roles requires versioned catalogue updates (`CATALOGUE_VERSION`) with explicit required/preferred skill definitions.

### 2.3 Assessment Question Bank Scope
- **Curated Coverage**: The assessment question bank (`server/src/domain/assessment/questionBank.js`) contains **31 validated questions** spanning **10 core canonical skills**:
  - `Node.js`, `React`, `Python`, `SQL`, `Docker`, `TypeScript`, `Git`, `MongoDB`, `REST APIs`, `System Design`.
- **Known Scope Limitation**:
  - The remaining 122 canonical skills currently lack dedicated in-platform deterministic assessment banks.
  - For skills outside the 10 core assessment skills, students can establish `supported` evidence via GitHub repositories, projects, or external certifications, but cannot earn in-platform `verified` status via automated assessment until expanded banks are authored.

### 2.4 Mock Interview Bank Scope
- **Curated Coverage**: 15 curated multi-tier technical interview questions across core software development tracks (`server/src/domain/interview/interviewQuestions.js`).
- **Known Scope Limitation**:
  - Questions are statically authored and curated for consistency and grounding; the MVP does not dynamically generate novel questions from live web job postings.

---

## 3. External AI Dependency & Security Boundaries

Nexora integrates generative Large Language Models (specifically Google Gemini via `@google/genai` or Gemini REST endpoints) for unstructured text tasks: resume parsing, narrative summary generation, and interactive mock interview evaluation.

### 3.1 External Dependency Risks & Mitigations
| Risk | Potential Impact | Implemented Architectural Mitigation |
|---|---|---|
| **API Provider Outage / Unavailability** | 503 errors during resume parsing or mock interview evaluation | Fallback to deterministic mock implementations during tests; clear HTTP `503 AI_PROVIDER_NOT_CONFIGURED` or `502 BAD_GATEWAY` without corrupting persisted state. |
| **API Rate Limits & Quota Exhaustion** | 429 errors from Google Gemini during high traffic | Sliding-window HTTP rate limiters mounted on client endpoints (`evaluationLimiter`, `resumeUploadLimiter`) to throttle outbound AI token requests. |
| **Network Latency Jitter** | AI requests taking 2–8 seconds to generate JSON | Frontend loading indicators and explicit timeout boundaries; non-blocking offline test harnesses with zero live API calls. |
| **Non-Deterministic Text Generation** | LLMs generating varied phrasing or hallucinated claims across repeated identical prompts | Rigid structured output schema validation (`validateAiEvaluationJson`), dimension bounding $[0.0, 1.0]$, and grounding filters. |

### 3.2 The Institutional Verification Barrier (AI Is Advisory Only)
A core safety invariant of Nexora is that **raw AI evaluations can NEVER grant verified status to a student skill**:
```text
           [ Candidate Answer / Interview Submission ]
                                │
                                ▼
                   [ Google Gemini Evaluator ]
                                │
                                ▼
                  [ Raw AI Output: score = 0.95 ]
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
 [ Raw Arithmetic Summary ]            [ Institutional Verification Policy ]
  rawScore: 0.95                        outcome: 'uncertain'
  passedThreshold: true                 eligibleForVerified: false
                                        evidenceStrength: null
                                        verifiedCheckCreated: FALSE
```
- **Rule**: AI evaluations are strictly advisory (`CHECK_OUTCOMES.UNCERTAIN`, `eligibleForVerified: false`).
- **Rationale**: An AI model can hallucinate, be fooled by persuasive language, or suffer prompt injection. To protect academic and employer integrity, only **human staff evaluators** or **deterministic assessment engines** can create verified evidence checks (`SkillEvidenceCheck`).

### 3.3 Prompt-Injection & Adversarial Defenses
Because candidates submit untrusted text (resumes, interview answers), prompt injection is an inherent threat:
1. **XML Delimiter Isolation**: Untrusted inputs are wrapped in strict tags:
   - `<untrusted_resume_text>`
   - `<candidate_untrusted_answer>`
2. **Delimiter Escaping**: The `escapeCandidateAnswerForPrompt()` sanitizer neuters closing tag breakouts (`</candidate_untrusted_answer>` $\to$ `&lt;/candidate_untrusted_answer&gt;`), strips control characters, null bytes, zero-width characters, and bidirectional overrides.
3. **Sandwich Defense**: Prompt instructions precede AND follow untrusted candidate inputs, reiterating system priority and forbidding prompt overrides.
4. **Adversarial Red-Team Detector**: `hasInjectionContent()` flags known injection signatures (e.g. `ignore previous instructions`, `system override`, `grant me verified`) and rejects malicious submissions.
5. **Schema Privilege Stripping**: AI outputs attempting to return elevated fields (e.g. `overrideScore`, `grantVerified`, `bypassEvaluation`) are rejected by `validateAiEvaluationJson()`.
- **Known Limitation**: While all known deterministic injection fixtures pass in test suites (`tests/promptInjectionRedTeam.test.js`), adversarial prompt injection against frontier LLMs is an evolving security challenge; defense-in-depth requires continuous red-teaming.

---

## 4. Opportunity Matching & Market Reality

Nexora provides an opportunity matching engine (`server/src/domain/opportunities/`) that matches students to opportunities based on verified skills and target roles.

### 4.1 Strict Curated Scope (No Live Job Scraping)
- **Catalogue Type**: `OPPORTUNITY_SOURCE_TYPES.CURATED_INTERNAL` (`curated_internal:backend-apprenticeship`, etc.).
- **Deliberate Non-Goal**:
  - Nexora does **NOT** scrape live government job portals, job boards (LinkedIn, Indeed), or corporate career sites in the MVP.
  - The platform does **NOT** claim live market coverage, real-time vacancy numbers, current application statuses, or active salary data.
- **Matching Grounding**:
  - Matches require **verified** skills. A claimed or supported skill does not satisfy an opportunity eligibility rule that demands verification.
  - If a student lacks verified skills for an opportunity, the system reports zero matches rather than generating speculative or inferred matches.

---

## 5. Runtime & Operational Constraints

| Constraint / Feature | MVP State | Production Roadmap Recommendation |
|---|---|---|
| **Rate Limiting Storage** | In-memory sliding-window maps in Node.js process memory. Resets on process restart; does not share state across worker processes or nodes. | Replace in-memory maps with distributed Redis-backed sliding-window limiters (`ioredis` + Redis token bucket). |
| **Code Assessment Execution** | Evaluates candidate predictions of code output via string matching (`normalized_string`, `exact_match`). Does not execute arbitrary student code. | Introduce containerized secure execution sandboxes (e.g., gVisor, Firecracker, or Docker sandboxes) for live code execution challenges. |
| **Assessment Attempt Limits** | Hard-capped at 5 attempts per assessment attempt definition per student to prevent brute-force dictionary attacks. | Implement institutional instructor dashboards with manual attempt reset and re-certification capabilities. |
| **Interview Modality** | Text-based input and structured text evaluation only. | Add WebRTC audio streaming, Speech-to-Text transcription, and optional proctoring. |
| **Response Streaming** | Synchronous REST JSON endpoints for AI responses (completes after full model generation). | Migrate to Server-Sent Events (SSE) or WebSockets for real-time token streaming. |
| **Resume Binary Storage** | In-memory buffer parsing during upload; binary discarded after text extraction; text persisted in MongoDB. | Integrate S3/GCS object storage if persistent original PDF/DOCX downloads are required. |

---

## 6. Verification & Test Evidence Matrix

The limitations and constraints documented above are validated by automated, deterministic regression test suites that run without network access or live API calls:

| Domain | Validating Test Suite | Tested Invariant |
|---|---|---|
| **Taxonomy Scope** | `tests/skillKey.test.js`, `tests/skillConsistency.test.js` | 132 canonical skills; alias normalization idempotency. |
| **Recommendation Heuristic** | `tests/matchRole.test.js`, `tests/mlBaseline.validation.test.js` | Deterministic 5D formula; transparent top-1 accuracy on labeled baselines without ML overfitting. |
| **Deterministic Repeatability** | `tests/repeatabilityValidation.test.js` | 50 consecutive runs across recommendations, gap, roadmap, readiness yield zero drift. |
| **Evidence & Advisory AI Barrier** | `tests/skillEvidenceCheck.test.js`, `tests/assessmentEvidencePolicy.test.js` | Raw AI evaluations and beginner tests cannot generate verified evidence checks. |
| **Prompt Injection Defenses** | `tests/promptInjectionRedTeam.test.js`, `tests/aiOutputValidation.test.js` | Delimiter escaping, sandwich defense, injection detection, schema privilege rejection. |
| **Readiness Contract** | `tests/readiness.contract.test.js`, `tests/readinessValidation.test.js` | Exact count parity with skill gap; zero speculative percentage scores. |
| **Opportunity Matching** | `tests/opportunityValidation.test.js`, `tests/opportunity.contract.test.js` | Curated internal source only; non-claim of live external market coverage. |
| **Performance Overhead** | `tests/intelligencePerformance.test.js` | Deterministic domain services execute in sub-millisecond durations. |
| **Documentation Sync** | `tests/intelligenceDocumentationAudit.test.js`, `tests/qualityAndLimitationsAudit.test.js` | Verified documentation reflects code reality across versions, non-goals, and constraints. |

---

## 7. Conclusion

By adhering strictly to deterministic contracts, explainable scoring heuristics, and explicit verification barriers, Nexora delivers a trustworthy platform that empowers students without misleading them about artificial intelligence capabilities or external employment guarantees.
