# Nexora — Development Rules

## Core Rule

**Slow, feature-wise development. Quality over speed.**

Do not build the entire product in one pass.

## Development Cycle

For EVERY feature:

```text
1. Understand requirement
2. Define acceptance criteria
3. Design data/API
4. Implement backend
5. Test backend
6. Implement frontend
7. Test frontend
8. Test edge cases
9. Integrate
10. Review
11. Mark complete
12. Only then start next feature
```

## Feature Branching

Suggested:

```text
main
develop
feature/auth
feature/profile
feature/resume
feature/careertwin
feature/career-match
feature/skill-gap
feature/roadmap
feature/interview
feature/opportunities
```

Never directly push experimental/broken code to `main`.

## Coding Standards

### JavaScript/React
- Functional components
- Reusable components
- Clear naming
- Avoid giant components
- Avoid duplicated logic
- Centralize API client
- Keep business logic out of UI components where practical

### Backend
- Routes → Controllers → Services → Data access
- Centralized validation
- Centralized error middleware
- No database queries scattered across controllers
- No secrets in source code

### Database
- Define schemas/models deliberately
- Validate required fields
- Add indexes where justified
- Avoid duplicate sources of truth

## Definition of Done

A feature is done only when:
- It works on happy path.
- Invalid input is handled.
- Loading state exists.
- Error state exists.
- Empty state exists where applicable.
- API is validated.
- No console errors.
- No obvious UI breakage.
- Relevant tests pass.
- README/docs are updated if needed.

## No "Fix Later" Rule

Do not knowingly move a broken feature forward.

If blocked:
1. Record it in `error.md`.
2. Identify root cause.
3. Fix it.
4. Test it.
5. Continue.

## Git Commit Style

```text
feat: add student profile API
fix: handle invalid resume upload
refactor: extract career scoring service
test: add profile validation tests
docs: update architecture
```

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


## UX Quality Gate

Before marking a UI feature complete:
- Verify loading, success, empty and error states.
- Verify animation timing and interaction continuity.
- Verify mobile/responsive behavior.
- Verify keyboard focus where applicable.
- Verify the feature connects to real state/data rather than static demo values.
- Verify transitions do not hide errors or delay user actions.
