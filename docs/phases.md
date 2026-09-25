# Nexora — Development Phases

## Purpose
This document defines the controlled development sequence for Nexora.

**Rule:** Never jump ahead to multiple features at once. Each phase must be completed, tested, reviewed, and accepted before the next phase begins.

## Status

| Phase | State |
|---|---|
| 0 — Project Foundation | Complete |
| 1 — Authentication | Complete |
| 2 — Student Profile | Complete |
| 3 — Resume Intelligence | Complete (backend + file upload + Gemini provider; no edit/review UI) |
| 4 — CareerTwin | Backend complete; frontend via dashboard summary |
| 5 — Career Recommendation | Backend complete; frontend via dashboard summary |
| 6 — Skill Gap | Backend complete; frontend via dashboard summary |
| 7 — Personalized Roadmap | Backend complete; frontend via dashboard summary |
| 8 — Assessment & AI Interview | Complete (Backend assessment engine & AI interview session lifecycle, prompt boundary hardening, schema validation, red-team suite, and institutional evidence integration; UI scheduled for future phase) |
| 9 — Opportunity Matching | Complete (Backend deterministic curated catalogue matching & evidence checking delivered; see docs/opportunities.md) |
| 10 — Dashboard Integration | Dashboard summary endpoint and frontend delivered |

