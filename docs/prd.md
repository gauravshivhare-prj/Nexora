# Nexora — Product Requirements Document

## 1. Product
**Nexora — AI-Powered Career Readiness & Employability Platform**

## 2. Vision
Help students understand where they are, where they want to go, what they are missing, and what they should do next.

## 3. Target Users
- College students
- Fresh graduates
- Educational institutions

## 4. Problem
Students receive fragmented career guidance. Career discovery, skill development, resume preparation, interview practice and opportunity discovery are often disconnected.

## 5. Goals
- Personalize career guidance
- Identify role-specific skill gaps
- Convert gaps into actions
- Measure readiness
- Connect students to relevant opportunities

## 6. Core Features
1. Authentication
2. Student profile
3. Resume intelligence
4. CareerTwin
5. Career recommendation
6. Skill-gap analysis
7. Personalized roadmap
8. Assessments
9. AI mock interview
10. Opportunity matching
11. Dashboard

## 7. MVP
The MVP must demonstrate:

**Profile → CareerTwin → Career → Skill Gap → Roadmap → Assessment → Opportunity Match**

Do not expand MVP scope until this loop works reliably.

## 8. User Stories

### Student
- As a student, I want to create my profile so Nexora understands my background.
- I want to upload my resume so my skills/projects can be analyzed.
- I want career recommendations with explanations.
- I want to know my skill gaps.
- I want an actionable roadmap.
- I want to practice interviews.
- I want to track readiness.
- I want to discover relevant opportunities.

## 9. Success Metrics
For prototype evaluation:
- Complete onboarding successfully
- Generate valid CareerTwin
- Generate explainable career matches
- Generate skill gaps from role requirements
- Generate actionable roadmap
- Complete an assessment/interview
- Update readiness
- Show opportunity match

## 10. Non-Goals for MVP
- Fully automated recruitment
- Guaranteed job placement
- Unverified live government-job scraping
- Complex microservice infrastructure
- Training a large custom LLM

## 11. Risks
- Hallucinated AI output
- Poor recommendation quality
- Unverified opportunity data
- API failures
- Privacy/security issues
- Scope creep

## 12. Acceptance Principle
No feature is accepted merely because the UI renders. It must produce correct, validated and recoverable behavior.

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


## Product Experience Requirement

Nexora must behave as one continuous student-support system. Data and progress produced in one feature must meaningfully feed the next feature.

The product should solve a student's problem through a sequence of actions rather than merely display AI-generated information.
