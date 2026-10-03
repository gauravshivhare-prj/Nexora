# Task 37: Secrets, Environment, Git History & Supply-Chain Security

## 1. Overview & Objectives

Task 37 establishes a defense-in-depth security perimeter covering:
1. **Secrets & Credentials Management**: Zero hardcoded secrets anywhere in source code, configuration, or test suites. Strict runtime validation of non-enumerable environment secrets with placeholder and low-entropy detection.
2. **Git History Hygiene & Automated Scanning**: Full-history and working-tree secret scanning via Gitleaks, integrated into developer workflows (Git hooks), manual audit scripts, and automated GitHub Actions CI pipelines.
3. **Historical Allowlist Audit**: Complete transparency and justification of allowlisted `.gitleaksignore` historical fingerprints.
4. **Supply Chain & Dependency Security**: Deterministic dependency installations via lockfile integrity verification (`npm ci`), automated zero-high-vulnerability policies (`npm audit --audit-level=high`), and dependency update governance.

---

## 2. Secrets & Environment Security Architecture

### Non-Enumerable Secrets (`server/src/config/env.js`)
Nexora protects runtime secrets by declaring them as non-enumerable properties on the validated configuration object:
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `GEMINI_API_KEY`, and `MONGODB_URI` cannot be dumped accidentally via `JSON.stringify()`, `console.log(process.env)`, or error envelope serialization.
- Dynamic placeholders (e.g., `replace_with_actual_key`, `your_secret_here`) and low-entropy strings are rejected at startup in production.
- Production startup enforces mandatory TLS on remote MongoDB URIs (`mongodb+srv://` or `ssl=true`), blocking unencrypted credential transit.

