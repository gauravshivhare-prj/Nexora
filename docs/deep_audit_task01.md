# Nexora — Repository-Level Deep Architecture & Intelligence Audit (Task 01)

## Executive Summary
This document establishes the repository-level baseline audit of Nexora across its entire full-stack architecture, covering frontend (React 19 + Vite), backend (Node.js 20+ / Express), database (MongoDB + Mongoose), intelligence pipeline (Gemini LLM integrations, deterministic scoring engines), security controls, and testing framework.

Every transition across the core student career lifecycle is formally audited:
`Profile → Resume → Skills → Evidence → CareerTwin → Role → Skill Gap → Roadmap → Assessment → Interview → Readiness → Opportunities → Dashboard`

---

## 1. Complete Architecture Inventory

| Layer | Component | Implementation / Technology | Current State & Governance |
| :--- | :--- | :--- | :--- |
| **Frontend** | Client Core | React 19.3, Vite 6, React Router DOM 7, TailwindCSS 4 | Responsive SPA, semantic landmarks, high-contrast dark/light theme, accessible touch targets (≥44px). |
| **Backend** | API Server | Node.js (ES Modules), Express 4.21, Mongoose 8.9 | Clean modular layout: routes, controllers, services, domain logic, middleware, models. |
| **Database** | MongoDB | Mongoose with strict schemas, compound indexes, timestamps | Scoped collections per tenant/user. Unique compound indexes on attempts and sessions. |
| **Auth** | Session/Identity | JWT (HS256) with Bearer token, bcryptjs password hashing | Stateless JWT, user validation on every request, deactivation check, brute-force rate limiters. |
| **AI Integration** | LLM Provider | `@google/genai` (Gemini 3.6 Flash / Flash 2.5), AI Provider abstraction | AI Provider registry supporting `gemini`, `demo`, `test-double`. Strict grounding & JSON boundary parsers. |
| **Testing** | Automated Suites | Native Node Test Runner (`node --test`), Concurrency = 1 | 130+ suites, 500+ tests covering unit, domain, integration, IDOR, adversarial injection, and e2e. |
| **Deployment** | Environment | Environment variables (`.env`), production hardening guards | CORS whitelist, helmet/security headers, stack trace redaction in production, non-root port bindings. |

---

## 2. Core Journey Transition Matrix

### Transition 1: User Registration & Student Profile
* **Data Contract**:
  - Request: `PATCH /api/profile` (`personal`, `academic`, `skills`, `experience`, `projects`, `certifications`)
  - Response: `200 OK` `{ status: 'success', data: { profile: StudentProfileDto } }`
* **Owner**: `profile.controller.js` & `profile.service.js`
* **Transformation**: Trims strings, bounds numerical inputs (CGPA 0.00–10.00 rounded to 2 decimal places, semester 1–12), normalizes arrays.
* **Validation**: Strict schema validation (`validateProfilePayload`). Prohibits prototype pollution and unexpected root keys.
* **AI Influence**: None. Purely authoritative, user-entered student data.
* **Failure Behavior**: `400 VALIDATION_ERROR` with specific invalid field path.
* **Security Boundary**: Server-enforced user ownership via `req.user._id`. Discards any client-supplied `user` or `_id` fields.

### Transition 2: Resume Intake, Extraction & Grounding
* **Data Contract**:
  - Request: `POST /api/resumes/upload` (multipart) or `POST /api/resumes` (raw text: min 50, max 50,000 chars)
  - Analysis: `POST /api/resumes/:id/analysis`
  - Response: `200 OK` `{ status: 'success', data: { resume: ParsedResumeDto, untrustedValues: string[] } }`
