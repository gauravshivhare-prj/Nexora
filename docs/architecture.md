# Nexora — System Architecture

## 1. Architecture Goal

Nexora uses a modular web architecture:

**React → Node/Express → Intelligence Services → Data Layer**

The design keeps frontend, backend, AI/ML, and persistence responsibilities separate.

## 2. High-Level Architecture

```text
                    NEXORA WEB APP
                          |
                    React + Tailwind
                          |
                    REST API Layer
                          |
                 Node.js + Express
                          |
        +-----------------+-----------------+
        |                 |                 |
   Auth/Profile      Career Engine      Opportunity
        |                 |                 |
        |          +------+-------+         |
        |          |              |         |
        |        GenAI            ML        |
        |          |              |         |
        +----------+------+-------+---------+
                          |
                  Data / Persistence
                    |             |
                 MongoDB        MySQL
```

## 3. Responsibilities

### Frontend
- UI rendering
- Navigation
- Form validation feedback
- API communication
- Loading/error/empty states
- Dashboard visualizations

### Backend
- Authentication
- Authorization
- Business rules
- Validation
- API orchestration
- Database access
- AI/ML service orchestration

### GenAI
- Resume understanding
- Career explanations
- Roadmap generation
- Interview question generation
- Interview feedback
- Natural-language explanations

### ML/Scoring
- Career similarity
- Skill-gap scoring
- Opportunity matching
- Explainable ranking

### MongoDB
Use for dynamic/user-centric data:
- Users
- Profiles
- Skills
- Projects
- Resumes
- Assessments
- Interviews
- Roadmaps
- AI results

### MySQL
Use only where relational reference data benefits from SQL:
- Career roles
- Role-skill requirements
- Structured opportunity/reference tables

Do NOT duplicate the same source of truth across both databases.

## 4. API Principles
- RESTful naming
- Version APIs where needed
- Validate request bodies
- Authenticate protected endpoints
- Authorize resource ownership
- Consistent response format
- Centralized error middleware
- Never expose stack traces in production

## 5. AI Safety/Quality
AI output must never be treated as trusted raw text.

Pipeline:

```text
User Input
   ↓
Prompt + Context
   ↓
LLM
   ↓
Structured JSON
   ↓
Schema Validation
   ↓
Business Validation
   ↓
Store / Display
```

If validation fails, retry once with a repair prompt or return a safe fallback.

## 6. Scalability
Initial deployment can be a modular monolith. Do not prematurely create microservices.

Split AI/ML services only when:
- workload requires it,
- independent scaling is needed,
- or deployment complexity is justified.

## 7. Implemented Surface

This section records what exists in the codebase today. Everything above is
design intent; everything here is built and tested. Anything not listed is not
implemented yet.

### Collections

| Collection | Source of truth for | Owner field |
|---|---|---|
| `users` | Account identity — name, email, password hash, role, active flag | — |
| `studentprofiles` | Student-entered profile data | `user` (unique) |
| `resumes` | Resume text and AI-derived structured data | `user` (non-unique) |
| `careertwins` | Derived career representation. Entirely computed | `user` (unique) |
| `skillevidencechecks` | Assessment/interview outcomes and provenance | `user` |
| `assessments` | Canonical and dynamic assessment definitions with questions and answer keys | — |
| `assessmentattempts` | Student assessment attempt sessions, answer submissions, and scoring results | `user` |
| `interviewsessions` | AI-guided technical interview sessions and candidate responses | `user` (non-unique) |

`User` and `StudentProfile` are deliberately separate documents. An
authentication change cannot put profile data at risk, a profile migration
cannot lock anyone out, and the `User` load on every authenticated request
stays small.

`Resume` is non-unique per user because a resume is a dated document, not a
property of a person — comparing this year's against last year's is the point.

`InterviewSession` is non-unique per user because students may conduct multiple
mock interview attempts across different roles, skills, and difficulty levels.

**No collection copies another.** Where a student's own profile answer and
their resume disagree, both are kept and the disagreement stays visible.
Reconciling them is CareerTwin's job, and it cannot do that if one has already
overwritten the other.

### StudentProfile shape

```text
user            ObjectId → User, unique, immutable
personal        phone, dateOfBirth, gender, city, state
academic        collegeName, degree, branch, currentSemester,
                graduationYear, cgpa
career          targetRole, preferredLocation, careerInterests[], bio
skills[]        { name, level }            level is a CLAIM, not evidence
projects[]      { title, description, technologies[], projectUrl, githubUrl }
certifications[]{ name, issuer, issueDate, credentialUrl }
```

Every field is optional. Limits live in `server/src/constants/profilePolicy.js`
and are enforced by both the request validator and the Mongoose schema.

### Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/health` | — | Liveness and database reachability |
| `POST` | `/api/auth/register` | — | Rate limited per IP |
| `POST` | `/api/auth/login` | — | Rate limited per IP; issues a JWT |
| `POST` | `/api/auth/logout` | — | Stateless; no server-side write |
| `GET` | `/api/auth/me` | Bearer | Re-reads the account behind the token |
| `GET` | `/api/profile` | Bearer | 200 with an empty profile before first save |
| `PATCH` | `/api/profile` | Bearer | Merge semantics; upserts on first save |
| `POST` | `/api/resumes` | Bearer | Stores resume text. Does **not** call the AI |
| `GET` | `/api/resumes` | Bearer | Summaries only; full text is projected away |
| `GET` | `/api/resumes/:id` | Bearer | Owner-scoped; 404 if not the caller's |
| `DELETE` | `/api/resumes/:id` | Bearer | Owner-scoped |
| `POST` | `/api/resumes/upload` | Bearer | Rate-limited file upload; extracts text in-memory |
| `POST` | `/api/resumes/:id/analysis` | Bearer | Runs the AI pipeline. 503 when unconfigured |
| `GET` | `/api/career-twin` | Bearer | Stored twin plus `isStale`. Never regenerates |
| `POST` | `/api/career-twin` | Bearer | Rebuilds. `?narrative=true` adds an optional summary |
| `GET` | `/api/careers/roles` | Bearer | The curated role catalogue, with its source |
| `GET` | `/api/careers/recommendations` | Bearer | Ranked matches. `?limit=`, `?includeAll=` |
| `GET` | `/api/careers/roles/:roleId/match` | Bearer | Score against one named role |
| `GET` | `/api/careers/roles/:roleId/skill-gap` | Bearer | Per-skill status, reason and next step |
| `GET` | `/api/careers/roles/:roleId/roadmap` | Bearer | Prioritised plan built from the gap |
| `GET` | `/api/careers/roles/:roleId/readiness` | Bearer | Deterministic role-scoped evidence projection (`insufficient_data` / `partial` / `supported` / `verified`), fresh/stale status, and non-verified blockers |
| `GET` | `/api/skill-evidence` | Bearer | Owner-scoped assessment/interview results |
| `POST` | `/api/skill-evidence/assessments` | Bearer (admin) | Records an assessment result directly. Students earn evidence through `/api/assessments` instead |
| `POST` | `/api/skill-evidence/interviews` | Bearer (admin) | Records a human- or AI-evaluated interview result directly. Students earn evidence through `/api/interviews` instead |
| `GET` | `/api/assessments` | Bearer | Lists active sanitized assessments. Optional `?skill=`, `?difficulty=` |
| `GET` | `/api/assessments/:assessmentId` | Bearer | Sanitized assessment detail (secrets stripped); 404 if not found |
| `POST` | `/api/assessments/:assessmentId/attempts` | Bearer | Starts/deduplicates an attempt. Rate-limited (30/15m) |
| `POST` | `/api/assessments/attempts/:attemptId/submit` | Bearer | Evaluates attempt, records verified evidence. Rate-limited (30/15m) |
| `GET` | `/api/assessments/attempts/:attemptId` | Bearer | Owner-scoped attempt result detail; 404 if not caller's |
| `GET` | `/api/assessments/attempts` | Bearer | Owner-scoped attempt history. Optional `?assessmentId=` |
| `GET` | `/api/assessments/:assessmentId/latest` | Bearer | Owner-scoped latest completed attempt; null if none |
| `POST` | `/api/interviews/sessions` | Bearer | Initializes an interview session targeting a role and canonical skills |
| `GET` | `/api/interviews/sessions` | Bearer | Lists all interview sessions for the authenticated student |
| `GET` | `/api/interviews/sessions/:id` | Bearer | Retrieves session details and questions (owner-scoped; 404 for other users) |
| `POST` | `/api/interviews/sessions/:id/start` | Bearer | Transitions session from `initialized` to `in_progress` |
| `POST` | `/api/interviews/sessions/:id/questions/:questionId/answers` | Bearer | Submits candidate answer, runs AI evaluation with delimiter isolation |
| `POST` | `/api/interviews/sessions/:id/complete` | Bearer | Finalizes session, computes score, creates `SkillEvidenceCheck` |
| `POST` | `/api/interviews/sessions/:id/abandon` | Bearer | Abandons an active interview session |
| `GET` | `/api/summary` | Bearer | Dashboard aggregate; section-failure-isolated |

