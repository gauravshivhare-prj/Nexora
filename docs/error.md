# Nexora — Error, Bug & Incident Log

## Strict Rule

**No known critical bug is allowed to remain unresolved before deployment.**

Do not hide errors. Do not suppress exceptions just to make the UI look successful.

## Severity

### P0 — Critical
- Application cannot start
- Authentication/security failure
- Data loss/corruption
- Production completely unavailable

### P1 — High
- Core feature unusable
- API consistently failing
- Incorrect critical recommendation/data

### P2 — Medium
- Feature partially broken
- Significant UI/UX issue
- Non-critical API failure

### P3 — Low
- Minor visual issue
- Copy issue
- Small non-blocking defect

## Bug Record

```text
## BUG-001
Date:
Environment:
Severity:
Feature:
Steps to reproduce:
Expected:
Actual:
Console/API error:
Root cause:
Fix:
Regression test:
Status: Open / In Progress / Fixed / Verified
```

## Logged Bugs

### BUG-001
Date: 2026-09-21
Environment: Development, backend test suite
Severity: P3 — Low
Feature: Resume list endpoint (Phase 3)
Steps to reproduce: Create a resume, then `GET /api/resumes`.
Expected: Each summary reports the resume's `textLength`.
Actual: Every summary reported `textLength: 0`.
Console/API error: None. The endpoint returned 200 with wrong data, which is
why a test rather than an error surfaced it.
Root cause: `listResumes` projects `extractedText` away so a list of ten
resumes does not transfer ten full documents. `toResumeSummary` then measured
a field that had not been loaded, and `undefined?.length ?? 0` gave 0.
Fix: Store `textLength` on the document, kept in sync by a `pre('validate')`
hook on the schema rather than by the service. Putting it on the schema means
it holds for any future writer too, not only the one that exists today.
Regression test: "omits the full text from the list" in
`server/tests/resume.test.js` asserts both that the text is absent and that
the length is correct.
Status: Verified

## Debugging Rules
1. Reproduce first.
2. Read the actual error.
3. Identify root cause.
4. Fix the root cause, not only the symptom.
5. Add a regression test where practical.
6. Re-test the complete affected flow.
7. Mark Verified only after successful testing.

## AI-Specific Errors
Check:
- Invalid JSON
- Missing fields
- Hallucinated facts
- Unsupported career requirements
- Empty responses
- API timeout/rate limit
- Prompt injection through user-provided content

AI output must pass schema and business validation.

## Pre-Deployment Bug Gate
- No P0 bugs
- No unresolved P1 bugs
- P2/P3 reviewed
- Critical flows manually tested
- Production smoke test completed

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