* **Owner**: `resume.controller.js`, `resume.service.js`, `domain/resume/*`
* **Transformation**: File buffer → text extraction (via `pdf-parse` or `mammoth`) → structured JSON extraction via Gemini → strict entity grounding against raw text.
* **Validation**: MIME type validation (PDF, DOCX, TXT), size limit (5MB), text length limits. Structured JSON validated against `parsedResumeSchema.js`.
* **AI Influence**: Gemini extracts candidate skills, education, experience, and projects.
* **Grounding & Boundary**: `groundParsedResume.js` scans every extracted entity against literal resume text. Any hallucinated skill/entity is dropped and recorded in `untrustedValues`.
* **Failure Behavior**: `400 BAD_REQUEST` on bad file format; `502 AI_OUTPUT_INVALID` on non-JSON model response; `503 AI_PROVIDER_FAILED` on upstream timeout.
* **Security Boundary**: Files stored safely or analyzed in-memory; max 10 resumes per student; user-scoped tenant isolation.

### Transition 3: Skill Normalization & Taxonomy
* **Data Contract**: String input (e.g., `"React.js"`, `"Nodejs"`, `"Postgres"`) → Canonical Key (e.g., `"react"`, `"node"`, `"postgresql"`)
* **Owner**: `domain/skills/skillKey.js`
* **Transformation**: Lowercases, removes punctuation/whitespace, resolves synonyms through alias dictionary.
* **Validation**: Checks against known canonical aliases; returns normalized key and display title.
* **AI Influence**: None. Strictly deterministic normalization rules.
* **Current Limitation / Finding**: Currently a flat alias dictionary. Needs expansion to full hierarchical ontology with prerequisite dependencies, sub-skills, and role relevance (Task 03).

### Transition 4: Skill Evidence Architecture & Lifecycle
* **Data Contract**: Skill + Source (`profile_entry`, `resume_fact`, `assessment`, `interview`) + Metadata → `SkillEvidenceCheck`
* **Owner**: `domain/evidence/*`, `skillEvidence.service.js`
* **Transformation**: Classifies evidence into three tiers:
  1. `claimed`: Stated on profile or raw resume mention (weight: 0.3)
  2. `supported`: Verified by project link, repository, or work experience (weight: 0.7)
  3. `verified`: Institutional pass on intermediate/advanced assessment or passed human technical interview (weight: 1.0)
* **Validation**: Verified status can ONLY be awarded by authoritative backend scoring; client payloads attempting to supply `eligibleForVerified: true` or `status: verified` are rejected or stripped.
* **AI Influence**: Strictly advisory. AI evaluation scores CANNOT directly create `verified` evidence.
* **Failure Behavior**: `400 VALIDATION_ERROR` on uncanonical skill keys or malformed evidence requests.
* **Security Boundary**: Evidence check records are immutable and strictly tenant-isolated.

### Transition 5: CareerTwin Projection & Freshness Engine
* **Data Contract**:
  - Request: `POST /api/career-twin` (`?narrative=true|false`)
  - Response: `200 OK` `{ status: 'success', data: { twin: CareerTwinDto, isStale: boolean, stalenessReason: string|null } }`
* **Owner**: `careerTwin.service.js`, `domain/careerTwin/buildCareerTwin.js`
* **Transformation**: Aggregates canonical profile data, active resume extraction, and verified evidence checks into unified skill vector with proficiency levels and evidence provenance.
* **Validation**: Ensures one CareerTwin document per user with compound unique constraint `{ user: 1 }`.
* **AI Influence**: Gemini generates optional natural language summary (`careerTwinNarrative.js`).
* **Grounding & Boundary**: `groundNarrative.js` checks every skill mentioned in the AI narrative against the student's actual twin skills. If the narrative claims skills not in the twin, it is rejected.
* **Freshness & Staleness**: `isCareerTwinStale()` compares timestamps across `StudentProfile`, `Resume`, and `SkillEvidenceCheck`. If evidence was added or profile updated after twin generation, `isStale: true` is flagged.

### Transition 6: Career Role Catalog & Requirements
* **Data Contract**: Canonical Role ID (e.g., `backend-developer`) → Structured Role Definition
* **Owner**: `domain/careers/roleCatalogue.js`
* **Data Fields**: Role title, category, description, required skills (with min proficiency and importance weight), preferred skills (with weight).
* **Validation**: Schema-validated role definitions with non-empty required skills and positive weights summing to 1.0.
* **AI Influence**: None. Curated domain reference data.

