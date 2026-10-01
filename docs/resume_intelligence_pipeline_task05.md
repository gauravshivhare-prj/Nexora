# Task 05 — Resume Intelligence & Grounded Extraction Pipeline

## Executive Summary
Task 05 reconstructs the Nexora Resume Processing & Extraction Pipeline as an enterprise-grade, grounded intelligence extraction system. Every extracted fact is strictly anchored to verifiable substrings within the raw source resume (`extractedText`). Hallucinated technologies or entities fabricated by AI models are dropped with explicit warning ledgers, exact character offset span indices (`startOffset`, `endOffset`, `matchedText`) are maintained for verifiable provenance, internal timeline contradictions and profile divergences are proactively flagged, and duplicate submissions are cryptographically tracked via SHA-256 content hashing.

---

## 1. Architectural Pipeline Overview

The pipeline strictly processes resumes through nine deterministic stages:

```
[ Uploaded Document (.pdf, .docx, .txt) / Pasted Text ]
                          │
                          ▼
            [ Stage 1: File Intake & Policy Validation ]
              • MIME type, extension, magic byte validation (%PDF-, PK\x03\x04)
              • File size bounds (max 5 MB) & ZIP bomb protection
              • In-memory processing only (never written to disk)
                          │
                          ▼
            [ Stage 2: In-Memory Text Extraction ]
              • Pure parser extraction (pdf-parse / mammoth)
              • Page ceiling limit (max 10 pages) & uncompressed stream bounds
              • Strict UTF-8 verification
                          │
                          ▼
            [ Stage 3: SHA-256 Content Deduplication ]
              • Case- and whitespace-normalized hashing
              • Identical text uploads tagged with `isDuplicate: true` and `duplicateOf`
                          │
                          ▼
            [ Stage 4: AI Extraction with System Prompt Boundaries ]
              • Delimited text input within markdown isolation tags
              • Strict JSON output format requirement
                          │
                          ▼
            [ Stage 5: JSON Schema & Range Validation ]
              • Strips unrecognized keys fabricated by AI models
              • Validates primitive types, year ranges (1950 - currentYear + 10)
                          │
                          ▼
            [ Stage 6: Grounding & Exact Span Attribution ]
              • Every fact must be present in raw source text
              • Exact character offsets: `startOffset`, `endOffset`, `matchedText`
              • Canonical Skill Mapping (`sk_*`) via Task 03 Controlled Ontology
              • All resume facts assigned `evidenceTier: 'claimed'` (Tier 1)
                          │
                          ▼
            [ Stage 7: Anti-Hallucination Pruning ]
              • Invented skills, ungrounded links, fake certifications dropped
              • Detailed warning audit entries stored in `resume.warnings`
                          │
                          ▼
            [ Stage 8: Conflict & Contradiction Detection Engine ]
              • Internal timeline inversions (`endYear < startYear`)
              • Implausible future dates
              • Cross-validation against `StudentProfile` (graduation year, college)
                          │
                          ▼
            [ Stage 9: Persistence & Immutability ]
              • Stored in MongoDB `Resume` document with full `provenanceIndex`
              • `toPublicResume` projection excludes internal IDs and sensitive tokens
```

---

## 2. Key Components & Implementation Details

### 2.1 Traceable Grounding & Span Provenance (`server/src/domain/resume/groundParsedResume.js`)
- **Exact Span Resolution**: Evaluates `findSpanInText(sourceText, targetStr)` to extract `matchedText`, `startOffset`, and `endOffset`.
- **Taxonomy Resolution**: Resolves skills against `resolveCanonicalSkill(value)` or `canonicalSkill(value)`. Links canonical identifiers (e.g. `sk_react`, `sk_nodejs`, `sk_docker`) and sets `evidenceTier: 'claimed'`.
- **Provenance Ledger**: Every grounded element produces an entry in `provenanceIndex`:
  ```json
  {
    "entityType": "skill",
    "name": "React",
    "canonicalSkillId": "sk_react",
    "matchedText": "React",
    "startOffset": 242,
    "endOffset": 247,
    "evidenceTier": "claimed"
  }
  ```