### Ownership rule

Every student-scoped resource derives its owner from `req.auth.userId`, which
`requireAuth` sets from a verified token. No endpoint accepts an owner id from
the request, and there is no `/api/profile/:id` route — a profile is only ever
addressable as "mine". An unrecognised body key such as `user` is rejected as a
validation error rather than ignored, so a client attempting to name a
different owner is told plainly instead of receiving a misleading 200.

### Profile merge semantics

`PATCH /api/profile` follows RFC 7386: a key that is absent is left untouched,
and an explicit `null` or empty string clears the stored value. Arrays
(`skills`, `projects`, `certifications`, `careerInterests`) are replaced
wholesale when present — their entries have no stable ids, so there is no
well-defined merge, and inventing one would make removal impossible to express.

Validation failures are reported together, each keyed by a dotted path
(`skills[0].level`), so a client can mark every offending field in one pass.
A rejected patch writes nothing.

### AI provider boundary

No vendor SDK is imported anywhere in the domain. Everything goes through the
`AiProvider` contract in `server/src/services/ai/aiProvider.js`:

```text
{ name, complete({ system, user, maxOutputTokens }) → { text, model } }
```

**Nexora ships with one provider implementation** — a Gemini adapter in
`server/src/services/ai/geminiProvider.js`. Set `AI_PROVIDER=gemini` and
`GEMINI_API_KEY` to enable it. With no provider registered,
`POST /api/resumes/:id/analysis` answers `503 AI_PROVIDER_NOT_CONFIGURED`
and says so. Everything else works without it.

To add another provider: implement the contract, call `registerAiProvider()`
at startup, and set `AI_PROVIDER` to its name. The provider's own API key
belongs in its own environment variable.

### The AI safety pipeline

Implemented for resume analysis, and reused by every later AI feature:

```text
resume text
   ↓  provider (untrusted from here on)
raw response
   ↓  parseJsonObject        services/ai/aiJson.js
JSON object
   ↓  validateParsedResume   domain/resume/parsedResumeSchema.js
right shape
   ↓  groundParsedResume     domain/resume/groundParsedResume.js
verified against the source
   ↓
persistence
```

Two classes of finding, treated differently:

- **Structural errors** — `skills` returned as a string, `basics` as an array.
  The analysis fails with `502 AI_OUTPUT_INVALID`, and nothing is stored.
- **Per-entry warnings** — one bad row in forty. That row is dropped, recorded
  on the document, and the rest is kept.

**Grounding** is the check that matters. A model asked to extract skills from a
backend CV will sometimes add Docker because CVs like that usually mention it.
So every value a later phase may treat as evidence — skills, technologies,
certification names, institutions, organisations, project titles, email, phone
— must appear in the resume text, and anything that does not is dropped and
named in `warnings`.

Matching is punctuation-insensitive for names of three characters or more
("Node.js" matches "NodeJS") and whole-word for one or two ("C", "R", "Go"),
because a substring test on a single letter confirms anything.

Descriptions and achievements are **not** grounded: a model rewording three
bullets into a sentence is doing its job. They are stored as model-written
prose, and no later phase may read them as evidence.

Skills carry no proficiency level anywhere in this pipeline. A resume shows
that someone listed a skill, not how good they are at it; a model asked to
guess would produce a number that looks like evidence and is not. The
allow-listed output shape means a provider cannot smuggle one in.

Grounding catches invention, not misreading. A model that attributes a real
skill to the wrong project still passes, because every word it used is in the
document. It raises the floor; it is not a correctness proof.

### Resume states

`extraction` (file → text) and `analysis` (text → structured data) each carry
their own `pending | processing | completed | failed` status. Two statuses
rather than one because "read perfectly but analysis failed" and "could not be
read at all" are different problems, and a single field could not say which.

A failed re-analysis deliberately leaves the previous parsed data in place.
That reading was valid when it was made and `analysedBy` records what produced
it; deleting good data because a later attempt failed would be strictly worse
than keeping it beside a visible failure.

### Skill identity

Nothing anywhere compares skill *names*. Everything compares canonical keys
from `server/src/domain/skills/skillKey.js`.

A student types "Node.js", their resume says "NodeJS", a role definition says
"Node". As strings those are three skills, and a student would be told to
learn something they had already listed twice. Two mechanisms resolve it:

1. **Normalisation** — case, punctuation and spacing are stripped, so
   "Node.js", "NODE JS" and "node-js" all key to `nodejs`. Mechanical, no
   maintenance. `+` and `#` survive, or "C", "C++" and "C#" would merge.
2. **Aliases** — a short curated list for words that normalise differently
   but mean the same thing ("js" → JavaScript, "k8s" → Kubernetes).

Every alias is a name-for-the-same-thing, never a related or broader skill.
React and React Native are not aliases; nor are SQL and PostgreSQL. Merging
those would erase a gap a student really has. When in doubt the pair is left
unmerged: two keys for one skill shows up as a visible duplicate, while one
key for two skills hides a gap.

### Evidence model

Defined in `server/src/domain/evidence/evidence.js`, aggregated by CareerTwin
and consumed by skill gaps. No skill is ever recorded bare — each arrives
attached to evidence saying where it came from.

| Strength | Meaning | Produced by |
|---|---|---|
| `claimed` | The student said so | Profile skill entry, resume mention |
| `supported` | They pointed at something concrete | Project technology, certification |
| `verified` | An independent check passed | **Nothing yet** — Phase 8 |

A resume is `claimed`, not `supported`: it is a document its subject wrote
about themselves, and grounding proves the resume says it, not that it is
true. A certification is `supported`, not `verified`: Nexora has not fetched
the credential, and an unchecked link is not proof.

