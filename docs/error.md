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

### BUG-002
Date: 2026-09-21
Environment: Development, backend test suite
Severity: P2 — Medium
Feature: Career match scoring (Phase 5)
Steps to reproduce: Score a student whose academic branch is "Computer
Science and Engineering" against Backend Developer.
Expected: `backgroundAlignment` scores 1 — that branch is listed among the
role's common backgrounds.
Actual: It scored 0, the same as an unrelated branch. Every student with a
branch filled in was scored as though their background were irrelevant, and
one who had left it blank scored *higher* than one who had filled it in
correctly.
Console/API error: None. Wrong scores, no failure.
Root cause: `normalise()` returns an array of words, for word-level title
comparison. `backgroundScore` used it for a substring test, so the code read
`array.includes(array)`, which is always false.
Fix: Split the helper in two — `normalise()` for word lists, `flatten()` for
a single comparable string — and use `flatten()` in `backgroundScore`, testing
containment in both directions so "Computer Science" and "Computer Science and
Engineering" match each other.
Regression test: "treats an unknown academic background as neutral, not
negative" in `server/tests/careerMatch.test.js` asserts the full ordering
related > unknown > unrelated, which the bug broke.
Status: Verified

### BUG-003
Date: 2026-09-21
Environment: Development, backend test suite
Severity: P3 — Low (test-only)
Feature: Career match tests (Phase 5)
Steps to reproduce: Score a student whose skill is written "js" against a
role requiring "JavaScript".
Expected: They match — `skillKey` resolves the synonym.
Actual: No match, in the test only.
Root cause: The test helper built skill keys with an inline
`toLowerCase().replace(...)` instead of calling `skillKey`. That reproduces
normalisation but not the alias list, so the helper produced twins no real
CareerTwin would ever contain, and the test was exercising the matcher
against impossible data.
Fix: The helper calls `skillKey`, as the CareerTwin builder does.
Regression test: "matches a skill across a difference in spelling" in
`server/tests/careerMatch.test.js`.
Status: Verified

### BUG-004
Date: 2026-09-21
Environment: Development, backend test suite
Severity: P2 — Medium
Feature: CareerTwin evidence ordering / skill gap reasons (Phase 6)
Steps to reproduce: Give a student a profile skill and a project using it,
generate a CareerTwin, then read the skill gap for a role requiring it.
Expected: The reason beside a `supported` status cites the project.
Actual: "You have pointed at concrete work involving Node.js. You listed this
on your profile as expert." — a sentence that claims concrete work and then
cites the profile listing.
Console/API error: None. Incoherent user-facing text, no failure.
Root cause: `buildCareerTwin` appended evidence in collection order, so
self-declared evidence always came first. Everything downstream that quotes a
single reason takes `evidence[0]`, so the weakest evidence was the one shown.
Fix: Sort each skill's evidence strongest-first in `buildCareerTwin`, using a
stable sort so the result stays deterministic. This also improves the
CareerTwin payload and the recommendation evidence list, both of which lead
with the first item.
Regression test: "distinguishes a typed skill from a demonstrated one end to
end" in `server/tests/skillGap.test.js`, plus an updated assertion in
`server/tests/careerTwin.build.test.js` that now pins the intended ordering
rather than the accidental one.
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