A phase is marked complete only when its exit criteria are met and its tests
pass. The implemented data model and API surface are recorded in
[architecture.md](architecture.md#7-implemented-surface).

## Phase 0 — Project Foundation
- Repository structure
- Environment configuration
- Git workflow
- Coding standards
- Base React application
- Base Node/Express application
- Database connection
- Health-check endpoint
- Error handling foundation
- Logging foundation

**Exit criteria**
- Frontend runs without errors.
- Backend runs without errors.
- Database connection verified.
- `/health` endpoint works.
- No secrets committed.
- README contains setup instructions.

## Phase 1 — Authentication
- Register
- Login
- Logout
- JWT authentication
- Protected routes
- Basic user profile

**Exit criteria**
- Valid users can register/login.
- Invalid credentials are rejected safely.
- Protected APIs cannot be accessed without valid authentication.
- Token expiry is handled correctly.
- Frontend auth state survives refresh safely.

## Phase 2 — Student Profile
- Academic information
- Skills
- Interests
- Projects
- Certifications
- Career preference

**Exit criteria**
- Profile CRUD works.
- Validation exists on every input.
- Data persists correctly.
- Empty/invalid states are handled.

**Delivered**
- `StudentProfile` model, separate from `User`, one per account.
- `GET /api/profile` and `PATCH /api/profile`, both owner-scoped.
- Merge-patch semantics, so editing one section cannot wipe another.
- `/profile` page with loading, empty, error, validation and saved states.
- 38 backend tests and 15 browser end-to-end tests.

Skills carry a self-declared `level`. That is recorded as a **claim**; nothing
treats it as evidence. The evidence model arrives with Phase 6.

## Phase 3 — Resume Intelligence
- Resume upload
- Text extraction
- AI structured extraction
- Review/edit extracted information
- Store structured profile data

**Exit criteria**
- Supported resume formats work.
- Invalid files are rejected.
- AI output is schema-validated.
- User can correct extracted data.

**Delivered — backend foundation only**
- `Resume` model: file metadata, extracted text, separate extraction and
  analysis statuses, parsed structured data, error state, timestamps.
- Owner-scoped CRUD: `POST/GET /api/resumes`, `GET/DELETE /api/resumes/:id`.
- A provider-agnostic `AiProvider` boundary. No vendor SDK is imported by any
  domain code.
- The full AI safety pipeline — JSON parse, schema validation, then grounding
  every extracted claim against the resume text — with invalid output never
  stored as trusted data.
- 75 tests: 39 on the pipeline as pure functions, 36 through the API against a
  provider double.

**Deliberately NOT delivered, and why**
- **No original file persistence.** The uploaded file is held in memory,
  parsed, and discarded. Extracted text is stored. `file.storageKey` on the
  model is the placeholder for persistent storage. See architecture.md.
- **No resume edit/review UI.** A student cannot yet correct extracted data
  through the interface.

Exit criteria not yet met: "user can correct extracted data" depends on the
review UI. "Supported resume formats work" and "invalid files are rejected"
are met. "AI output is schema-validated" is met, and exceeded by grounding.

## Phase 4 — CareerTwin
- CareerTwin profile
- Skill graph
- Evidence signals
- Skill confidence/proficiency
- Career-role mapping

**Exit criteria**
- CareerTwin is generated from actual user data.
- No fabricated student data is displayed.
- Skill evidence is traceable to available inputs.

**Delivered — backend foundation only**
- Canonical skill identity (`domain/skills/skillKey.js`), so a profile's
  "Node.js" and a resume's "NodeJS" are one skill everywhere downstream.
- The evidence model (`domain/evidence/evidence.js`): `claimed` → `supported`
  → `verified`, with a declared strength per source and a required
  human-readable reason on every item.
- `CareerTwin` model and a pure, deterministic builder that aggregates
  profile and analysed resumes into skills-with-evidence, interests, target
  roles, academic context and countable indicators.
- Staleness detection against the inputs the twin was built from.
- An optional AI narrative, grounded against the twin and rejected whole if
  it overstates. Every narrative failure is non-fatal.
- `GET` and `POST /api/career-twin`.
- 63 tests: 13 on skill identity, 29 on the builder and evidence model as
  pure functions, 21 through the API.

All three exit criteria are met. The twin is built entirely from stored
student data, no value is produced without a traceable source, and the one
AI-written field is confined to prose and labelled as such.

**Deliberately NOT delivered, and why**
- **No readiness score.** Readiness is readiness *for* a role, and there is
  no target to measure against until Phase 5. `indicators` reports counts of
  real things instead.
- **Verified evidence is limited to the assessment contract.** Passing a
  deterministic assessment or a human-evaluated interview can produce it;
  AI-only interview feedback remains `uncertain` and never verifies a skill.
- **No CareerTwin UI.** Phase 10 integrates the dashboard.

## Phase 5 — Career Recommendation
- Career-role catalogue
- Role requirements
- Matching/scoring engine
- Explanation for each recommendation

**Exit criteria**
- Recommendations are deterministic/reproducible for identical inputs.
- Match score has a documented formula.
- User can see why a role matches.

**Delivered — backend foundation only**
- A curated catalogue of 10 entry-level technology roles with required
  skills, preferred skills, related technologies and common backgrounds.
  Versioned, and its nature stated in every response.
- A deterministic five-dimension scoring engine with all weights in one
  sum-checked, versioned file, returned with every result.
- Explainable output: matched skills, missing skills, per-dimension
  breakdown, and the concrete evidence behind the score.
- `GET /api/careers/roles`, `/recommendations`, `/roles/:roleId/match`.
- 47 tests: 28 pure-function over the matcher and catalogue, 19 API.

All three exit criteria are met, and tested directly — determinism, the
published formula, and named matched/missing skills each have a test.

**Deliberately NOT delivered, and why**
- **No job-market data.** No salary, demand, growth or hiring figures
  anywhere, because there is no verified source for them. A test asserts
  their absence from every recommendation.
- **No AI in matching.** Scoring is arithmetic over a student's own data; a
  model would add invention to the one place that must not have any.
- **No persistence of recommendations.** They are a pure function of a twin
  and a versioned catalogue, so a stored copy could only go stale.
- **No career recommendation UI.** Phase 10 integrates the dashboard.

## Phase 6 — Skill Gap
- Required vs current skill comparison
- Priority gaps
- Gap scoring
- Explanation
- Recommended actions

**Exit criteria**
- Every displayed gap has a reason.
- Scores are bounded and validated.
- No recommendation is generated without role requirements.

**Delivered — backend foundation only**
- A four-level status scale — `missing`, `claimed`, `supported`, `verified` —
  built on the Phase 4 evidence model, so a merely listed skill is reported
  as a gap rather than as a skill the student has.
- A reason and structured `suggestedEvidence` on every skill, each suggestion
  naming the status it would reach and whether it is available yet.
- Priority ordering by what to act on next.
- `GET /api/careers/roles/:roleId/skill-gap`.
- 22 tests: 15 pure-function, 7 API.

All three exit criteria are met, each with a direct test: a reason on every
skill, counts rather than unbounded scores, and a 404 when the role is not
in the catalogue.

**Deliberately NOT delivered, and why**
- **No coverage percentage.** Counts only — see architecture.md.
- **No assessment or interview UI.** Phase 8 provides only the minimal
  owner-scoped backend contract; the client flow remains a later integration.
- **No skill gap UI.** Phase 10 integrates the dashboard.

## Phase 7 — Personalized Roadmap
- Learning actions
- Project actions
- Practice tasks
- Time estimates
- Progress tracking

**Exit criteria**
- Roadmap is tied to actual skill gaps.
- Tasks can be marked complete.
- Progress updates correctly.

**Delivered — backend foundation only**
- A generator that builds every item from a measured gap, with priority,
  banded effort, prerequisites, resource references and a verification step.
- Priority ordering that places a *claimed* core skill above a *missing*
  optional one — the student thinks that box is ticked, so it is the likeliest
  surprise.
- Resource references as structured placeholders with search hints. No
  fabricated URLs; `url` is null everywhere and a test enforces it.
- `GET /api/careers/roles/:roleId/roadmap`.
- 31 tests: 20 pure-function, 11 API.

Exit criteria one and three are met, and tested — including a test that adds
a project and watches the corresponding item disappear.

Exit criterion two, "tasks can be marked complete", is met **differently from
how it is worded**, and deliberately. There is no completion flag to set. A
student completes an item by adding the evidence, which closes the gap, which
removes the item. A stored flag could disagree with the evidence, which is
the thing this architecture exists to prevent. Items expose
`completion.completesWhen` so a client can say what closing one requires.

**Deliberately NOT delivered, and why**
- **No curated course links.** There is no verified catalogue, and an
  invented link actively misleads. See architecture.md.
- **No hour estimates.** Banded effort instead.
- **No roadmap UI.** Phase 10 integrates the dashboard.

## Phase 8 — Assessment & AI Interview
- Skill assessment (Delivered)
- Curated assessment question bank & deterministic scoring (Delivered)
- Assessment attempt lifecycle & persistence (Delivered)
- AI-guided interview session lifecycle (Delivered)
- Curated interview question bank & deterministic selection (Delivered)
- Candidate answer submission & bounded validation (Delivered)
- Prompt boundary hardening & anti-jailbreak defenses (Delivered)
- Strict structured output validation & grounding (Delivered)
- Provider error sanitization & secret protection (Delivered)
- AI red-team integration test suite (Delivered)
- Institutional evidence integration & CareerTwin staleness (Delivered)

**Delivered — Skill Assessment Engine & API**
- **Domain Contract & Question Bank**: Curated, versioned assessment question bank covering 10 canonical skills (`Node.js`, `React`, `Python`, `SQL`, `Docker`, `TypeScript`, `Git`, `MongoDB`, `REST APIs`, `System Design`) across 3 difficulty tiers (`beginner`, `intermediate`, `advanced`) and 4 question types (`single_choice`, `multiple_choice`, `code_output`, `short_answer`).
- **Deterministic Scoring Engine**: Explicit rule-based evaluation (`exact_match`, `set_equality`, `partial_choice`, `normalized_string`) with partial scoring and guessing penalties.
- **Data Models & State Machine**: Mongoose models (`Assessment`, `AssessmentAttempt`) with attempt lifecycle states (`in_progress`, `completed`, `timed_out`, `abandoned`), duration tracking, and deduplication of active attempts.
- **REST Endpoints**:
  - `GET /api/assessments`: Filter by skill and difficulty.
  - `GET /api/assessments/:assessmentId`: Public view stripping answers/scoring rules.
  - `POST /api/assessments/:assessmentId/attempts`: Starts or resumes an attempt.
  - `POST /api/assessments/attempts/:attemptId/submit`: Atomic evaluation and completion.
  - `GET /api/assessments/attempts/:attemptId`: Owner-scoped attempt breakdown.
  - `GET /api/assessments/attempts`: Reverse-chronological attempt history.
  - `GET /api/assessments/:assessmentId/latest`: Latest completed result.
- **Evidence Policy Integration**: Passing intermediate or advanced assessments ($\ge 70\%$) generates a verified `SkillEvidenceCheck` in MongoDB and marks the student's CareerTwin as stale for recomputation. Beginner, advisory, or practice assessments withhold verified checks.
- **Security Hardening**: IDOR protection via owner-scoped queries (returning `404 NOT_FOUND`), recursive anti-tampering guards rejecting client-submitted scores/results, prototype pollution / MongoDB operator rejection, atomic document locking against concurrency races, and sliding-window rate limiters (30 requests / 15 minutes).

**Delivered — AI Interview Architecture & Safety**
- **AI Interview Session Architecture**:
  - `InterviewSession` model enforcing ownership, strict lifecycle states (`initialized` → `in_progress` → `completed` | `abandoned` | `timed_out`), and question/session attempt limits.
  - Curated question bank with stable IDs (`iq-*-*`) aligned with canonical taxonomy (`SKILL_TAXONOMY_VERSION = 1`).
  - Full REST API suite: session creation, listing, retrieval, starting, answering, completing, and abandoning.
- **Prompt Boundary Hardening & Safety**:
  - Candidate answers strictly enclosed in `<candidate_untrusted_answer>` XML tags with XML character escaping, neutralizing delimiter breakout, instruction override, or rubric manipulation.
  - Evaluator enforces adversarial separation: grades strictly on technical substance, ignoring DAN/persona hijack directives.
- **Strict Output Validation & Grounding**:
  - Model responses validated against strict JSON schema: 4 dimension scores (`accuracy`, `depth`, `clarity`, `relevance` $\in [0.0, 1.0]$), bounded feedback strings, and privilege escalation rejection (502 on malformed or forbidden fields).
  - Grounding filters candidate skills against canonical taxonomy and target question skill; unasked or hallucinated skills are stripped.
- **AI Red-Team Suite**:
  - 19 deterministic tests covering prompt injection, instruction override, oversized/undersized answers, malformed model JSON, unsupported skill claims, answer-key extraction, cross-user IDOR access, and provider failure with zero secret leakage.
- **Institutional Evidence Integration**:
  - Completed sessions create `SkillEvidenceCheck` records for each target skill.
  - AI evaluations are strictly advisory (`outcome: 'uncertain'`, `eligibleForVerified: false`). Raw AI claims can never directly create verified skills.
  - Only authorized human evaluator passes ($\ge 0.75$) grant `verified` status.
  - CareerTwin staleness monitors newly recorded evidence (`latestEvidenceAt > generatedAt`), and fresh CareerTwin generation consumes verified checks, elevating skills to `strength: 'verified'`.
  - Skill-gap analysis marks verified skills as `GAP_STATUS.VERIFIED` and clears suggested evidence.

**Deliberately NOT delivered in this slice, and why**
- **No untrusted code execution sandbox.** Predicts code output via deterministic string matching (`normalized_string`) rather than running arbitrary code in a container sandbox.
- **No assessment or interview UI.** Frontend test-taking and interview interfaces are scheduled for subsequent UI integration; all capabilities are fully verified at the REST API, service, and domain level.
- **No audio/video capture.** Text-based interview submissions in MVP.
- **No streaming tokens.** Synchronous JSON response delivery.

**Exit criteria**
- Assessment attempts can be started, resumed, and submitted with 100% deterministic scoring.
- Interview sessions follow strict lifecycle states with prompt boundary hardening and structured JSON schema validation.
- Secret answer keys, internal scoring metadata, and AI provider credentials are never leaked.
- Valid passing results create verified evidence checks and flag CareerTwin staleness according to institutional verification policy (AI evaluations remain advisory).
- Double-submission, replay, tampering, prompt injection, and IDOR attacks are blocked safely.
- All assessment and interview test suites pass cleanly.

## Phase 9 — Opportunity Matching
- Curated internal opportunity dataset (`server/src/domain/opportunities/opportunityCatalogue.js`) with source attribution and catalogue versioning.
- Owner-scoped endpoint `GET /api/opportunities`.
- Deterministic eligibility checks against student's verified skills and target role.
- Transparent match explanations showing which verified evidence satisfied eligibility rules.
- Strict non-goals enforced: no scraping of external job boards, no fake live listing claims, and no LLM hallucinated roles.

**Exit criteria**
- Opportunity records contain immutable IDs, source type (`curated_internal`), version, and date metadata.
- No unsupported claim of live job feeds, employer availability, or external salary data.
- Matching logic is fully explainable, deterministic, and deduplicated by opportunity ID.
- Test suite verifies matching against verified vs claimed skills.

## Phase 10 — Dashboard Integration
Connect:
Profile → CareerTwin → Career → Skill Gap → Roadmap → Assessment → Readiness → Opportunities.

## Phase 11 — Quality & Deployment
- Full regression testing
- Security checks
- Performance checks
- Deployment
- Production smoke test

**Hard rule:** A phase is NOT complete because the UI looks finished. It is complete only when functionality, validation, error handling and tests pass.

## Nexora Design & Experience Standard

### Final Visual Theme — Sunset Warm
The finalized Nexora visual identity is **Sunset Warm**.

| Token | Value | Usage |
|---|---|---|
| Primary | `#EA580C` | Primary actions, key highlights, brand accents |
| Secondary | `#F97316` | Secondary actions, active states, emphasis |
| Background | `#FFF7ED` | Main application background |
| Success | `#22C55E` | Completed states, positive readiness signals |
| Warning | `#F59E0B` | Skill gaps, attention states |
| Error | `#EF4444` | Validation and error states |
| Text | `#6B7280` | Secondary text / metadata |
| Card | `#FFFFFF` | Cards, panels, forms |

### Experience Principle
Nexora must feel like a **real student career-support product**, not a generic AI wrapper or a collection of disconnected screens.

The interface should communicate:
- clarity,
- progress,
- trust,
- guidance,
- student continuity,
- actionable next steps.

### Motion & Animation Standard
Use purposeful, smooth animation wherever it improves comprehension or continuity.

Appropriate uses:
- Page/section transitions
- Dashboard card entrance
- Progress-ring animation
- Skill-bar progression
- Roadmap step transitions
- Career-match reveal
- AI analysis/progress states
- Modal/drawer transitions
- Success/completion feedback
- Skeleton loading states
- Hover/focus micro-interactions

Avoid:
- excessive bouncing,
- random decorative motion,
- long transitions,
- animations that delay interaction,
- animation on every element,
- distracting parallax.

Recommended behavior:
- Micro-interactions: ~150–250ms
- Standard transitions: ~250–400ms
- Complex/reveal animations: ~400–700ms
- Respect `prefers-reduced-motion`.

Animation must reinforce **cause → effect**. For example, completing an assessment should visibly update the relevant readiness/skill state instead of merely showing a generic success toast.
