# Nexora — Project Rules

## Non-Negotiable Development Rules

1. Build slowly and feature-wise.
2. Never build multiple major features simultaneously.
3. Do not sacrifice code quality for demo speed.
4. Do not knowingly leave errors for later.
5. Do not bypass validation to make a feature appear working.
6. Do not hardcode secrets.
7. Do not fabricate data or AI results.
8. Do not add dependencies without a reason.
9. Do not introduce microservices prematurely.
10. Every completed feature must pass its acceptance criteria.

## Feature Gate

Before starting Feature N+1:

- Feature N works.
- Edge cases are handled.
- Error states work.
- Relevant tests pass.
- No blocking bug exists.
- Code has been reviewed.
- Git commit is clean.
- Required documentation is updated.

## AI Rule

LLMs are probabilistic. Treat all model output as untrusted input until schema-validated and business-validated.

## Production Rule

If a bug appears during deployment or production testing, stop and fix it before continuing with new features.

## Definition of Success

Nexora is successful when the core user journey works reliably:

**Profile → CareerTwin → Career → Skill Gap → Roadmap → Assessment → Readiness → Opportunity**

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
