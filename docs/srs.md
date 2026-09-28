# Nexora — Software Requirements Specification

## 1. Functional Requirements

### Authentication
- FR-AUTH-01: User can register.
- FR-AUTH-02: User can log in.
- FR-AUTH-03: Protected resources require authentication.
- FR-AUTH-04: User can log out.
- FR-AUTH-05: Unauthorized access returns an appropriate error.

### Profile
- FR-PROF-01: User can create/update academic information.
- FR-PROF-02: User can manage skills.
- FR-PROF-03: User can manage projects.
- FR-PROF-04: User can manage certifications.
- FR-PROF-05: User can define career preferences.

### Resume
- FR-RES-01: User can upload supported resume files.
- FR-RES-02: System validates file type and size.
- FR-RES-03: System extracts resume information.
- FR-RES-04: User can review/edit extracted information.

### CareerTwin
- FR-TWIN-01: System creates a structured CareerTwin.
- FR-TWIN-02: System stores skill evidence.
- FR-TWIN-03: System updates relevant signals after assessments.

### Career Recommendation
- FR-CAR-01: System stores career roles and requirements.
- FR-CAR-02: System calculates career matches.
- FR-CAR-03: System provides match explanations.

### Skill Gap
- FR-GAP-01: System compares current vs required skills.
- FR-GAP-02: System calculates gap priority.
- FR-GAP-03: System provides recommended actions.

### Roadmap
- FR-ROAD-01: System generates a roadmap.
- FR-ROAD-02: User can track task status.
- FR-ROAD-03: Completion updates progress.

### Skill Assessment
- FR-ASM-01: User can browse sanitized skill assessments filtered by canonical skill taxonomy and difficulty level (`beginner`, `intermediate`, `advanced`).
- FR-ASM-02: User can start or resume an assessment attempt; system deduplicates active in-progress attempts.
- FR-ASM-03: System validates answer submissions against strict structural bounds (max 50 answers, max 1000 characters per answer, primitive types only).
- FR-ASM-04: System calculates scores deterministically using rule-based scoring engines (`exact_match`, `set_equality`, `partial_choice`, `normalized_string`).
- FR-ASM-05: Passing intermediate or advanced assessments (score >= 70%) creates verified evidence records and flags CareerTwin as stale.
- FR-ASM-06: System enforces an attempt limit of 5 completed attempts per assessment and marks expired attempts as timed-out.
- FR-ASM-07: System enforces IDOR tenant isolation (404 responses), atomic concurrency locking, anti-tampering guards, and sliding-window rate limiting.

### AI Interview
- FR-INT-01: User can initialize an interview session targeting a role and 1–5 canonical skills at a chosen difficulty level (`beginner`, `intermediate`, `advanced`) and question count (1–10).
- FR-INT-02: System selects curated questions from the versioned question bank with stable IDs (`iq-*-*`) aligned with canonical taxonomy.
- FR-INT-03: User advances session through strict lifecycle state machine (`initialized` → `in_progress` → `completed` | `abandoned` | `timed_out` | `failed`), bounded by duration (max 600s per question, max 90m per session) and attempt limits.
- FR-INT-04: System validates candidate answers (5–5,000 chars) and XML-escapes text within `<candidate_untrusted_answer>` prompt boundaries, with sandwich defense and ChatML neutralization preventing injection and instruction override.
- FR-INT-05: AI evaluation service evaluates answers against 4 weighted rubric dimensions summing to 1.0 (`accuracy`: 0.35, `depth`: 0.30, `clarity`: 0.20, `relevance`: 0.15) and returns structured JSON output with feedback, strengths, and growth areas.
- FR-INT-06: Evaluator domain grounds skills against canonical taxonomy, strips unasked/hallucinated skills, withholds skill grounding on failing answers (< 0.65), and caps adversarial attempts to <= 0.1.
- FR-INT-07: Malformed model outputs, forbidden privilege escalation fields, or provider failures safely return operational 502/503 errors without leaking secrets, internal IPs, or credentials, and without recording fake evaluations in the database.
- FR-INT-08: Completed sessions persist `SkillEvidenceCheck` records; institutional policy enforces that AI evaluations are strictly advisory (`outcome: 'uncertain'`, `evidenceStrength: 'supported'`), while only authorized human passes (>= 75%) grant `verified` status.
- FR-INT-09: Advisory interview evidence (`supported`) coexists with assessment evidence without downgrading or overwriting existing verified evidence (`verified`) in CareerTwin or skill-gap analysis.
- FR-INT-10: Verified interview results flag CareerTwin staleness and are consumed by CareerTwin, skill-gap, and readiness scoring.
- FR-INT-11: Frontend client (`/interview`) provides full interactive flow: role/skill setup, active question flow with live countdown timer and character counter, retry resolution on provider interruption, dimension breakdown cards, institutional evidence badges, and session history.
- FR-INT-12: System bounds AI evaluation cost and latency (max 1024 output tokens, in-flight answer evaluation deduplication) and protects multi-tenant isolation (IDOR 404 responses).

### Opportunities
- FR-OPP-01: System stores opportunity records.
- FR-OPP-02: System evaluates basic eligibility.
- FR-OPP-03: System calculates skill match.
- FR-OPP-04: System displays source/date metadata.

## 2. Non-Functional Requirements

### Performance
- Normal API responses should be reasonably fast.
- Long AI operations must display progress/loading states.
- Avoid unnecessary repeated AI calls.

### Security
- Passwords must never be stored in plaintext.
- Secrets must be environment variables.
- Protected APIs must verify authentication.
- Users must only access their own private data.

### Reliability
- API failures must return controlled errors.
- AI failures must have fallback behavior.
- Database failures must not expose internal details.

### Maintainability
- Modular services
- Reusable UI components
- Clear naming
- Documented APIs
- Tests for critical business logic

### Usability
- Responsive interface
- Accessible labels
- Clear feedback
- Consistent navigation

## 3. Data Integrity
- Validate inputs at API boundary.
- Validate AI outputs before persistence.
- Use enums/constraints where appropriate.
- Prevent duplicate submissions where applicable.

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