- **Anti-Hallucination Defense**: If an AI model returns a skill (e.g. `Kubernetes` or `AWS Lambda`) that does not appear in the source resume or cannot be resolved in the canonical ontology, the entry is omitted from `value.skills` and logged in `warnings`.

### 2.2 Conflict & Contradiction Detection (`server/src/domain/resume/resumeConflictDetector.js`)
Inspects parsed resume data for temporal inversions and contradictions against the student's canonical profile:
- **`TIMELINE_INVERSION` (Error)**: Detects when `endYear < startYear` in education records or experience dates.
- **`FUTURE_DATE` (Warning)**: Flags start dates occurring beyond `currentYear + 1`.
- **`PROFILE_MISMATCH` (Warning)**: Compares resume graduation year and educational institutions with `StudentProfile.academic.graduationYear` and `StudentProfile.academic.college`, persisting discrepancies to `resume.conflicts`.

### 2.3 Duplicate Tracking & Deduplication (`server/src/models/Resume.model.js` & `resume.service.js`)
- Computes SHA-256 digest of normalized source text (`text.trim().toLowerCase()`).
- Indexed via `{ user: 1, contentHash: 1 }`.
- If an existing resume row for the user shares the hash, the newly created record is tagged with:
  ```javascript
  isDuplicate: true,
  duplicateOf: originalResume._id
  ```

### 2.4 File Intake & Memory Security (`server/src/domain/resume/extractText.js`)
- Enforces strict multi-factor check: MIME type (`application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`), file extension, and magic byte headers (`%PDF-`, `PK\x03\x04`).
- **ZIP-Bomb Defense**: Pre-scans DOCX ZIP central directory records (`DOCX_MAX_UNCOMPRESSED_BYTES = 20 MB`, `DOCX_MAX_ENTRIES = 1000`) before allowing decompression.
- **Buffer Invariant**: Files exist solely in memory during the request lifecycle; never written to temporary or permanent disk paths.

---

## 3. Verification & Test Evidence

### Automated Suite: `server/tests/resumeGroundedExtraction.test.js`
- **1. Grounded Extraction & Character Span Attribution**:
  - `ok 1 - accurately identifies exact character offsets and matched text for grounded entities`
  - `ok 2 - indexes grounded entities with canonicalSkillId, startOffset, endOffset and evidenceTier: claimed`
  - `ok 3 - strictly drops hallucinated skills, links, and certifications with explicit warnings`
- **2. Conflict & Contradiction Detection Engine**:
  - `ok 1 - detects education timeline inversion (endYear < startYear) with ERROR severity`
  - `ok 2 - detects implausible future start years with WARNING severity`
  - `ok 3 - detects divergence between student profile and parsed resume`
- **3. Duplicate Resume Detection & Content Hashing**:
  - `ok 1 - computes contentHash and flags duplicate uploads with isDuplicate and duplicateOf`
- **4. End-to-End Pipeline Integration & Persistence**:
  - `ok 1 - executes full analysis pipeline, storing provenanceIndex and conflicts onto Resume document`

### Comprehensive Regression Testing
- `server/tests/resume.test.js`: 76/76 pass
- `server/tests/resume.pipeline.test.js`: 76/76 pass
- `server/tests/resume.upload.test.js`: 24/24 pass
- `server/tests/resume.mapping.test.js`: 2/2 pass
- `server/tests/resume.stateTransitions.test.js`: 5/5 pass
- `server/tests/resume.analysis.recovery.test.js`: 7/7 pass
- `server/tests/canonicalStudent.test.js`: 8/8 pass
- `server/tests/skillOntology.test.js`: 11/11 pass
- `server/tests/evidenceLifecycle.test.js`: 10/10 pass

---

## 4. Status Certification
- **Status**: FIXED
- **Downstream Invariant**: Downstream intelligence engines (Task 07 CareerTwin, Task 11 Skill-Gap) may consume resume extracted skills solely as Tier 1 (`claimed`) evidence grounded in `provenanceIndex`. Resumes cannot independently grant verified status or certified proficiency.