A skill's strength is the **strongest** evidence behind it, never an average —
passing an assessment is not diluted by also having typed the skill into a
form. Every evidence item carries a required `detail` string, so a student
reads "used in your project Nexora" rather than "supported".

### CareerTwin

Entirely derived from StudentProfile and analysed Resumes. Nothing is entered
into it directly, which makes it the one collection that can safely be
deleted and rebuilt.

**Built with no AI involvement.** Aggregating a student's own data is
arithmetic, not generation — `buildCareerTwin` is a pure function with no
database, clock or network, so the same inputs always give the same twin. A
student is entitled to ask why it says what it says, which is only answerable
if the answer does not depend on what a model returned that day.

The optional narrative is the only AI-touched part. It is prose, labelled
`isModelWritten: true` in the payload, and nothing computes from it. It is
grounded against the twin and **rejected whole** if it credits a skill the
student does not have — not edited, because a summary is an argument and
deleting the untrue clause leaves a sentence whose point rested on it. Every
narrative failure is non-fatal: the twin is already complete.

**No readiness score.** `indicators` holds counts of things that exist —
skills by strength, projects, certifications, analysed resumes. Readiness is
readiness *for* a role, and a single figure produced before career matching
exists would be a number about nothing.

Storing derived data risks staleness, so `sources` records what the twin was
built from and `isCareerTwinStale()` compares that to the present.
`GET /api/career-twin` reports staleness and deliberately does **not**
regenerate: a read that rewrote stored data would make GET a mutation and
would hide from the student that their twin was out of date.

### Career recommendation

Deterministic and explainable, with no AI anywhere. The same CareerTwin and
the same catalogue always produce the same scores.

Nothing is persisted. A recommendation is a pure function of a twin and a
versioned catalogue, so a stored copy could only disagree with a recomputed
one. Recomputing is cheap; a stale recommendation is not.

**The catalogue** (`domain/careers/roleCatalogue.js`) is a hand-written
internal reference list. It is **not** derived from a job board, a
labour-market dataset or a survey. It contains no salary figures, no demand
or growth numbers and no hiring rates, because Nexora has no verified source
for any of them — and a student making a career decision on an invented
number is the most damaging kind of fabrication. What it does hold is a
checkable answer to one narrow question: which skills does this kind of role
usually involve? `CATALOGUE_SOURCE` says exactly this in every response.

**The weights** (`domain/careers/scoring.js`) are collected in one file,
sum-checked at import time, versioned, and returned with every response — a
weight nobody can find is a weight nobody can challenge.

| Dimension | Weight | Question it answers |
|---|---|---|
| `requiredSkills` | 0.45 | Do you have what the role is defined by? |
| `preferredSkills` | 0.20 | Do you have what strengthens it? |
| `evidenceStrength` | 0.20 | How solid is what you have? |
| `interestAlignment` | 0.10 | Have you said you want this? |
| `backgroundAlignment` | 0.05 | Is your field one this role draws from? |

They are a judgement, not a measurement, encoding three opinions: required
beats preferred; evidence beats assertion; interest and background are weak
signals that must never score a motivated career-changer out of a field.

Safeguards that are tested rather than assumed:

- An **unknown** academic background scores a neutral 0.5, not 0. Not filling
  in a branch is not a statement about fitness, and scoring silence as a
  negative would penalise an incomplete profile rather than describe a
  person. A *different* background scores 0 on a 5%-weighted dimension and
  nothing more. There is no exclusion rule anywhere in the matcher.
- A role Nexora *suggested* (`origin: 'nexora'`) does not count as the
  student's stated intent, or the system would agree with itself more each
  time it ran.
- Generic title words ("developer", "engineer") are ignored when matching
  intent, or every engineering role would align with every engineering
  interest.
- `claimed` evidence scores above zero. Scoring assertion at nothing would
  make the dimension a proxy for how long someone has used Nexora.

Every match carries `matchedRequired`, `missingRequired`, the per-dimension
breakdown, and the concrete `evidence` behind it — de-duplicated, so one
project behind three skills is one piece of evidence rather than three.
Matches below `MINIMUM_RECOMMENDABLE_SCORE` are filtered out as noise unless
`?includeAll=true`.

### Skill gap

Compares a CareerTwin against one role's requirements. Pure, deterministic,
no AI, nothing persisted — a gap is a function of a twin and a versioned
role, so a stored copy could only disagree with a recomputed one.

The output is not a list of missing words. Every skill the role names comes
back with a status, the reason behind it, and a concrete way to change it,
because the useful question is never "do you have Docker?" but "what would
it take for Nexora to say you have Docker?".

| Status | Meaning |
|---|---|
| `missing` | Not seen anywhere in the profile or resumes |
| `claimed` | Listed, but Nexora has not seen it used |
| `supported` | Backed by a project or certification |
| `verified` | Independently checked. **Nothing produces this yet** |

`claimed` being its own status — rather than counted as "has the skill" — is
the point of the feature. A student who typed "Docker, expert" into a form
has a gap; one who shipped a containerised project does not. A system that
treats those the same is a checklist, and the student finds out which they
were at the interview.

Ordering is by what to do next: required-and-missing first, then
required-but-only-claimed. The second is placed high deliberately — the
student believes they are finished there, so it is the gap most likely to
surprise them.

`suggestedEvidence` is structured rather than prose, so the roadmap can act
on it. Suggestions are deliberately generic: a specific course or project
brief would be an invented external resource, and there is no verified
dataset of those. Assessment suggestions carry `available: false` rather
than pointing at a feature that does not exist.

**No coverage percentage.** The summary reports counts only. "You are 60%
ready" invites a student to read one number and stop, when the whole value
is in which part of the 60% is shown rather than merely said — and the career
match score already provides one honest headline figure computed from
published weights. A second would compete with it.

Skills the student has that the role does not name are returned as
`additionalSkills` — context, never criticism. A backend student's Figma is
not a flaw in their backend profile; it is a hint that another role may fit
better, and that is the reader's call.

### Personalised roadmap

Built on the skill gap service, not on the CareerTwin directly:

```text
CareerTwin → skill gap → prioritised skills → roadmap
```

That layering is the point. If the roadmap computed its own view of a
student's skills, it could eventually disagree with the gap analysis — and a
plan that tells someone to learn what their own gap page says they have is
worse than no plan. Reusing the gap service also means one implementation of
ownership scoping, the unknown-role 404 and the missing-CareerTwin 409.

Every item traces to a measured gap. There are no generic steps, because
"learn the fundamentals" is advice for nobody in particular and a student can
tell. Each item carries:

```text
goal (the role) → skill → objective → actions
                → resources → verification
```

**Verification is what makes it a roadmap rather than a reading list.**
Finishing a course proves nothing Nexora can record. Shipping a project and
listing its technologies moves the skill from `claimed` to `supported`, which
the student then sees in their own gap analysis.

**No completion flag is stored.** A student completes an item by adding the
evidence, which closes the gap, which removes the item. A stored flag could
disagree with the evidence, which is the one thing this architecture exists
to prevent. Items expose `completion.completesWhen` instead.

**Resources are placeholders, and `url` is null everywhere.** Nexora has no
verified course catalogue. Having a model suggest a course URL is the worst
available option — models invent plausible titles and plausible links with
equal confidence, and a student following a dead link has been actively
misled by the product that sent them there. Each resource gives a type, a
title and a `searchHint` the student can run themselves, plus
`verified: false`. The response states this in `method.resourceNote`.

