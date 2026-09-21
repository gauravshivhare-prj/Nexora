# Nexora — Part Distribution

## Team
- Gaurav — Tech Lead
- Praveshika
- Anvesha
- Radhika

## Gaurav — Technical Ownership
- Architecture
- Backend/API
- Database integration
- GenAI/ML integration
- Authentication/security
- Deployment
- Technical integration
- Code quality gate

## Anvesha — AI/ML Ownership
- AI prompts
- Career recommendation methodology
- Skill-gap methodology
- AI interview logic
- AI output validation
- AI/ML testing and research

## Radhika — UI/UX Ownership
- UI/UX implementation support
- Design system
- Dashboard screens
- User flows
- Responsive UI
- Visual QA

## Praveshika — Product/Documentation Ownership
- Requirements
- Product documentation
- Problem/solution content
- User stories
- Submission documents
- Documentation QA

## Shared Responsibility
Everyone contributes to:
- Testing
- Bug reporting
- Review
- Demo preparation
- Final presentation

## Important
Ownership does not mean working in isolation.

Before merging:
- Feature owner explains the change.
- Technical dependencies are reviewed.
- Tests are run.
- Documentation is updated if affected.

## Work Rule
**One feature at a time.**
No member should start an unrelated feature while a blocking defect exists in the current feature.

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
