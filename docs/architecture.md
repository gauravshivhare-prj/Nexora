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
| `GET` | `/api/career-twin` | Bearer | Stored twin plus `isStale`. Never regenerates |
| `POST` | `/api/career-twin` | Bearer | Rebuilds. `?narrative=true` adds an optional summary |
| `GET` | `/api/careers/roles` | Bearer | The curated role catalogue, with its source |
| `GET` | `/api/careers/recommendations` | Bearer | Ranked matches. `?limit=`, `?includeAll=` |
| `GET` | `/api/careers/roles/:roleId/match` | Bearer | Score against one named role |
| `GET` | `/api/careers/roles/:roleId/skill-gap` | Bearer | Per-skill status, reason and next step |

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

### Not implemented

- File upload. Resume text is submitted as text (`source: "pasted_text"`).
  The `file` subdocument and the `file_upload` source value exist in the
  schema so adding upload is a new value rather than a migration; the API
  rejects that source today rather than silently ignoring it.
- Any AI provider adapter, per the boundary section above.
- Any resume or CareerTwin UI. Phases 3 and 4 are backend only.
- `verified` evidence. Assessments and AI interviews are Phase 8, and nothing
  else may be promoted to fill the gap.
- Any readiness score, pending a target role to measure against.

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
