# Task 06 — Profile Intelligence, Normalization & Conflict Resolution System

## Executive Summary
Task 06 establishes an enterprise profile intelligence, normalization, and reconciliation engine for Nexora. It transforms raw student-entered profiles into standardized, canonical representations suitable for downstream career intelligence (CareerTwin, Skill Gap, Readiness), enforces strict precedence and anti-AI mutation boundaries (preventing AI inferences from silently modifying user-entered facts), detects contradictions between profile and resume records, and introduces optimistic concurrency versioning, profile freshness metrics, and comprehensive audit trail logging.

---

## 1. Architectural Components

```
                           [ Student Profile Input (PATCH) ]
                                          │
                                          ▼
                      [ Stage 1: Validation & Type Enforcement ]
                        • RFC 7386 Merge Semantics (only provided keys update)
                        • Range checks, regex patterns, enum bounds
                                          │
                                          ▼
                  [ Stage 2: AI Mutation Boundary Enforcement ]
                    • If source is AI hint or unverified:
                      BLOCKS direct writes to personal, academic, and career facts
                                          │
                                          ▼
                      [ Stage 3: Domain Normalization Engine ]
                        • Skills: Canonical name & ID resolution (`sk_*`),
                                  alias collapsing, highest proficiency preservation
                        • Academic: Degree, Branch, and College standardization
                        • Projects: Canonical technology mapping & deduplication
                        • Career: Target role normalization & interest sanitization
                                          │
                                          ▼
                      [ Stage 4: Completeness & Freshness Evaluation ]
                        • 100-point multi-section scoring (Personal, Academic, Career, Skills, Projects)
                        • Status classification: incomplete, minimal, detailed, comprehensive
                        • Freshness tracking (stale flag if > 180 days without update)
                                          │
                                          ▼
                      [ Stage 5: Versioning & Audit Trail Logging ]
                        • Increments `version` counter for optimistic concurrency
                        • Computes granular field diff and appends to `auditTrail`
                        • Persists to MongoDB `StudentProfile`
                                          │
                                          ▼
             [ Stage 6: Cross-Artifact Reconciliation (GET /api/profile/reconcile) ]
               • Compares profile against active resume data
               • Identifies academic divergence (graduation year, institution, degree)
               • Detects un-synced skills and generates confirmation items
```

---

## 2. Key Modules & Technical Specifications

### 2.1 Domain Normalization Engine (`server/src/domain/profile/profileNormalizer.js`)
- **`normalizeSkills(skills)`**:
  - Maps skill entries against `skillOntology.js` (`resolveCanonicalSkill`) or `skillKey.js` (`canonicalSkill`).
  - Automatically deduplicates synonyms (e.g. `['Node.js', 'nodejs', 'NODE JS']` $\rightarrow$ `['Node.js']`).
  - Preserves the student's highest self-reported proficiency level (`expert` > `advanced` > `intermediate` > `beginner`).
  - Stamps canonical skill ID (`sk_*`) and `evidenceTier: 'claimed'`.
- **`normalizeDegree(degree)`**: Standardizes degree abbreviations (e.g. `b.tech`, `BTech`, `bachelor of technology` $\rightarrow$ `Bachelor of Technology`).
- **`normalizeBranch(branch)`**: Standardizes engineering and science branches (e.g. `cse`, `computer science` $\rightarrow$ `Computer Science & Engineering`).
- **`normalizeCollegeName(college)`**: Cleans spacing and standardizes acronyms (`NIT`, `IIT`, `IIIT`, `BITS`).
- **`normalizeProjectTechnologies(technologies)`**: Standardizes technologies and removes duplicates.
- **`calculateProfileCompleteness(profile)`**:
  - Evaluates points across Personal (20), Academic (25), Career (20), Skills (20), and Projects (15).
  - Flags missing sections and calculates `daysSinceUpdate`. Profiles unverified for > 180 days receive `isStale: true`.