### Zero-Tolerance Test Secrets Policy
All tests must construct mock API keys, tokens, and hashes programmatically using the dedicated helper:
- [`server/tests/helpers/fakeSecrets.js`](file:///c:/Users/akans/OneDrive/Desktop/Nexora/server/tests/helpers/fakeSecrets.js)
  - `fakePassword()`
  - `fakeSecretValue()`
  - `fakeJwt()`
  - `fakeGcpKey()`
  - `fakeMongoUri()`
No raw realistic secret strings are ever committed to test files.

---

## 3. Git History Scanning & Gitleaks Integration

### Scanning Rules & Engine
Nexora uses [Gitleaks v8.30.1](https://github.com/gitleaks/gitleaks) with custom configuration in [`.gitleaks.toml`](file:///c:/Users/akans/OneDrive/Desktop/Nexora/.gitleaks.toml).
- Custom detection for GCP API keys, JWT tokens, credentialed database URIs, private keys, and hardcoded passwords.
- History scanning covers all 308+ commits from initial commit to `HEAD`.

### Developer Hooks & Automation
- **Git Hooks**: Pre-commit (`.githooks/pre-commit`) and Pre-push (`.githooks/pre-push`) hooks run automated gitleaks scans locally prior to git write operations.
- **Standalone Script**: [`scripts/check-secrets.mjs`](file:///c:/Users/akans/OneDrive/Desktop/Nexora/scripts/check-secrets.mjs) allows ad-hoc manual or CI execution (`npm run check-secrets`).
- **Automatic Tool Provisioning**: [`scripts/install-gitleaks.mjs`](file:///c:/Users/akans/OneDrive/Desktop/Nexora/scripts/install-gitleaks.mjs) downloads and verifies Gitleaks binary integrity.

---

## 4. `.gitleaksignore` Fingerprints Review & Justification

The `.gitleaksignore` file contains 15 historical fingerprints across 3 specific commits. All fingerprints have been audited and verified:

| Commit | File | Rule ID | Line | Justification / Finding Resolution |
|---|---|---|---|---|
| `2b31ca7` | `server/tests/aiSecurityAndPrivacy.test.js` | `gcp-api-key` | 26 | Fake GCP key used to test outbound AI PII/secret scrubbing. Replaced with `fakeSecrets.js` helper. |
| `2b31ca7` | `server/tests/aiSecurityAndPrivacy.test.js` | `credentialed-database-uri` | 50 | Mock MongoDB connection string in test. Replaced with `fakeSecrets.js` helper. |
| `2b31ca7` | `server/tests/aiSecurityAndPrivacy.test.js` | `jwt` | 39 | Mock JWT token used to test token redaction. Replaced with `fakeSecrets.js` helper. |
| `2b31ca7` | `server/tests/aiSecurityAndPrivacy.test.js` | `generic-api-key` | 133 | Synthetic API key fixture for redaction tests. Replaced with `fakeSecrets.js` helper. |
| `2b31ca7` | `server/tests/aiSecurityAndPrivacy.test.js` | `generic-api-key` | 168 | Synthetic API key fixture for redaction tests. Replaced with `fakeSecrets.js` helper. |
| `7801548` | `server/tests/interviewFeedbackSafety.test.js` | `gcp-api-key` | 36 | Mock GCP key testing AI feedback redacting. Migrated to `fakeSecrets.js`. |
| `7801548` | `server/tests/interviewFeedbackSafety.test.js` | `hardcoded-password` | 89 | Test mock password checking sanitizer. Migrated to `fakeSecrets.js`. |
| `7801548` | `server/tests/interviewFeedbackSafety.test.js` | `private-key` | 99 | Test mock RSA header string testing blocker. Migrated to `fakeSecrets.js`. |
| `7801548` | `server/tests/interviewFeedbackSafety.test.js` | `credentialed-database-uri` | 78 | Test mock URI string testing blocker. Migrated to `fakeSecrets.js`. |
| `7801548` | `server/tests/interviewFeedbackSafety.test.js` | `jwt` | 68 | Test mock JWT token testing blocker. Migrated to `fakeSecrets.js`. |
| `7801548` | `server/tests/interviewFeedbackSafety.test.js` | `generic-api-key` | 89 | Mock token testing blocker. Migrated to `fakeSecrets.js`. |
| `7801548` | `server/tests/interviewFeedbackSafety.test.js` | `generic-api-key` | 262 | Mock token testing blocker. Migrated to `fakeSecrets.js`. |
| `7801548` | `server/tests/interviewFeedbackSafety.test.js` | `generic-api-key` | 445 | Mock token testing blocker. Migrated to `fakeSecrets.js`. |
| `ce0f084` | `server/src/scripts/seedDemo.js` | `hardcoded-password` | 24 | Default demo student password in initial seed script. Migrated to `DEMO_STUDENT_PASSWORD` env var. |
| `ce0f084` | `server/src/scripts/seedDemo.js` | `hardcoded-password` | 30 | Default demo admin password in initial seed script. Migrated to `DEMO_ADMIN_PASSWORD` env var. |

**Audit Conclusion**: No production credential, cloud key, user password, or live database connection string has ever existed in git history. All 15 findings are benign test fixtures or obsolete demo seed defaults from early prototyping.

---

## 5. Supply-Chain & Dependency Management

### Lockfile Integrity Verification
- In CI and production builds, dependencies must be installed with `npm ci`, not `npm install`.
- `npm ci` strictly verifies `package-lock.json` against `package.json`. If a mismatch exists or the lockfile has been tampered with, the build immediately aborts.

### Vulnerability Gates
- Both `server` and `client` packages are subjected to automated vulnerability scanning:
  ```bash
  npm audit --audit-level=high --prefix server
  npm audit --audit-level=high --prefix client
  ```
- **Policy**: Zero vulnerabilities at or above `high` severity are permitted. Any build or CI pipeline with a high/critical finding will fail.

### Subresource Integrity (SRI)
- Client bundle production builds compute SHA-384 cryptographic integrity hashes for all output scripts and stylesheets using a custom zero-dependency Vite plugin in `client/vite.config.js`.
- Protects client browsers against tampering or CDN compromise.

---

## 6. Dependency Update & Patching Policy

1. **Regular Cadence**:
   - Monthly review of direct dependencies using `npm outdated`.
   - Security audit check on all branch builds and PRs.
2. **Vulnerability Escalation SLA**:
   - **Critical Vulnerability**: Remediate within 24 hours (upgrade or isolate).
   - **High Vulnerability**: Remediate within 72 hours.
   - **Moderate/Low**: Evaluated during scheduled monthly dependency review.
3. **Upgrade Verification Checklist**:
   - Run `npm audit --audit-level=high` on both `server` and `client`.
   - Run full server unit and integration test suite (`npm test --prefix server`).
   - Run client build (`npm run build --prefix client`) and verify SRI hashes are generated.
   - Run gitleaks scan (`.tools/gitleaks detect --source . --no-banner`).
