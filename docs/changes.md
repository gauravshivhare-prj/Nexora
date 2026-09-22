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

### CHANGE-003
Date: 2026-09-21
Requested by: Project owner
Feature: CareerTwin foundation (Phase 4)
Reason: Phase 4 of the planned sequence, and the layer every later phase
computes from. Career matching, skill gaps and the roadmap all read a
CareerTwin rather than reaching into profiles and resumes themselves.
Current behavior: Profile and resume data existed but nothing reconciled them.
Requested behavior: A persistent, derived career representation with skills
attached to traceable evidence, plus canonical skill identity so the two
sources can be compared at all.
Impact: Additive. No change to authentication, profiles, resumes or the
frontend. Two new shared domain modules (skill identity, evidence) that later
phases depend on.
Files/modules affected:
- `domain/skills/skillKey.js`, `domain/evidence/evidence.js`,
  `domain/careerTwin/buildCareerTwin.js`,
  `domain/careerTwin/careerTwinNarrative.js`, `models/CareerTwin.model.js`,
  `services/careerTwin.service.js`, `controllers/careerTwin.controller.js`,
  `routes/careerTwin.routes.js`.
- Registration in `models/index.js` and `routes/index.js`; two new error codes.
Risk: Low. Purely derived data — the collection can be deleted and rebuilt.
The builder is a pure function, and the AI path is optional and non-fatal.
Decision: Approved
Implemented: Yes
Tested: 63 new tests — 13 on skill identity, 29 pure-function tests on the
builder and evidence model, 21 API tests covering ownership, the no-input
case, staleness, and a narrative that is invented, malformed or unavailable.
Full regression green: 247 backend, 37 frontend. `npm audit` reports 0
vulnerabilities; no dependency was added.

### CHANGE-004
Date: 2026-09-21
Requested by: Project owner
Feature: Career recommendation foundation (Phase 5)
Reason: Phase 5 of the planned sequence. Skill gaps and the roadmap are both
computed against a target role, so role requirements have to exist first.
Current behavior: A CareerTwin existed but nothing to compare it against.
Requested behavior: A versioned role catalogue and a deterministic,
explainable matching engine with documented weights.
Impact: Additive and read-only. No new collection, no writes, no change to
any existing endpoint or to the frontend.
Files/modules affected:
- `domain/careers/roleCatalogue.js`, `domain/careers/scoring.js`,
  `domain/careers/matchRole.js`, `services/recommendation.service.js`,
  `controllers/recommendation.controller.js`, `routes/career.routes.js`.
- Registration in `routes/index.js`; one new error code.
Risk: Low. Nothing is persisted and nothing existing changed. The main risk
is editorial rather than technical — the catalogue and the weights are
judgements, which is why both are versioned and published in every response.
Decision: Approved
Implemented: Yes
Tested: 47 new tests. Two real defects were found and fixed during the
phase: `backgroundScore` compared word arrays instead of strings, so every
known background scored zero; and a test helper built skill keys by hand
rather than through `skillKey`, hiding a synonym-matching path. Full
regression green: 294 backend, 37 frontend. `npm audit` reports 0
vulnerabilities; no dependency was added.

### CHANGE-005
Date: 2026-09-21
Requested by: Project owner
Feature: Skill gap foundation (Phase 6)
Reason: Phase 6 of the planned sequence, and the input the roadmap is
generated from. It is also where the evidence model built in Phase 4 first
becomes visible to a student.
Current behavior: A career match named missing skills but said nothing about
how well-evidenced the matched ones were.
Requested behavior: A per-skill status distinguishing demonstrated from
merely claimed, each with a reason and a concrete way to improve it.
Impact: Additive and read-only. One new route on the existing career router.
Files/modules affected:
- `domain/skillGap/computeSkillGap.js`, `services/skillGap.service.js`.
- One handler added to `controllers/recommendation.controller.js` and one
  route to `routes/career.routes.js`.
- `domain/careerTwin/buildCareerTwin.js` — evidence is now sorted
  strongest-first (see BUG-004).