**Effort is banded** (`quick` / `moderate` / `substantial`), never given in
hours. "12 hours to learn Docker" is a number nobody can justify, and
printing it would make the plan look precise exactly where it cannot be.

An item appears only if it has at least one *available* action. Skills with
`supported` evidence can transition to `verified` by passing an intermediate or
advanced skill assessment.

Prerequisites come from a small explicit table (Express.js needs JavaScript
and Node.js) and are filtered to skills that are *also on this roadmap*, so a
prerequisite never points at nothing. Inferring a dependency graph across all
of technology is not something this could do honestly.

### Not implemented

- **Original file persistence.** `POST /api/resumes/upload` extracts text
  from PDF/DOCX in memory and stores the extracted text. The original file is
  discarded after extraction. `file.storageKey` on the Resume model is the
  placeholder for future persistent storage. This is an intentional MVP
  limitation: writing to disk or a blob store would add infrastructure
  complexity with no current product requirement for re-downloading the
  original.
- **Frontend UI for Assessments and Interviews.** The backend engines, question
  banks, deterministic scoring, prompt boundary hardening, evaluation schemas,
  evidence integrations, and red-team regression suites are delivered. Frontend UI
  interfaces are planned for upcoming phases.
- **No synthetic readiness score.** Role-scoped career readiness is implemented as an evidence projection (`GET /api/careers/roles/:roleId/readiness`) rather than an invented single percentage or AI judgement. It reports concrete evidence counts, blocking skills, and freshness state. Arbitrary aggregate scores remain a deliberate non-goal.

## 8. Assessment Feature Architecture & API Specification

### Overview

The Assessment feature provides a deterministic, secure, and reproducible evaluation engine for measuring student technical skills against Nexora's canonical taxonomy (`SKILL_TAXONOMY_VERSION = 2`).

The architecture strictly enforces:
1. **Deterministic Rule-Based Scoring**: Transparent scoring algorithms without LLM nondeterminism or hallucinations.
2. **Anti-Tampering & Secret Protection**: Complete elimination of client-controlled scores, verification fields, and answer keys.
3. **Evidence Policy Separation**: High raw scores do not automatically produce `verified` evidence unless the assessment difficulty and evaluation context satisfy institutional evidence standards.
4. **Tenant Isolation (IDOR Defense)**: Attempts are strictly scoped to `req.auth.userId`. Attempts belonging to other students return `404 NOT_FOUND` with zero existence confirmation.
5. **Atomic State & Replay Protection**: Concurrent racing submissions and sequential replays are rejected via atomic document updates.
6. **Rate Limiting**: Sliding-window rate limiters defend assessment attempt start and submission endpoints against brute-force enumeration and Denial-of-Service abuse.

---

### Data Models & Collections

#### 1. `assessments` Collection
Stores canonical catalog definitions and dynamically assembled assessment specifications.

```text
assessmentId      String, unique, alphanumeric slug (/^[a-z0-9_-]+$/i)
version           Number, integer >= 1
skillKey          String, canonical Nexora taxonomy skill (e.g. "Node.js")
skillName         String, display name
difficulty        String enum: "beginner" | "intermediate" | "advanced"
title             String, human-readable title (<= 150 chars)
description       String, markdown description (<= 2000 chars)
passMark          Number, 0.0 to 1.0 (default: 0.70)
timeLimitMinutes  Number, 5 to 180 (default: 30)
isActive          Boolean, default: true
questions[]       Array of question definitions (max: 50):
  id              String, unique within assessment (e.g. "q-node-01")
  type            String enum: "single_choice" | "multiple_choice" | "code_output" | "short_answer"
  prompt          String, question prompt (<= 1000 chars)
  codeSnippet     String, optional code context (<= 4000 chars)
  options[]       Array of choices (for choice types, max: 10):
    id            String (e.g. "opt-a")
    text          String (<= 500 chars)
  expectedAnswer  String | Array (INTERNAL SECRET — stripped from public projections)
  acceptedAnswers String[] (INTERNAL SECRET — stripped from public projections)
  scoringRule     String enum: "exact_match" | "set_equality" | "partial_choice" | "normalized_string"
  weight          Number, >= 0.1 (default: 1.0)
  explanation     String, internal rationale (INTERNAL SECRET — stripped from public projections)
```

#### 2. `assessmentattempts` Collection
Stores student assessment sessions, student-submitted answers, and evaluation results.

```text
user                  ObjectId → User, required, immutable
assessmentId          String, alphanumeric slug
attemptNumber         Number, sequential integer 1..5
version               Number, assessment version evaluated
skillKey              String, canonical taxonomy skill
skillName             String, display name
difficulty            String enum: "beginner" | "intermediate" | "advanced"
status                String enum: "in_progress" | "evaluated" | "timed_out" | "abandoned"
score                 Number, 0.0 to 1.0 (null while in_progress)
passMark              Number, 0.0 to 1.0
passed                Boolean (null while in_progress)
outcome               String enum: "pass" | "fail" | "incomplete" (null while in_progress)
earnedPoints          Number, total awarded points (null while in_progress)
maxPoints             Number, total possible points (null while in_progress)
totalQuestions        Number, count of questions
correctQuestionsCount Number, count of correct answers (null while in_progress)
answers               Object / Map: questionId → student answer (primitive or string array)
questionResults[]     Array of scored question outcomes:
  questionId          String
  prompt              String
  weight              Number
  studentAnswer       String | Array | null
  isCorrect           Boolean
  ratio               Number, 0.0 to 1.0
  earnedPoints        Number
  maxPoints           Number
evidenceCheck         ObjectId → SkillEvidenceCheck (null if not eligible or failed)
startedAt             Date, attempt creation timestamp
completedAt           Date, submission timestamp (null while in_progress)
durationSeconds       Number, elapsed seconds (null while in_progress)
```

**Indexes**:
- `{ user: 1, assessmentId: 1, attemptNumber: 1 }` (unique compound index enforcing attempt sequence integrity).
- `{ user: 1, assessmentId: 1, createdAt: -1 }` (fast retrieval of user attempt history and latest attempts).

---

### Endpoints Specification

All assessment endpoints require student authentication via `Authorization: Bearer <jwt>`.

#### 1. `GET /api/assessments`
Lists all active assessments available to students in sanitized form.

- **Query Parameters**:
  - `skill` (optional, string): Canonical Nexora skill key (e.g. `Node.js`). Validated against `isKnownSkill`; unknown skills return `400 VALIDATION_ERROR`.
  - `difficulty` (optional, string): Filter by difficulty level (`beginner`, `intermediate`, `advanced`). Invalid values return `400 VALIDATION_ERROR`.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Assessments retrieved",
    "data": {
      "assessments": [
        {
          "id": "asm_node_intermediate_01",
          "version": 1,
          "skillKey": "Node.js",
          "skillName": "Node.js",
          "difficulty": "intermediate",
          "title": "Node.js Asynchronous & Event Loop Assessment",
          "description": "Evaluates understanding of libuv, event loop phases, and streaming I/O.",
          "passMark": 0.7,
          "timeLimitMinutes": 30,
          "questionCount": 5,
          "totalWeight": 5,
          "questions": [
            {
              "id": "q-node-01",
              "type": "single_choice",
              "prompt": "Which phase of the Node.js event loop executes setImmediate() callbacks?",
              "weight": 1,
              "codeSnippet": null,
              "options": [
                { "id": "opt-timers", "text": "Timers phase" },
                { "id": "opt-poll", "text": "Poll phase" },
                { "id": "opt-check", "text": "Check phase" },
                { "id": "opt-close", "text": "Close callbacks phase" }
              ]
            }
          ]
        }
      ]
    }
  }
  ```

#### 2. `GET /api/assessments/:assessmentId`
Fetches a single sanitized assessment definition by ID.

- **Path Parameters**:
  - `assessmentId` (string, required): Alphanumeric slug (`/^[a-z0-9_-]+$/i`). Malformed slugs return `400 VALIDATION_ERROR`.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Assessment retrieved",
    "data": {
      "assessment": {
        "id": "asm_node_intermediate_01",
        "version": 1,
        "skillKey": "Node.js",
        "skillName": "Node.js",
        "difficulty": "intermediate",
        "title": "Node.js Asynchronous & Event Loop Assessment",
        "description": "...",
        "passMark": 0.7,
        "timeLimitMinutes": 30,
        "questionCount": 5,
        "totalWeight": 5,
        "questions": [ ... ]
      }
    }
  }
  ```
