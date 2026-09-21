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

`User` and `StudentProfile` are deliberately separate documents. An
authentication change cannot put profile data at risk, a profile migration
cannot lock anyone out, and the `User` load on every authenticated request
stays small.

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