### Transition 7: Career Recommendation & Skill-Gap Computation
* **Data Contract**:
  - Request: `GET /api/careers/recommendations`, `GET /api/careers/roles/:roleId/skill-gap`
  - Response: `200 OK` `{ status: 'success', data: { roleId, matchScore, matchBand, skillsSummary, gaps: [...] } }`
* **Owner**: `domain/careers/matchRole.js`, `domain/skillGap/computeSkillGap.js`, `skillGap.service.js`
* **Transformation**: Compares CareerTwin skill vector against role requirements:
  - Scoring: Required skills match (65%) + Preferred skills match (20%) + Evidence depth (15%).
  - Gaps: Categorized into `missing`, `claimed`, `supported`, `verified`.
* **AI Influence**: None. 100% deterministic mathematical calculation with deterministic tie-breaking.
* **Failure Behavior**: `409 CAREER_TWIN_NOT_FOUND` if student has not built CareerTwin; `404 CAREER_ROLE_NOT_FOUND` if role ID unknown.
* **Security Boundary**: Scoped to authenticated user's own CareerTwin.

### Transition 8: Roadmap Generation & Sequencing
* **Data Contract**:
  - Request: `GET /api/careers/roles/:roleId/roadmap`
  - Response: `200 OK` `{ status: 'success', data: { roleId, milestones: [...] } }`
* **Owner**: `domain/roadmap/buildRoadmap.js`, `roadmap.service.js`
* **Transformation**: Converts unverified and missing skills from skill-gap into sequenced learning milestones (foundational → intermediate → advanced) with recommended curated resources.
* **Validation**: Validates role exists and CareerTwin is present.
* **AI Influence**: None for core ordering; resource mapping is deterministic.
* **Future Enhancement (Task 16 & 17)**: Integrate adaptive replanning on evidence gain and continuous replanning.

### Transition 9: Assessment Question Selection, Attempt Lifecycle & Scoring
* **Data Contract**:
  - Start: `POST /api/assessments/:id/attempts` → `{ attemptId, questions: [...] }` (Answer keys and explanations stripped)
  - Submit: `POST /api/assessments/attempts/:attemptId/submit` `{ answers: { [qId]: answer } }`
  - Result: `200 OK` `{ attemptId, score, passed, resultStatus, breakdown: [...] }`
* **Owner**: `assessment.service.js`, `domain/assessment/*`
* **Transformation**: Deterministic evaluation of multiple-choice, multi-select, code output, fill-in-blank, ordering questions.
* **Validation**: Strict answer type and size checks (max 1000 chars per answer, max 50 answers). Maximum 5 attempts per assessment.
* **AI Influence**: None. Deterministic answer keys.
* **Anti-Leakage**: Public DTO NEVER exposes `expectedAnswer`, `explanation`, or internal scoring weights before or during attempt.
* **Evidence Integration**: Intermediate or advanced pass (>70%) automatically records a verified `SkillEvidenceCheck` and triggers CareerTwin staleness.

### Transition 10: AI Technical Interview System
* **Data Contract**:
  - Create: `POST /api/interviews/sessions` `{ targetSkills, difficulty }`
  - Start: `POST /api/interviews/sessions/:id/start`
  - Answer: `POST /api/interviews/sessions/:id/questions/:questionId/answers` `{ answerText }`
  - Complete: `POST /api/interviews/sessions/:id/complete`
* **Owner**: `interviewSession.service.js`, `interviewEvaluation.service.js`, `domain/interview/*`
* **Transformation**: Question selection from catalog → answer submission with CAS lock → LLM rubric evaluation (technical accuracy, conceptual depth, practical reasoning) → bounded feedback.
* **Validation**: Answer length 5–5000 chars; rate limit 10 evaluations/hour per user; max 60 sessions/15m.
* **AI Influence & Boundary**: Gemini evaluates answer quality. However, AI interview evaluations are strictly advisory / diagnostic and CANNOT award verified evidence directly.
* **Anti-Injection Guardrails**: Candidate answers are sanitized, encapsulated in boundary delimiters, and scanned for prompt injection. Evaluator scores are clamped if adversarial patterns are detected.