Risk: Low. Nothing persisted, nothing existing changed except the evidence
ordering fix, which is covered by updated CareerTwin tests.
Decision: Approved
Implemented: Yes
Tested: 22 new tests, including the case the feature exists for — a skill
declared "expert" on a profile is reported as `claimed`, while the same
declaration plus a project is reported as `supported`. Full regression green:
316 backend, 37 frontend. `npm audit` reports 0 vulnerabilities; no
dependency was added.

### CHANGE-006
Date: 2026-09-21
Requested by: Project owner
Feature: Personalized roadmap foundation (Phase 7)
Reason: Phase 7 of the planned sequence, and the point where the chain from
profile to action closes.
Current behavior: A skill gap named what was missing but said nothing about
what to do about it.
Requested behavior: A prioritised plan generated from real gaps, with a
verification step per item and no fabricated learning resources.
Impact: Additive and read-only. One new route on the existing career router.
No new collection, no writes.
Files/modules affected:
- `domain/roadmap/buildRoadmap.js`, `domain/roadmap/resourceReferences.js`,
  `services/roadmap.service.js`.
- One handler added to `controllers/recommendation.controller.js` and one
  route to `routes/career.routes.js`.
Risk: Low technically. The editorial risk — a roadmap being mistaken for
curated advice — is handled by shipping `resourcesVerified: false` and an
explanatory note in every response, and by a test that fails if any resource
ever carries a URL.
Decision: Approved
Implemented: Yes
Tested: 31 new tests, including one that follows a student through the loop:
generate a roadmap, add the project it asked for, regenerate, and watch the
item close because the evidence changed rather than because anything was
marked done. Full regression green: 347 backend, 37 frontend. `npm audit`
reports 0 vulnerabilities; no dependency was added.

Note on exit criteria: "tasks can be marked complete" is satisfied by
evidence rather than by a flag. Recorded in phases.md with the reasoning.

### CHANGE-007
Date: 2026-09-22
Requested by: Project owner
Feature: Public landing experience at `/`
Reason: `/` was the Phase 0 foundation page — a connection check and a note
saying no product existed yet. Five stages of the loop now do, and the public
entry point was describing a build rather than a product.
Current behavior: `/` rendered `FoundationPage`, with an API health check.
Requested behavior: A narrative landing page that explains the actual product
loop — CareerTwin, evidence strengths, explainable matching, skill gap,
roadmap, readiness — with scroll-linked motion, and with every stage labelled
as available or in development.
Impact: Frontend only. No backend change, no API change, no dependency added.
Routing is unchanged apart from what `/` renders; `/login`, `/register` and
every guarded route behave exactly as before.
Files/modules affected:
- New: `pages/LandingPage.jsx`, `components/landing/*` (14 sections plus
  `Section.jsx`), `components/landing/animation/*` (four hooks and `Reveal`),
  `components/landing/landing.css`.
- Changed: `routes/AppRoutes.jsx` (`/` → `LandingPage`), `index.css` (smooth
  in-page anchors, reset under reduced motion).
- Removed as superseded: `pages/FoundationPage.jsx`,
  `components/ApiConnectionPanel.jsx`, `hooks/useApiHealth.js`,
  `services/health.service.js`. The client no longer calls `/api/health`; the
  endpoint itself is untouched.
- Tests: new `tests/landing.e2e.test.js`; `helpers/stack.js` gained
  `startWebStack` (Vite and Chrome only — the page makes no API calls);
  `helpers/browser.js` gained viewport, emulated-media and selector-click
  support. `auth.e2e.test.js`'s foundation-page assertion was rewritten
  against the new root; one sampling race in `dashboard.e2e.test.js` became a
  wait.
Risk: Low. Nothing behind the login changed, and no claim on the page asserts
a capability the backend does not have — assessments, AI interviews and
opportunity matching are shown as in development at each stage rather than in
a footnote. Every example figure is labelled as an example.
Decision: Approved
Implemented: Yes
Tested: 18 new browser tests covering rendering, both calls to action, the
navigation, the phone disclosure, horizontal overflow at six widths, the
reduced-motion path and the absence of signed-in content on a public page.
Full frontend regression green: 134 tests. Production build passes. No
dependency added — the motion is CSS, SVG, IntersectionObserver and one
requestAnimationFrame-coalesced pointer handler.

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