- **Error Responses**:
  - `404 NOT_FOUND` (`NOT_FOUND`): Assessment does not exist or is inactive.

#### 3. `POST /api/assessments/:assessmentId/attempts`
Starts a new assessment attempt session or returns an active `in_progress` attempt for deduplication.

- **Rate Limit**: 30 requests per 15-minute sliding window per authenticated user. Exceeding limit returns `429 RATE_LIMIT_EXCEEDED`.
- **Path Parameters**:
  - `assessmentId` (string, required): Slug of the assessment to attempt.
- **Request Body**: `{}` (any client-supplied scoring or verification field causes immediate `400 VALIDATION_ERROR`).
- **Deduplication Logic**:
  - If the student already has an `in_progress` attempt that has not expired, the existing attempt is returned (HTTP 201) without advancing `attemptNumber`.
  - If an active attempt has exceeded `timeLimitMinutes + 60s`, it is automatically transitioned to `timed_out` before initiating the next attempt.
  - If the student has reached the maximum of 5 completed/evaluated attempts for this assessment, the request is rejected with `400 BAD_REQUEST`.
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "message": "Assessment attempt started",
    "data": {
      "attempt": {
        "id": "6ab41c652d4c49da16bca882",
        "assessmentId": "asm_node_intermediate_01",
        "attemptNumber": 1,
        "version": 1,
        "skillKey": "Node.js",
        "skillName": "Node.js",
        "difficulty": "intermediate",
        "status": "in_progress",
        "score": null,
        "passMark": 0.7,
        "passed": null,
        "outcome": null,
        "earnedPoints": null,
        "maxPoints": null,
        "totalQuestions": 5,
        "correctQuestionsCount": null,
        "questionResults": [],
        "evidenceCheckId": null,
        "startedAt": "2026-09-24T10:00:00.000Z",
        "completedAt": null,
        "durationSeconds": null
      }
    }
  }
  ```

#### 4. `POST /api/assessments/attempts/:attemptId/submit`
Submits student answers, runs deterministic rule-based scoring, atomically transitions attempt status to `evaluated`, and records verified skill evidence if eligible.

- **Rate Limit**: 30 submissions per 15-minute sliding window per user. Exceeding limit returns `429 RATE_LIMIT_EXCEEDED`.
- **Path Parameters**:
  - `attemptId` (string, required): 24-character hexadecimal ObjectId string. Malformed IDs return `404 NOT_FOUND`.
- **Request Body**:
  ```json
  {
    "answers": {
      "q-node-01": "opt-check",
      "q-node-02": ["opt-a", "opt-c"],
      "q-node-03": "undefined"
    }
  }
  ```
- **Validation Constraints**:
  - Rejects any forbidden keys (`score`, `passed`, `outcome`, `status`, `earnedPoints`, `evidenceCheck`, etc.) with `400 VALIDATION_ERROR`.
  - Rejects prototype pollution keys (`__proto__`, `constructor`, `prototype`) or keys starting with `$` with `400 VALIDATION_ERROR`.
  - Answers payload cannot exceed 50 entries.
  - Answer strings cannot exceed 1000 characters.
  - Answer values must be primitive types (`string`, `number`, `boolean`, `null`, `undefined`) or arrays of primitives. Non-primitive objects are rejected with `400 VALIDATION_ERROR`.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Assessment submitted and evaluated",
    "data": {
      "attempt": {
        "id": "6ab41c652d4c49da16bca882",
        "assessmentId": "asm_node_intermediate_01",
        "attemptNumber": 1,
        "version": 1,
        "skillKey": "Node.js",
        "skillName": "Node.js",
        "difficulty": "intermediate",
        "status": "evaluated",
        "score": 0.85,
        "passMark": 0.7,
        "passed": true,
        "outcome": "pass",
        "earnedPoints": 4.25,
        "maxPoints": 5,
        "totalQuestions": 5,
        "correctQuestionsCount": 4,
        "questionResults": [
          {
            "questionId": "q-node-01",
            "prompt": "Which phase of the Node.js event loop executes setImmediate() callbacks?",
            "weight": 1,
            "studentAnswer": "opt-check",
            "isCorrect": true,
            "ratio": 1.0,
            "earnedPoints": 1,
            "maxPoints": 1
          }
        ],
        "evidenceCheckId": "6ab41c72147426ad6d1aa2b6",
        "startedAt": "2026-09-24T10:00:00.000Z",
        "completedAt": "2026-09-24T10:05:32.000Z",
        "durationSeconds": 332
      },
      "evidenceResult": {
        "eligibleForVerified": true,
        "skill": "Node.js",
        "score": 0.85,
        "reason": "Passed intermediate assessment with score 85% (passMark 70%)."
      },
      "evidenceStatus": "verified"
    }
  }
  ```
- **Error Responses**:
  - `400 BAD_REQUEST`: Attempt is already evaluated or timed out.
  - `404 NOT_FOUND`: Attempt not found or owned by a different user.

#### 5. `GET /api/assessments/attempts/:attemptId`
Fetches detailed result and question-level breakdown of an attempt owned by the authenticated student.

- **Path Parameters**: `attemptId` (24-hex string).
- **Security**: IDOR protected. If the attempt belongs to another student or does not exist, returns `404 NOT_FOUND`.
- **Response** (`200 OK`): `{ success: true, message: "Assessment attempt retrieved", data: { attempt } }`.

#### 6. `GET /api/assessments/attempts`
Lists the student's attempt history in reverse chronological order.

- **Query Parameters**: `assessmentId` (optional, string): Filter by alphanumeric slug.
- **Response** (`200 OK`): `{ success: true, message: "User assessment attempts retrieved", data: { attempts: [ ... ] } }`.

#### 7. `GET /api/assessments/:assessmentId/latest`
Fetches the student's latest completed assessment attempt result for a given assessment.

- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Latest assessment result retrieved",
    "data": {
      "attempt": { ... }, // Public attempt document, or null if no completed attempts
      "result": { ... }   // Evaluation result summary, or null if no completed attempts
    }
  }
  ```

---

### Scoring Semantics & Rule-Based Engine

Evaluation is 100% deterministic and operates via `server/src/domain/assessment/assessmentContract.js`.

#### Supported Question Types & Scoring Rules

| Question Type | Valid Answer Input | Supported Scoring Rules | Behavior |
|---|---|---|---|
| `single_choice` | String (Option ID) | `exact_match` | Awards full weight if student's option ID exactly matches `expectedAnswer` (case-sensitive); otherwise 0. |
| `multiple_choice` | Array of Option IDs | `set_equality`, `partial_choice` | - `set_equality`: Awards full weight if student's selected set exactly matches expected set; 0 if any mismatch.<br>- `partial_choice`: Awards points based on precision/recall with guessing penalty: `Math.max(0, (correctCount - incorrectCount) / totalExpected) * weight`. |
| `code_output` | String / Number | `exact_match`, `normalized_string` | - `exact_match`: Exact literal string match.<br>- `normalized_string`: Strips trailing whitespace and normalizes CRLF (`\r\n` to `\n`) before comparison. Matches expected output or any alias in `acceptedAnswers`. |
| `short_answer` | String | `exact_match`, `normalized_string` | Matches case-insensitively trimmed response against `expectedAnswer` or any alias in `acceptedAnswers`. |

#### Scoring Calculations
1. **Question Ratio & Earned Points**:
   $$\text{earnedPoints}_i = \text{ratio}_i \times \text{weight}_i \quad (\text{where } 0.0 \le \text{ratio}_i \le 1.0)$$
2. **Aggregated Assessment Score**:
   $$\text{Score} = \frac{\sum \text{earnedPoints}_i}{\sum \text{maxPoints}_i}$$
   Rounded to 4 decimal places for floating-point stability.
3. **Pass Criteria**:
   $$\text{passed} = \text{Score} \ge \text{passMark} \quad (\text{default passMark: } 0.70)$$

---

### Evidence Policy & Limitations

Passing an assessment does **not** unconditionally grant `verified` skill status. Nexora maintains strict separation between raw evaluation scores and institutional evidence status:

```text
Student Submission
       ↓
Deterministic Scoring Engine
       ↓
Score >= passMark ?
   ├── NO  → outcome: "fail", evidenceStatus: "unsupported" (No evidence check created)
   └── YES → Difficulty & Context Check:
               ├── beginner     → eligibleForVerified: false, evidenceStatus: "supported" (NO verified check)
               ├── isPractice   → eligibleForVerified: false, evidenceStatus: "unsupported" (NO verified check)
               ├── advisory_ai  → eligibleForVerified: false, evidenceStatus: "unsupported" (NO verified check)
               └── intermediate / advanced → eligibleForVerified: true, evidenceStatus: "verified"
                                             (Verified SkillEvidenceCheck created in MongoDB)
```

#### CareerTwin & Skill-Gap Impact
1. When a verified `SkillEvidenceCheck` is created:
   - The student's stored CareerTwin detects staleness on the next read (`latestEvidenceAt > twin.generatedAt` or `verifiedEvidenceCount` mismatch) with reason: `"New skill evidence has been recorded since this was generated."`.
   - Regenerating the CareerTwin (`POST /api/career-twin`) consumes the verified check, elevates the skill level from `claimed` to `verified`, increments `indicators.verified`, and clears `isStale`.
   - Skill-gap analysis against target career roles shifts the skill into `verified`, clears `suggestedEvidence` to `[]` (requirement fully proven), and increments `summary.required.verified`.
2. Beginner assessment passes and failed attempts generate zero verified evidence checks and never trigger CareerTwin staleness.

---

### Security Architecture

| Security Threat | Mitigation Strategy | Implemented Defense |
|---|---|---|
| **Answer-Key Leakage** | Public projections | `toPublicAssessment` and `toPublicAssessmentAttempt` systematically strip `expectedAnswer`, `expectedOutput`, `acceptedAnswers`, `scoringRule`, and `explanation`. |
| **IDOR / Tenant Crossing** | Scope enforcement | Every attempt query enforces `{ _id: attemptId, user: req.auth.userId }`. Malformed IDs or cross-student queries return `404 NOT_FOUND` (no existence disclosure). |
| **Client Score Forgery** | Anti-tampering guard | Recursive `assertNoForbiddenClientFields(payload)` scans root and nested payloads. Attempts to supply `score`, `passed`, `outcome`, `status`, or `evidenceCheck` return `400 VALIDATION_ERROR`. |
| **Prototype Pollution & Query Injection** | Payload sanitization | Payloads containing `__proto__`, `constructor`, `prototype`, or keys starting with `$` are rejected with `400 VALIDATION_ERROR`. |
| **Replay & Concurrency Race** | Atomic document locking | Double submission returns `400 BAD_REQUEST`. Rapid concurrent submissions on the same in-progress attempt execute via `AssessmentAttempt.findOneAndUpdate({ _id, user, status: 'in_progress' }, ...)`; exactly one request succeeds and exactly one evidence check is created. |
| **Brute Force & Rate Abuse** | Sliding-window limiters | `assessmentAttemptLimiter` and `assessmentSubmitLimiter` enforce 30 requests per 15-minute sliding window; exceeding limit returns `429 RATE_LIMIT_EXCEEDED`. |
| **Payload Flooding** | Structural bounds | Submissions capped at 50 answers, answer strings capped at 1000 characters, non-primitive answer objects rejected with `400 VALIDATION_ERROR`. |

---

### Known MVP Limitations

The following architectural trade-offs are intentional design decisions for the current MVP release:
1. **In-Memory Rate Limiting**: The sliding-window rate limiters use in-process memory maps. In horizontally scaled multi-instance deployments, this store must be swapped for a distributed Redis-backed limiter.
2. **Deterministic Output Matching (No Execution Sandbox)**: `code_output` questions evaluate student predictions of code snippets using string matching (`normalized_string`). The platform does not execute untrusted student-submitted code in a containerized sandbox (e.g. gVisor or Docker).
3. **Fixed Attempt Cap (5 Attempts)**: Students are capped at 5 attempts per assessment. There is currently no administrative reset or re-certification workflow implemented.
4. **API-Only Delivery**: Assessment features are fully delivered and tested at the REST API and domain service levels. The frontend student test-taking interface is scheduled for subsequent UI integration.
5. **Curated Taxonomy Scope**: The initial question bank provides validated, non-copyrighted questions across 10 canonical core skills (`Node.js`, `React`, `Python`, `SQL`, `Docker`, `TypeScript`, `Git`, `MongoDB`, `REST APIs`, `System Design`). Additional taxonomy skills fall back to project-based verification until dedicated assessment banks are authored.


## 9. AI Interview Feature Architecture & Security Specification

The AI Interview feature (Phase 8) delivers AI-guided technical mock interviews with real-time structured evaluation, grounded feedback, and integration into the institutional evidence engine.

### Architectural Flow

```text
Student Input (Target Role + Canonical Skills)
   ↓
Session Initialization (POST /api/interviews/sessions)
   ↓ Curated Question Bank Selection (iq-*-*)
Session Started (POST /api/interviews/sessions/:id/start)
   ↓
Question Prompt Rendered (Sequential Index Progression)
   ↓
Candidate Submits Answer (POST .../questions/:qid/answers)
   ↓ Bounded Size Check (5 to 5,000 characters)
Prompt Boundary Hardening (<candidate_untrusted_answer> XML Escaping)
   ↓
AiProvider Call (Gemini / Mock Double, with AbortController Timeout)
   ↓
Raw Output Parsing (parseJsonObject)
   ↓ Strict Schema Validation (dimensions: 0.0–1.0, feedback <= 1000 chars, no forbidden fields)
