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

`User` and `StudentProfile` are deliberately separate documents. An
authentication change cannot put profile data at risk, a profile migration
cannot lock anyone out, and the `User` load on every authenticated request
stays small.

`Resume` is non-unique per user because a resume is a dated document, not a
property of a person — comparing this year's against last year's is the point.

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
| `POST` | `/api/resumes/:id/analysis` | Bearer | Runs the AI pipeline. 503 when unconfigured |

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

**Nexora ships with no provider implementation.** There is deliberately no
built-in fallback returning canned output — a fake provider would make resume
analysis look finished while inventing a student's career data. With nothing
registered, `POST /api/resumes/:id/analysis` answers `503
AI_PROVIDER_NOT_CONFIGURED` and says so. Everything else works without it.

To enable analysis: implement the contract, call `registerAiProvider()` at
startup, and set `AI_PROVIDER` to its name. The provider's own API key belongs
in its own environment variable.

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

### Not implemented

- File upload. Resume text is submitted as text (`source: "pasted_text"`).
  The `file` subdocument and the `file_upload` source value exist in the
  schema so adding upload is a new value rather than a migration; the API
  rejects that source today rather than silently ignoring it.
- Any AI provider adapter, per the boundary section above.
- Any resume UI. Phase 3 is the backend domain and service contract only.

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
