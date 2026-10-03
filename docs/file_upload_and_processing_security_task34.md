# Task 34 — Resume Upload, File Processing & Document Security Architecture

## Overview

Task 34 hardens Nexora's document ingestion and resume extraction pipeline against denial-of-service (decompression bombs), memory exhaustion, parser crashes, duplicate file spam, and embedded script attacks.

---

## 1. File Deduplication & Content Hashing

### Model & Service: `Resume.model.js` & `resume.service.js`
- **Dual SHA-256 Hashing**:
  - `file.fileHash`: Computed over raw file buffer bytes before ingestion.
  - `contentHash`: Computed over normalized extracted text (`text.trim().toLowerCase()`).
- **Duplicate Upload Prevention**:
  - When an authenticated student uploads a document matching an existing document for their account (same `originalName` and identical `fileHash` or `contentHash`), the request is rejected with `HTTP 409 Conflict` (`ERROR_CODES.CONFLICT`).
  - Cross-user isolation is maintained: distinct users may legitimately upload identical reference resumes or templates without conflict.
  - Revisions uploaded under distinct filenames are accepted and flagged with `isDuplicate: true` and `duplicateOf: <initialResumeId>` for version comparison.

---

## 2. Parser Crash Isolation & Timeout Guarding

### Domain Layer: `domain/resume/extractText.js`
- **Bounded Execution Time**:
  - All file extraction operations are wrapped in `Promise.race` with an 8-second timeout (`EXTRACTION_TIMEOUT_MS = 8000`).
  - If a parser hangs or encounters complex circular structures, the timeout aborts the task gracefully and returns `statusCode: 422` (`isUnprocessable: true`).
- **Crash Isolation**:
  - Any fatal memory or worker exception in underlying parser libraries (`pdf-parse`, `mammoth`, etc.) is trapped within `extractTextFromFile`.
  - Instead of unhandled 500 crashes that could bring down the process, the error surfaces as `HTTP 422 Unprocessable Entity` (`ERROR_CODES.UNPROCESSABLE_ENTITY`).
  - Standard user-error scenarios (corrupt file headers, invalid UTF-8, unsupported MIME types) continue to return `HTTP 400 Bad Request` with structured validation messages.

---

## 3. Document Size & Decompression Bomb Defense

### Safety Threshold: `MAX_EXTRACTED_RAW_CHARS = 500 * 1024` (500KB)
- Small archives (such as compressed Word `.docx` documents or PDF streams) can claim gigabytes of expanded content.
- In addition to zip archive pre-inspection (`DOCX_MAX_UNCOMPRESSED_BYTES = 20MB`), the text extractor validates raw extracted character count before normalization.
- Any document yielding $> 500\text{KB}$ of raw text is rejected before normalization or persistence, preventing heap exhaustion and protecting downstream AI token budgets.

---

## 4. Embedded Script & Security Warning Detection

### Function: `detectEmbeddedScripts(text)`
- Scans extracted text for dangerous patterns:
  - `<script\b[^>]*>`
  - `javascript:`
  - `\bon(?:load|error|click|mouseover|focus|blur)\s*=`
  - `<iframe\b[^>]*>`
- **Non-Destructive Transparency**:
  - Rather than rejecting technical resumes that legitimately reference HTML/JS code or web security topics, the detection records a security warning in the resume document's `warnings` array:
    `'Potential embedded script or event-handler syntax detected in document content.'`
  - The document is preserved, but security auditors and frontend renderers are made aware of active code patterns.

---

## 5. Verification & Test Coverage

The implementation is verified by:
- `server/tests/resume.fileSecurity.test.js`: 7 tests covering duplicate upload rejection, per-user isolation, crash/timeout isolation, 500KB decompression bomb blocking, and script detection.
- `server/tests/resume.upload.test.js`: 24 tests covering upload boundary conditions, MIME types, extensions, and limits.
- `server/tests/resume.test.js`: 17 tests covering CRUD, analysis, and lifecycle.
- `server/tests/resume.pipeline.test.js`: Full pipeline lifecycle.
- `server/tests/resume.analysis.recovery.test.js`: Recovery mechanisms.
- `server/tests/resume.mapping.test.js`: Entity mapping.
- `server/tests/resume.stateTransitions.test.js`: Processing state machine.
- `server/tests/resumeGroundedExtraction.test.js`: Grounded entity extraction.
