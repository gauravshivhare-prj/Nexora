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