### 2.2 Cross-Artifact Reconciliation & Precedence Engine (`server/src/domain/profile/profileResumeReconciler.js`)
- **Precedence Hierarchy**:
  1. `TIER_2_USER_ENTERED` (Profile): Authoritative for personal details, self-reported target roles, and declared interests.
  2. `TIER_5_INSTITUTIONAL` / `TIER_4_ASSESSMENT_PROCTORED`: Authoritative for skill mastery over self-reported claims.
  3. `TIER_1_CLAIMED` (Resume): Requires explicit confirmation before updating profile fields.
  4. `TIER_0_UNVERIFIED_AI_HINT`: **Forbidden** from directly mutating profile facts.
- **`assertAiMutationBoundary`**: Throws explicit operational error if an unverified AI source attempts to write to user-entered personal or academic attributes.
- **`reconcileProfileWithResume(profile, resume)`**:
  - Compares graduation years (detecting divergence between resume and profile).
  - Compares institution names using distinctive token analysis (filtering common stop words like `institute`, `technology`, `university`, `national`).
  - Identifies skills mentioned on the resume but missing in the profile as suggested sync items (`requiresConfirmation: true`).

### 2.3 Persistence & API Extensions
- **Model Updates (`server/src/models/StudentProfile.model.js`)**:
  - Added `version: { type: Number, default: 1 }`.
  - Added `completeness: { percentage, status, missingSections }`.
  - Added `lastVerifiedAt: Date`.
  - Added `auditTrail: [ { field, action, previousValue, newValue, source, timestamp } ]`.
- **New Endpoints**:
  - `GET /api/profile/reconcile`: Generates structured reconciliation report between student profile and current resume.
  - `POST /api/profile/confirm-field`: Allows student to confirm or override a suggested or reconciled field.

---

## 3. Automated Verification Evidence

### Test Suite: `server/tests/profileIntelligence.test.js`
- **1. Normalization & Taxonomy Alignment**:
  - `ok 1 - normalizes skill names, deduplicates aliases, and preserves highest level`
  - `ok 2 - standardizes academic degrees, engineering branches, and college acronyms`
  - `ok 3 - normalizes project technologies against canonical taxonomy and deduplicates`
  - `ok 4 - cleans and sanitizes career preferences and interests`
- **2. Profile Completeness & Freshness**:
  - `ok 1 - evaluates profile completeness across sections and returns missing sections`
  - `ok 2 - detects staleness when profile has not been updated within 180 days`
- **3. Precedence Invariants & AI Boundary Protection**:
  - `ok 1 - blocks AI hints from directly mutating user-entered profile fields without confirmation`
  - `ok 2 - permits authorized user-direct profile updates`
- **4. Cross-Artifact Profile & Resume Reconciliation**:
  - `ok 1 - detects graduation year, college, and degree discrepancies between profile and resume`
- **5. End-to-End API, Audit Trail & Versioning Integration**:
  - `ok 1 - increments version and appends auditTrail on updates, and exposes reconcile endpoint`

### Regression Testing
- `server/tests/profile.test.js`: 38/38 pass (100% backward compatibility maintained)
- `server/tests/canonicalStudent.test.js`: 8/8 pass
- `server/tests/skillOntology.test.js`: 11/11 pass
- `server/tests/resumeGroundedExtraction.test.js`: 8/8 pass
- `server/tests/evidenceLifecycle.test.js`: 10/10 pass

---

## 4. Universal Definition of Done Compliance
- **Actual Code Inspected**: `StudentProfile.model.js`, `profile.service.js`, `profile.controller.js`, `profile.routes.js`.
- **AI Boundaries Explicitly Documented**: `assertAiMutationBoundary` strictly halts unauthorized AI writes.
- **Security & Privacy**: Strict tenant isolation (`req.auth.userId`), ownership verification on every endpoint.
- **Automated Tests**: 10 new tests in `profileIntelligence.test.js` covering normal, edge, adversarial, and regression cases.
- **Certification Category**: FIXED