Grounded Evaluation (Grounded Skills filtered against canonical taxonomy & question target)
   ↓
Question Evaluation Recorded on Session Subdocument
   ↓
Next Question / Session Complete (POST .../:id/complete)
   ↓
Persistence to SkillEvidenceCheck (Reference: session ID, completedAt)
   ↓
Institutional Evidence Policy:
   ├── Evaluated by AI: outcome = 'uncertain', eligibleForVerified = false (Advisory only)
   └── Evaluated by Human: outcome = 'pass' (if score >= 0.75), eligibleForVerified = true
         ↓
CareerTwin Staleness Flagged (latestEvidenceAt > generatedAt)
         ↓
CareerTwin & Skill-Gap Consumption (Skill elevated to 'verified')
```

### Core Components & Engineering Specifications

1. **Curated Question Bank (`server/src/domain/interview/interviewQuestions.js`)**:
   - Curated technical questions aligned with canonical skill taxonomy (`SKILL_TAXONOMY_VERSION = 1`).
   - Stable question IDs (`iq-node-001`, `iq-mongo-001`, `iq-react-001`, etc.).
   - Explicit separation of intent, difficulty (`beginner`, `intermediate`, `advanced`), target skill, and rubric criteria.
   - Deterministic selection based on target role and skills.
   - Rejects uncanonical skills and invalid question parameters with `400 VALIDATION_ERROR`.

2. **Session Lifecycle State Machine (`server/src/models/InterviewSession.model.js`)**:
   - State progression: `initialized` → `in_progress` → `completed` | `abandoned` | `timed_out`.
   - Terminal state enforcement: once in `completed` or `abandoned`, no further transitions, answer submissions, or completions are allowed.
   - Attempt limits: 1–3 attempts allowed per question (default: 1), max 10 attempts total per session (capped at 30).
   - Question duration limits: bounded to `maxTimePerQuestionSeconds = 300` (5 minutes).

3. **Provider Dependency & Fault Tolerance (`server/src/services/ai/aiProvider.js`)**:
   - Built on the unified `AiProvider` abstraction (`{ name, complete({ system, user, maxOutputTokens, signal }) }`).
   - Requires configured AI provider (`AI_PROVIDER=gemini`). If unconfigured, returns `503 AI_PROVIDER_NOT_CONFIGURED`.
   - Timeout protection via `AbortController` (30,000ms standard). Returns `503 AI_PROVIDER_TIMEOUT` if provider hangs.
   - Sanitized error boundary: upstream network failures catch and mask raw secrets, simulated API keys, internal IPs, and stack traces, returning a safe, operational `503 AI_PROVIDER_FAILED`.
   - Provider audit envelope on session subdocument records `provider`, `model`, `promptTokens`, `completionTokens`, and `latencyMs`. Never stores raw credentials.

4. **Prompt Boundary Hardening & Delimiter Isolation (`server/src/domain/interview/interviewPromptBoundaries.js`)**:
   - Untrusted candidate text is strictly wrapped in XML boundary tags:
     `<candidate_untrusted_answer>...</candidate_untrusted_answer>`
   - Candidate input is XML-escaped (`&lt;`, `&gt;`, `&amp;`), neutralizing closing tag breakouts (`</candidate_untrusted_answer>`).
   - System instructions enforce strict adversarial boundaries: candidate answers cannot override developer instructions, rewrite rubrics, change grading dimensions, or extract system prompts.
   - Persona hijacking (e.g. DAN / "Do Anything Now") and ChatML delimiter injections are neutralized; evaluator evaluates technical accuracy solely against the true question rubric.

5. **Structured Output Validation & Answer Grounding (`server/src/services/interviewEvaluation.service.js`)**:
   - Model must respond strictly in JSON format. Non-JSON output or prose markdown returns `502 AI_MALFORMED_OUTPUT`.
   - Validates all 4 dimension scores: `accuracy`, `depth`, `clarity`, `relevance` ($0.0 \le x \le 1.0$). Out-of-bounds scores are rejected with `502`.
   - Script and HTML tags (`<script>`) in feedback are rejected with `502`.
   - Forbidden privilege escalation keys (e.g. `"verified": true`, `"evidenceGranted"`) in model response are rejected with `502`.
   - Grounding: `groundedSkills` returned by model are filtered strictly against canonical taxonomy and the target question's skill. Hallucinated or unasked skills are stripped. Failing answers ($< 0.65$) withhold verified skill evidence.

6. **Institutional Evidence Integration & Verification Policy (`server/src/services/interviewSession.service.js`)**:
   - Completed sessions persist individual `SkillEvidenceCheck` documents for every evaluated target skill.
   - **Verification Policy Rule**: AI evaluations are strictly advisory (`outcome: 'uncertain'`, `eligibleForVerified: false`). Raw AI claims can never directly create verified skills, regardless of composite score (even perfect 1.0 answers).
   - **Role Enforcement**: Student callers completing their session are always evaluated as `'ai'`. Passing `{ "evaluatorType": "human" }` in the request body is rejected/defaulted to `'ai'` unless the caller has an authenticated `admin` role in the database.
   - **Human Examiner Evaluation**: Only human-evaluated passes ($\ge 0.75$) grant `outcome: 'pass'` and `eligibleForVerified: true`.
   - **CareerTwin Consumption**:
     - `loadVerifiedEvidence(userId)` fetches only `eligibleForVerified: true` records.
     - `isCareerTwinStale` detects when new verified evidence has arrived (`latestEvidenceAt > generatedAt` or count mismatch).
     - Fresh CareerTwin generation consumes verified checks, upgrades skills to `strength: 'verified'`, and increments `indicators.verified`.
     - Skill-gap identifies verified interview skills as `GAP_STATUS.VERIFIED` and clears suggested evidence.

7. **Rate Limiting & Security Boundaries**:
   - `evaluationLimiter` sliding-window limiter mounted on answer submission routes.
   - Answer size constraints: answers $< 5$ characters or $> 5,000$ characters are rejected immediately at the HTTP boundary with `400 VALIDATION_ERROR` before invoking AI provider tokens.
   - Attempt count and session count boundaries prevent infinite loops and token exhaustion.
   - Strict IDOR tenant isolation: all interview session routes derive owner from verified JWT (`req.auth.userId`). Cross-tenant access returns `404 INTERVIEW_SESSION_NOT_FOUND`.

8. **Known MVP Limitations**:
   - **In-Memory Rate Limiting**: Limiters use memory stores; sliding windows reset on server restart. (Production recommendation: Redis store).
   - **Text-Only Answers**: Candidates type text responses; audio/speech-to-text and video proctoring are not included in the MVP.
   - **Curated Question Scope**: 15 curated questions across primary software engineering roles (Backend Developer, Frontend Developer, Fullstack Developer). Dynamic LLM question generation from live job descriptions is planned for future phases.
   - **Synchronous JSON Responses**: AI evaluation returns complete JSON objects synchronously. Real-time token streaming via SSE / WebSockets is not implemented in MVP.
   - **Linear Question Progression**: Sessions present questions sequentially in order; jumping between questions or pausing/resuming over days is not supported in MVP.

## 10. Intelligence Architecture & Cross-Domain Dependency Mapping

Nexora's intelligence architecture is built as a deterministic, multi-layered pipeline where each layer consumes well-defined contracts from previous layers without inventing data, bypassing verification boundaries, or leaking ungrounded claims.

### 10.1 Intelligence Layer Stack & Dependency Graph

```text
[1. Canonical Skill Taxonomy] (SKILL_TAXONOMY_VERSION = 2)
              │
              ├──────────────────────────────────┐
              ▼                                  ▼
