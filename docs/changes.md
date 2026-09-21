# Nexora — Change Control

## Purpose
This file prevents uncontrolled feature changes and scope creep.

## Rules

### 1. No Direct Feature Changes
Any requested change must be documented before implementation.

### 2. Change Record

Use:

```text
## CHANGE-001
Date:
Requested by:
Feature:
Reason:
Current behavior:
Requested behavior:
Impact:
Files/modules affected:
Risk:
Decision: Approved / Rejected / Deferred
Implemented:
Tested:
```

### 3. Change Categories

**Minor**
- Copy/text
- Spacing
- Non-functional UI adjustment

**Moderate**
- API modification
- Data model change
- Existing feature behavior change

**Major**
- New core feature
- Architecture change
- Database migration
- Authentication/security change

Major changes require review before coding.

## Change Log

### CHANGE-001
Date: 2026-09-21
Requested by: Project owner
Feature: Student Profile (Phase 2)
Reason: Phase 2 of the planned sequence. Every later phase — resume
intelligence, CareerTwin, career matching, skill gap, roadmap — reads student
data, and none of them can start without somewhere for it to live.
Current behavior: No profile existed. `User` held account identity only.
Requested behavior: A separate `StudentProfile` document holding personal,
academic and career information, skills, projects and certifications, with a
protected API and a `/profile` page.
Impact: Additive. No change to authentication, the JWT design, password
hashing or the `User` schema.
Files/modules affected:
- Backend: `constants/profilePolicy.js`, `utils/fieldTypes.js`,
  `models/StudentProfile.model.js`, `services/profile.service.js`,
  `controllers/profile.controller.js`, `routes/profile.routes.js`,
  plus registration in `models/index.js` and `routes/index.js`.
- Frontend: `pages/ProfilePage.jsx`, `services/profile.service.js`,
  `constants/profileOptions.js`, `components/FieldShell.jsx`,
  `components/FormSelect.jsx`, `components/FormTextarea.jsx`,
  `components/TagListField.jsx`, `components/profile/*`, plus the `/profile`
  route and a link from the signed-in landing page.
- `FormField` was refactored onto the shared `FieldShell`; `FormAlert` gained a
  `tone` prop. Both are behaviour-preserving and covered by the existing
  authentication end-to-end tests.
Risk: Low. Additive model and routes; the authentication surface is untouched.
The one shared-component refactor is covered by existing tests.
Decision: Approved
Implemented: Yes
Tested: 38 backend tests, 15 browser end-to-end tests. Full regression green —
109 backend, 37 frontend. Production build passes. `npm audit` reports 0
vulnerabilities in both packages; no dependency was added.

### CHANGE-002
Date: 2026-09-21
Requested by: Project owner
Feature: Resume Intelligence foundation (Phase 3)
Reason: Phase 3 of the planned sequence, and the first AI-facing feature. It
establishes the provider boundary and the untrusted-output pipeline that
CareerTwin and every later AI feature reuse.
Current behavior: No resume storage and no AI integration of any kind.
Requested behavior: A `Resume` entity with extraction and analysis states, a
provider-agnostic AI boundary, and a validation pipeline that never stores
unverified model output.
Impact: Additive. Authentication, profiles and the frontend are untouched —
this change adds no client code at all.
Files/modules affected:
- `constants/resumePolicy.js`, `models/Resume.model.js`,
  `services/ai/aiProvider.js`, `services/ai/aiJson.js`,
  `domain/resume/parsedResumeSchema.js`, `domain/resume/groundParsedResume.js`,
  `domain/resume/resumePrompt.js`, `services/resume.service.js`,
  `controllers/resume.controller.js`, `routes/resume.routes.js`.
- Registration in `models/index.js` and `routes/index.js`; new error codes;
  optional `AI_PROVIDER` in `config/env.js` and `.env.example`.
Risk: Low as shipped. The AI path cannot run at all without a configured
provider, so the new surface in production is resume storage and retrieval.
Scope explicitly held back: no AI provider implementation, no file upload, no
UI. Each is recorded in phases.md with the reason.
Decision: Approved
Implemented: Yes
Tested: 75 new tests — 39 pure-function tests over the pipeline, 36 API tests
against a provider double covering ownership, unconfigured providers, provider
failure, malformed JSON, wrong-shape output and invented content. Full
regression green: 184 backend, 37 frontend. `npm audit` reports 0
vulnerabilities; no dependency was added.

## Freeze Rule
Once a phase is approved, do not modify its requirements casually.

## Scope Control
The following do NOT enter MVP without explicit approval:
- New major AI features
- Extra dashboards
- Complex integrations
- Microservices
- Unverified external data scraping
- Non-essential animations

## Rollback
Every major change must be reversible through Git.

## Documentation
Any approved change affecting:
- PRD
- SRS
- Architecture
- UI/UX
- API
must update the corresponding document.

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
