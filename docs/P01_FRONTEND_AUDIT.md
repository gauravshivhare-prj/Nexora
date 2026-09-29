# P01 — Frontend Architecture Audit

**Branch:** `praveshika-codezz`
**Baseline SHA:** `ba88c7f9d8dd33afe3e6d1eb61f68b8f07efb98d`
**Date:** 2026-09-26

---

## 1. Routes (`client/src/routes/AppRoutes.jsx`)

### Delivered routes
| Path | Component | Protected |
|------|-----------|-----------|
| `/` | `LandingPage` | No |
| `/login` | `LoginPage` | No |
| `/register` | `RegisterPage` | No |
| `/app` | `DashboardPage` | Yes (AppLayout) |
| `/profile` | `ProfilePage` | Yes |
| `/resume` | `ResumePage` | Yes |
| `/resume/:resumeId` | `ResumeDetailPage` | Yes |
| `/career-twin` | `CareerTwinPage` | Yes |
| `/careers` | `CareersPage` | Yes |
| `/careers/:roleId/skill-gap` | `SkillGapPage` | Yes |
| `/careers/:roleId/roadmap` | `RoadmapPage` | Yes |
| `*` | → `/` (redirect) | — |

### Missing routes (UI phases not yet delivered)
- `/assessments` — Assessment catalog (P13)
- `/assessments/:id` — Assessment runner (P14)
- `/assessments/attempts/:attemptId` — Assessment results (P16)
- `/interview` — Interview entry (P18)
- `/interview/:sessionId` — Interview question (P19)
- `/interview/:sessionId/result` — Interview result (P20)
- `/readiness` — Readiness visualization (P21)
- `/opportunities` — Opportunity list (P22)

### Auth guard design ✅
- Single `ProtectedRoute` wraps `AppLayout` — all nested routes protected by construction.
- Three-state guard: `RESTORING` → loading screen (no flicker), `ANONYMOUS` → redirect to `/login` with `state.from`, `AUTHENTICATED` → render.
- No per-route guard repetition (previous risk eliminated).

---

## 2. Pages (`client/src/pages/`)

| File | Size | Notes |
|------|------|-------|
| `ProfilePage.jsx` | 22KB | Largest page — complex multi-section form |
| `DashboardPage.jsx` | 16KB | Risk: review for hardcoded data |
| `CareerTwinPage.jsx` | 17KB | Risk: check API field bindings |
| `RoadmapPage.jsx` | 14KB | Check prerequisites rendering |
| `CareersPage.jsx` | 14KB | Check filter/sort logic |
| `ResumePage.jsx` | 13KB | Check upload + polling |
| `SkillGapPage.jsx` | 9KB | Check for hardcoded gaps |
| `ResumeDetailPage.jsx` | 11KB | Check long-content overflow |
| `LandingPage.jsx` | 3KB | OK |
| `LoginPage.jsx` | 4KB | OK |
| `RegisterPage.jsx` | 6KB | OK |

---

## 3. Components (`client/src/components/`)

### Shared components ✅ (clean, focused)
- `FormField.jsx` — label + input wrapper
- `FormTextarea.jsx` — textarea wrapper
- `FormSelect.jsx` — select wrapper
- `FieldShell.jsx` — field container with label/error slot
- `FormAlert.jsx` — banner-level alert
- `SubmitButton.jsx` — loading-aware submit
- `TagListField.jsx` — editable tag list
- `AppNav.jsx` — main nav with active state
- `ThemeToggle.jsx` — dark/light toggle
- `PageShell.jsx` — page wrapper with title/header slot
- `ProtectedRoute.jsx` — auth guard

### Feature components
- `profile/` — `ProfileCard`, `CertificationsEditor`, `ProjectsEditor`, `SkillsEditor`, `RepeatableList`
- `resume/` — `ParsedResume`, `ProcessingStatus`
- `careerTwin/` — `SkillEvidence`
- `careers/` — `GapStatus`
- `landing/` — (not listed, exists)

### Risks flagged
- No duplication found in shared components.
- `RepeatableList` in profile/ — verify it doesn't duplicate logic already in `TagListField`.

---

## 4. Hooks (`client/src/hooks/`)

| Hook | Purpose | Pattern |
|------|---------|---------|
| `useAuth` | Context consumer for `AuthContext` | Throws outside provider ✅ |
| `useTheme` | Context consumer for `ThemeContext` | Throws outside provider ✅ |

**Risk:** Only 2 custom hooks — pages likely have inline data-fetching logic. Future tasks (P05–P12) should extract domain hooks (e.g., `useDashboard`, `useCareerTwin`) for testability.

---

## 5. Services (`client/src/services/`)

| File | Notes |
|------|-------|
| `apiClient.js` | Single entry point ✅. Handles auth header, timeout (8s standard, 90s AI), `ApiRequestError`, JSON parsing. No secrets. |
| `tokenStorage.js` | Token read/write/clear |
| `auth.service.js` | Login, register, logout, fetchCurrentUser |
| `profile.service.js` | Profile CRUD |
| `resume.service.js` | Upload, fetch, poll |
| `career.service.js` | Careers, skill-gap, roadmap |
| `careerTwin.service.js` | CareerTwin fetch |
| `dashboard.service.js` | Dashboard summary fetch |
| `assessment.service.js` | Full assessment API (contract-tested) |

**No duplication.** Each service owns one domain. ✅

---

## 6. Context (`client/src/context/`)

- `AuthContext.jsx` — single source of truth for `user`, `status`, `login`, `register`, `logout`. ✅
- Token verified against server on every restore (no stale-token vulnerability). ✅
- `ThemeContext` exists in `theme/` directory (not listed but referenced by `useTheme`).

---

## 7. Layouts (`client/src/layouts/`)

- `AppLayout.jsx` — wraps `ProtectedRoute` + `AppNav` + `Outlet`. Clean. ✅
- `AuthLayout.jsx` — used by login/register pages.

---

## 8. Utils (`client/src/utils/`)

- `authValidation.js` — client-side validation rules
- `dateFormat.js` — date formatting utility
- `errorMessage.js` — error message extraction

No duplication. ✅

---

## 9. Verified Risks Summary

| Risk | Severity | Addressed in |
|------|----------|-------------|
| Missing routes for assessment/interview/readiness/opportunities | High | P13–P22 |
| ProfilePage 22KB — may need splitting | Medium | P07 |
| DashboardPage/CareerTwinPage — check for hardcoded data | High | P05, P09 |
| Pages have inline fetch logic — no domain hooks | Medium | P05–P12 |
| RepeatableList vs TagListField potential overlap | Low | P02 |
| assessment.service.js exists but no UI routes yet | Info | P13–P16 |

---

## 10. Baseline Test Status

- Test suite: `node --test --test-concurrency=1 "tests/**/*.test.js"`
- Run at P01 audit time — see commit for pass/fail result.

---

## Conclusion

Architecture is **clean and consistent**. Single API client, single auth context, layout-level guard, no secrets in frontend. Main work ahead is delivering missing UI routes (P13–P22) and auditing existing pages for hardcoded/fake data. No structural refactoring needed before feature tasks.
