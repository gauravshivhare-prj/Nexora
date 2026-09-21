# Nexora — UI/UX Specification

## Design Goal
Nexora should feel like a serious career product, not an AI chatbot wrapper.

## Design System
- Clean light interface
- Deep navy + blue primary accents
- Strong typography hierarchy
- Consistent spacing
- Minimal glassmorphism
- Accessible contrast
- Responsive desktop-first dashboard with mobile support
- Consistent cards, buttons, inputs, badges and charts

## Main Navigation

1. Dashboard
2. CareerTwin
3. Career Paths
4. Skill Gap
5. Roadmap
6. Assessments
7. AI Interview
8. Opportunities
9. Resume
10. Profile

## Core User Flow

```text
Landing
  ↓
Register/Login
  ↓
Onboarding
  ↓
Profile
  ↓
Resume Analysis
  ↓
CareerTwin
  ↓
Career Recommendation
  ↓
Skill Gap
  ↓
Roadmap
  ↓
Assessment / AI Interview
  ↓
Readiness Update
  ↓
Opportunity Matching
```

## UI Rules

### Every page must define
- Loading state
- Success state
- Empty state
- Error state
- Retry/recovery action
- Responsive behavior

### Forms
- Inline validation
- Clear required/optional labels
- No silent failures
- Disable submit while processing
- Prevent duplicate submissions

### AI Screens
Always show:
- What the AI is doing
- Data/context used where appropriate
- Loading state
- Generated result
- Edit/correct option
- Regenerate option where appropriate

Do not make AI output look infallible.

## Dashboard
Show:
- Career Readiness Score
- Target Career
- Top strengths
- Priority skill gaps
- Next best action
- Roadmap progress
- Opportunity matches

## CareerTwin
Display:
- Profile
- Skills
- Evidence
- Projects
- Certifications
- Career interests

## Skill Gap
Use:
- Current level
- Required level
- Gap
- Priority
- Why it matters
- Recommended action

## Roadmap
Each task should show:
- Skill
- Task
- Difficulty
- Estimated time
- Status
- Completion action

## AI Interview
Show:
- Role
- Question
- Answer area
- Timer if required
- Submit
- Feedback
- Weak areas
- Add to roadmap

## UX Principle

**Every screen should answer: "What should the student do next?"**

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


## 11. Student Continuity

The UI must preserve context across the journey.

Example:
- A skill identified as weak on the Skill Gap page should appear in the Roadmap.
- Completing the roadmap task should update progress.
- Assessment results should update the relevant skill/readiness state.
- Opportunity matching should reflect the latest profile/readiness state.

The user should never feel that each page is an independent demo.

## 12. Animation Quality Gate

Animation is accepted only if it improves:
- orientation,
- feedback,
- progress understanding,
- continuity,
- perceived responsiveness.

Every important async action should have an intentional loading state instead of freezing the page.

## 13. Accessibility
- Visible keyboard focus
- Sufficient contrast
- Semantic labels
- Reduced-motion support
- Do not communicate state through color alone