[2. Institutional Evidence Engine]      [Role Catalogue] (v1)
    (claimed → supported → verified)             │
              │                                  │
              ▼                                  │
      [3. CareerTwin]                            │
(Aggregated Skills & Evidence)                   │
              │                                  │
              ├──────────────────┬───────────────┤
              ▼                  ▼               │
[4. Career Recommendation]  [Skill Gap] ◄────────┘
     (5D Deterministic)     (Missing/Claimed/Supported/Verified)
              │                  │
              │                  ├──────────────────────┐
              │                  ▼                      ▼
              │        [Personalized Roadmap]  [5. Career Readiness]
              │          (Prioritized Plan)      (READINESS_CONTRACT v1)
              │                                         │
              └──────────────────┬──────────────────────┘
                                 ▼
                     [Student Dashboard UI]
```

### 10.2 Five Core Intelligence Pillars

#### 1. Canonical Skill Taxonomy (`SKILL_TAXONOMY_VERSION = 2`)
- **Location**: `server/src/domain/skills/skillKey.js`
- **Responsibility**: Provides the authoritative identity, normalization, and display vocabulary for technical skills.
- **Normalization Invariant**: All skills across Profile, Resumes, Career Roles, Assessments, and AI Interviews normalize through `skillKey(name)`. `canonicalSkill(name)` guarantees strict identity preservation (`c++` vs `c#` vs `c`).
- **Consumers**:
  - `groundParsedResume.js`: Grounds extracted resume skills against canonical taxonomy.
  - `buildCareerTwin.js`: Merges skills across profile, resume, and evidence by canonical key.
  - `roleCatalogue.js`: All 10 role definitions reference canonical skills.
  - `assessmentContract.js` & `questionBank.js`: All assessment questions target canonical skill keys.
  - `interviewQuestions.js` & `interviewContract.js`: All interview questions and rubrics align with canonical skills.

#### 2. Institutional Evidence Engine & Verification Policy
- **Location**: `server/src/domain/evidence/evidence.js`, `server/src/models/SkillEvidenceCheck.model.js`
- **Strength Hierarchy & Recommendation Credit**:
  - `claimed` (credit: 0.40): Self-declared profile claims or ungrounded resume text.
  - `supported` (credit: 0.80): Demonstrable projects with technology tags/URLs or accredited certifications.
  - `verified` (credit: 1.00): Formal verification via passing deterministic assessment ($\ge 70\%$ pass mark on intermediate/advanced tier) or human-evaluated interview ($\ge 75\%$).
- **Anti-Hallucination & AI Policy Barrier**:
  - Raw AI model feedback is strictly advisory (`outcome: 'uncertain'`, `eligibleForVerified: false`).
  - No prompt, model response, or candidate submission can directly upgrade a skill to `verified`.
  - Invalidation: Writing new verified evidence marks CareerTwin as stale (`markCareerTwinStale`), triggering fresh re-aggregation.

#### 3. Deterministic Career Recommendation Engine (`ROLE_CATALOGUE_VERSION = 1`)
- **Location**: `server/src/domain/careers/roleCatalogue.js`, `matchRole.js`, `scoring.js`
- **Scoring Dimensions**:
  - `requiredSkills` (45%): Ratio of role's required skills matched by candidate.
  - `preferredSkills` (20%): Ratio of role's preferred skills matched by candidate.
  - `evidenceStrength` (20%): Mean evidence credit across matched skills (`claimed` = 0.4, `supported` = 0.8, `verified` = 1.0).
  - `interestAlignment` (10%): Matching candidate career interests against role category.
  - `backgroundAlignment` (5%): Academic branch/degree matching.
- **Contract Guarantees**:
  - 100% deterministic (identical inputs yield identical scores and bands).
  - Explicit non-goals: Zero synthetic market predictions (no salary numbers, hiring demand metrics, or speculative growth rates).

#### 4. Assessment & AI Interview Verification Subsystems
- **Location**: `server/src/domain/assessment/`, `server/src/domain/interview/`
- **Assessment Engine**:
  - Deterministic scoring (`exact_match`, `set_equality`, `partial_choice`, `normalized_string`).
  - Anti-tampering: Attempt evaluation is atomic; answer keys are stripped from client payloads.
  - Passing intermediate/advanced tests creates `SkillEvidenceCheck` (`strength: 'verified'`).
- **AI Interview Engine**:
  - Prompt boundary hardening: Untrusted candidate answers isolated in XML `<candidate_untrusted_answer>` tags with delimiter escaping to defeat prompt injections and jailbreaks.
  - Structured output schema validation: Dimensions strictly bounded to $[0.0, 1.0]$.
  - Grounding: Evaluator extracts only canonical skills explicitly targeted by the question.

#### 5. Deterministic Career Readiness Projection (`READINESS_CONTRACT_VERSION = 1`)
- **Location**: `server/src/domain/readiness/readinessContract.js`, `computeReadiness.js`, `server/src/services/readiness.service.js`
- **Endpoint**: `GET /api/careers/roles/:roleId/readiness`
- **Contract Guarantees**:
  - **Evidence States**:
    - `insufficient_data`: No CareerTwin or role comparison exists.
    - `partial`: At least one required skill is `missing` or `claimed`.
    - `supported`: All required skills are `supported` or `verified`, and at least one is not `verified`.
    - `verified`: Every required skill is `verified`.
  - **Data Freshness**:
    - `fresh`: CareerTwin is up-to-date with all inputs.
    - `stale`: Inputs (profile, resume, evidence checks) updated after CareerTwin generation.
    - `incomplete`: CareerTwin has not been generated yet.
  - **Count Parity**: `required` and `preferred` counts strictly match `computeSkillGap` counts.
  - **Blockers**: `blockingSkills` lists required skills that have not achieved `verified` status.
  - **Explicit Non-Goals**: No single composite readiness score, percentage, or confidence number. Readiness is an unvarnished projection of concrete evidence.

### 10.3 Cross-Domain Invariants & Security Boundaries

| Domain Boundary | Invariant / Security Policy | Enforcing Module |
|---|---|---|
| **Taxonomy Validation** | All skills must resolve to canonical taxonomy; unknown skills rejected or dropped as ungrounded | `skillKey.js`, `assessmentContract.js`, `interviewEvaluationSchema.js` |
| **Evidence Upgrade** | Raw AI feedback cannot verify skills; only deterministic assessment pass or human interview can verify | `skillEvidenceCheck.js`, `assessment.service.js`, `interviewEvaluation.service.js` |
| **Staleness Propagation** | New verified evidence marks CareerTwin stale; readiness immediately flags `dataStatus: 'stale'` | `careerTwin.service.js`, `readiness.service.js` |
| **Prompt Hardening** | Candidate text encapsulated with XML escaping; system instructions prioritized; delimiter breakouts blocked | `interviewQuestions.js`, `interviewEvaluation.service.js` |
| **Tenant Isolation (IDOR)** | All endpoints strictly scope queries by `req.auth.userId`; unowned resources return 404 with zero existence leakage | Express controllers & Mongoose queries |
| **Tamper Proofing** | Clients cannot submit scores, outcomes, or evidence flags; all scoring and checks computed server-side | Assessment & interview submission controllers |

## 11. Nexora Design & Experience Standard

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