### Transition 11: Career Readiness Calculation
* **Data Contract**:
  - Request: `GET /api/careers/roles/:roleId/readiness`
  - Response: `200 OK` `{ readinessScore, readinessBand, requiredSkillsCoverage, preferredSkillsCoverage, verificationDepth, blockingSkills: [...] }`
* **Owner**: `domain/readiness/computeReadiness.js`, `readiness.service.js`
* **Transformation**: Mathematical score: `0.60 * reqCoverage + 0.20 * prefCoverage + 0.20 * verificationDepth`.
* **Validation**: Requires active CareerTwin; returns explicit `insufficient_data` if profile is empty.
* **AI Influence**: None. 100% explainable deterministic calculation.

### Transition 12: Opportunity Eligibility & Matching
* **Data Contract**:
  - Request: `GET /api/opportunities`
  - Response: `200 OK` `{ opportunities: [...] }` (with matchScore, eligibilityStatus)
* **Owner**: `opportunity.service.js`, `domain/opportunities/*`
* **Transformation**: Matches CareerTwin skills, degree, CGPA, and graduation year against opportunity criteria.
* **Validation**: Distinguishes `eligible` from `potential_match` when prerequisite criteria are not yet verified.
* **AI Influence**: None. Deterministic criteria evaluation.

### Transition 13: Truthful Dashboard Aggregation
* **Data Contract**:
  - Request: `GET /api/summary`
  - Response: `200 OK` `{ profile, resumeCount, careerTwin, assessments, interviews, topRole, nextAction }`
* **Owner**: `summary.service.js`
* **Transformation**: Aggregates state across all modules into unified truth. Determines the single most actionable next step (e.g., complete profile → upload resume → generate twin → take assessment → interview).
* **Validation**: Zero mock or synthetic placeholders. Degrades gracefully if a downstream module fails.
* **AI Influence**: None.

---

## 3. Discovered Findings, Invariants & Architectural Backlog

### Findings
1. **Skill Ontology (Task 03)**:
   The current skill resolution uses a dictionary of aliases in `skillKey.js`. While robust for normalization, it lacks explicit parent-child ontology trees, prerequisite dependency graphs, and difficulty calibrations needed for multi-tiered gap analysis.
2. **Canonical Data Model & Provenance (Task 02)**:
   Student profile data and resume-extracted data are stored in separate models (`StudentProfile` and `Resume`). While CareerTwin merges them at generation time, a unified canonical provenance ledger is needed to trace the exact history of every field.
3. **Evidence Promotion Engine (Task 04)**:
   Currently, only intermediate/advanced assessment passes and human interviews promote evidence. An explicit evidence transition machine with staleness TTL and confidence scoring will formalize this across the entire lifecycle.
4. **Adaptive Roadmap & Replanning (Task 16, 17)**:
   Roadmap is currently generated upon request from skill gaps. An adaptive engine that replans dynamically when assessments or interviews are completed will close the loop.
5. **Interview Question Selection & Dynamic Rubrics (Task 21, 22)**:
   Interview questions are currently curated in `interviewQuestions.js`. An adaptive selection engine mapped directly to the skill taxonomy will maximize technical evaluation coverage.

---

## 4. Work Package Implementation Plan (Phases 01–50)

- **Phase 01–08**: Foundation, Canonical Truth, Skill/Evidence Architecture & CareerTwin (Tasks 01–08)
- **Phase 09–18**: Career Intelligence, Recommendation Correctness, Gemini Controls & Adaptive Roadmap (Tasks 09–18)
- **Phase 19–30**: Assessment, Interview, Readiness, Opportunities, Personalization & Cross-Feature Consistency (Tasks 19–30)
- **Phase 31–40**: Authentication, Authorization, API, Uploads, Frontend, Database, Secrets, AI Abuse & Production Security (Tasks 31–40)
- **Phase 41–50**: Resilience, Performance, Scale, Concurrency, Automated Testing, Real-Student Validation & Release Certification (Tasks 41–50)

---

## 5. Certification Status
* **Status**: **FIXED** (Task 01 Audit Complete, documented with exact contracts, owners, security boundaries, and validation rules).
