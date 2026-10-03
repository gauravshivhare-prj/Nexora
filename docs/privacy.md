# Nexora Privacy, Data Minimization & Sensitive-Data Protection Architecture (Task 39)

## 1. Overview & Policy Objective
Nexora is committed to data privacy by design and data minimization across the entire student lifecycle. This document outlines:
- The exact inventory of data collected and stored.
- Sensitive-data protection safeguards (passwords, tokens, logs, external AI requests).
- Compliance with user privacy rights, specifically GDPR Right of Access/Portability (Art. 20) and Right to Erasure/Deletion (Art. 17).
- Data retention timelines and security audit trail standards.

---

## 2. Personal Data Inventory

| Category | Entities / Fields | Storage Medium | Retention Period |
| :--- | :--- | :--- | :--- |
| **Authentication** | Full name, email address, password hash (bcrypt cost 12), role | MongoDB (`users`) | Until account deletion |
| **Student Profile** | Target role, target companies, education level, graduation year, hours/week, skills | MongoDB (`studentprofiles`) | Until account deletion |
| **Resume Data** | Filename, mimeType, file SHA-256 hash, extracted text, structured parsed nodes (education, skills, projects, experience, certifications) | MongoDB (`resumes`) *(No raw binary file buffers)* | Until deleted by student or account deletion |
| **Career Twin** | Skill profiles, confidence scores, evidence pointers, grounding status | MongoDB (`careertwins`) | Recalculated dynamically; wiped upon account deletion |
| **Skill Evidence** | Observed skill mentions, verification source, weight, validation timestamp | MongoDB (`skillevidencechecks`) | Until account deletion |
| **Assessments** | Questions answered, user choices, time taken, score breakdown | MongoDB (`assessmentattempts`) | Until account deletion |
| **Interviews** | Questions asked, student transcript answers, AI feedback, rubric scores, audio metrics (if applicable) | MongoDB (`interviewsessions`) | Until account deletion |
| **Readiness Tracking** | Target role, score history, component breakdowns, timestamp | MongoDB (`readinesssnapshots`) | Until account deletion |
| **Resource Quotas** | Daily AI evaluation counts, cost estimates per date key | MongoDB (`useraiquotas`) | Rolling 30 days or until account deletion |
| **Security Audit Logs** | Actor ID, role, action code, timestamp, IP address *(immutable)* | MongoDB (`auditlogs`) | 1 year for compliance/security review |

---

## 3. Data Minimization Principles

1. **Zero Raw File Storage in Database**:
   - Resumes uploaded by students are parsed in isolated memory.
   - Only the extracted text and structured skill extractions are persisted. Raw PDF/DOCX byte buffers are never stored in MongoDB.
2. **One-Way Credential Hashing**:
   - Passwords are encrypted with bcrypt (12 rounds) and a dummy hash is verified upon non-existent user queries to prevent timing attacks.
   - The password hash has `{ select: false }` on the Mongoose model schema and is stripped by `toJSON` transforms.
3. **No Sensitive Tokens in Database**:
   - JWT session tokens are stateless and signed using high-entropy secrets (`JWT_SECRET`).
   - No long-lived refresh tokens or session states are stored in the database.
4. **Log Sanitization & PII Scrubbing**:
   - `logger.js` automatically redacts sensitive keys: `password`, `token`, `apiKey`, `secret`, `authorization`, `cookie`, `email`, `phone`, `phonenumber`.
   - String values in logs are scrubbed for bearer tokens, email formats, and telephone patterns.
   - `requestLogger.js` and `errorHandler.js` sanitize URL query parameters to avoid logging credentials or identifiers.

---

## 4. AI Provider Privacy & Guardrails (Google Gemini)

When student data is processed by external AI providers:
1. **Outbound PII Guard**: The outbound AI security auditor (`aiSecurityAuditor.js`) inspects payloads for unsolicited PII (such as Social Security Numbers, credit card numbers, or unverified contact information) before sending requests to external AI models.
2. **No Model Training**: Nexora interfaces with Google Gemini via enterprise API endpoints where inputs and outputs are not retained or used to train public foundation models.
3. **Bounded Payloads**: Input text is strictly bounded (`maxInputChars: 100,000`), preventing unbounded memory consumption and excessive data exposure.
4. **Output Hallucination & Safety Audits**: Responses from AI models are sanitized for accidentally mirrored secrets or prompt leakage via `interviewFeedbackSafety.js`.

---

## 5. User Rights Under GDPR & Privacy Regulations

### 5.1 Right to Data Portability (GDPR Art. 20)
Students can download a complete, machine-readable export of all data held about them:
- **Endpoint**: `GET /api/auth/export`
- **Authentication**: Requires valid Bearer JWT.
- **Rate Limit**: Maximum 15 requests per 15 minutes.
- **Payload Contents**:
  - `account`: User identifier, name, email, role, created timestamp.
  - `profile`: Student target role, preferences, education, self-reported skills.
  - `resumes`: All uploaded resumes with parsed skill trees and metadata (excluding raw binaries).
  - `careerTwin`: Dynamic capability model and synthesized skill vector.
  - `skillEvidence`: History of verified skill demonstrations.
  - `interviewSessions`: All mock interview sessions with questions, student answers, and AI evaluations.
  - `assessmentAttempts`: All technical assessment submissions and grading results.
  - `readinessSnapshots`: Historical career readiness progression snapshots.
  - `aiQuota`: Daily AI consumption counters.

### 5.2 Right to Erasure / "Right to be Forgotten" (GDPR Art. 17)
Students have full control to permanently delete their Nexora account and all associated personal data:
- **Endpoint**: `DELETE /api/auth/account`
- **Authentication**: Requires valid Bearer JWT.
- **Rate Limit**: Maximum 10 requests per 15 minutes.
- **Cascading Deletion**: Irreversibly deletes records across all 8 user collections in parallel:
  1. `users`
  2. `studentprofiles`
  3. `resumes`
  4. `careertwins`
  5. `skillevidencechecks`
  6. `interviewsessions`
  7. `assessmentattempts`
  8. `readinesssnapshots`
  9. `useraiquotas`
- **Audit Logging**: An immutable audit log entry is recorded with action `ACCOUNT_DELETED`, timestamp, and actor ID for compliance verification.
