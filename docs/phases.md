# Nexora — Development Phases

## Purpose
This document defines the controlled development sequence for Nexora.

**Rule:** Never jump ahead to multiple features at once. Each phase must be completed, tested, reviewed, and accepted before the next phase begins.

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

## Phase 5 — Career Recommendation
- Career-role catalogue
- Role requirements
- Matching/scoring engine
- Explanation for each recommendation

**Exit criteria**
- Recommendations are deterministic/reproducible for identical inputs.
- Match score has a documented formula.
- User can see why a role matches.

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

## Phase 8 — Assessment & AI Interview
- Skill assessment
- AI-generated questions
- Answer submission
- Evaluation
- Weak-area extraction
- CareerTwin update

**Exit criteria**
- Interview results are stored.
- AI output follows a strict schema.
- Invalid AI responses are handled.
- Results can update relevant readiness signals.

## Phase 9 — Opportunity Matching
- Opportunity dataset
- Eligibility checks
- Skill matching
- Match explanation
- Opportunity details

**Exit criteria**
- Opportunity data contains source/date fields.
- No unsupported claim of live data.
- Matching logic is explainable.

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
