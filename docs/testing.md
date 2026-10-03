# Nexora Automated Testing Framework & Quality Engineering (Task 45)

## 1. Overview & Quality Mandate
Nexora maintains a multi-layer test suite covering the entire intelligent career-readiness engine, API boundaries, security controls, and persistence semantics.

Testing is built around zero-mock integration:
- Database behaviors (unique constraints, transactions, version keys, cascade deletions) run against real MongoDB instances.
- HTTP adapters run against native Node.js HTTP servers on ephemeral ports (`listen(0)`).
- AI providers utilize deterministic test doubles with strict schema validators or live calibration benchmarks.

---

## 2. Test Classification Taxonomy

The test suite is structured into six core categories:

| Category | Primary Directory / Pattern | Description & Scope | Typical Suites |
| :--- | :--- | :--- | :--- |
| **Unit & Algorithmic** | `tests/*math*.test.js`, `tests/*Scoring*.test.js` | Pure algorithmic verification without network/database I/O: decay curves, cosine similarity, readiness weights, penalty equations. | `assessmentScoring.test.js`, `adaptiveDifficulty.benchmark.test.js` |
| **Contract & Taxonomy** | `tests/*Contract*.test.js`, `tests/*Benchmark*.test.js` | Structural integrity of canonical catalogues, assessment question banks, role ontology, and skill requirements. | `assessmentContract.test.js`, `catalogueIntegrity.test.js`, `recommendationBenchmark.test.js` |
| **Integration & Service** | `tests/*Api*.test.js`, `tests/*Flow*.test.js` | Full Express router-to-MongoDB execution: profile mutations, resume parsing, CareerTwin generation, interview evaluations. | `careerTwin.test.js`, `resume.service.test.js`, `readiness.service.test.js` |
| **Security & Adversarial** | `tests/security*.test.js`, `tests/*RedTeam*.test.js` | Resistance against IDOR, injection attacks, privilege escalation, prompt injection, and hardcoded secret scanning. | `security.regressionSuite.test.js`, `promptInjectionRedTeam.test.js`, `privacy.test.js` |
| **Resilience & Concurrency** | `tests/concurrency*.test.js`, `tests/circuitBreaker*.test.js` | Circuit breakers, exponential backoff retries, race-condition auto-recovery (`E11000`/`VersionError`), and AI quota caps. | `circuitBreaker.test.js`, `concurrency.integrity.test.js`, `aiQuota.test.js` |
| **End-to-End & Smoke** | `tests/*.smoke.test.js`, `tests/*integration*.test.js` | Complete student lifecycle flows (registration → resume upload → twin → recommendation → gap → roadmap → interview). | `deployment.smoke.test.js`, `coreLoop.fullFlow.integration.test.js` |

---

## 3. Database Isolation Architecture (`suiteId`)

Because MongoDB collections are shared if using a single database name, concurrent test execution can cause data collisions. Nexora solves this through two architectural mechanisms:
1. **Serial Concurrency Execution (`--test-concurrency=1`)**:
   Standard test commands run suites serially to ensure zero collection contention on the primary test database.
2. **Dynamic Isolated Suite Databases (`suiteId`)**:
   In `tests/helpers/testServer.js`, suites that require guaranteed isolation pass a short `suiteId`:
   ```javascript
   server = await startTestServer({ suiteId: 'careertwin' });
   ```
   This constructs a dedicated MongoDB database (e.g. `nexora_careertwin_test`), applies schema indexes at boot, and automatically drops the entire database upon `server.close()`.

---

## 4. Test Execution & Coverage Commands

### Run Full Test Suite
```bash
cd server
npm test
```
*Equivalent to:* `node --test --test-concurrency=1 "tests/**/*.test.js"`

### Run Targeted Test Categories
```bash
# Security & Privacy Suites
node --test --test-concurrency=1 "tests/security*.test.js" "tests/privacy*.test.js" "tests/auth*.test.js"

# Resilience & Concurrency
node --test --test-concurrency=1 "tests/circuitBreaker*.test.js" "tests/concurrency*.test.js" "tests/aiQuota*.test.js"

# Deployment & Smoke Checks
node --test --test-concurrency=1 "tests/deployment.smoke.test.js" "tests/production*.test.js"
```

### Automated Code Coverage Report
To measure statement, branch, and function coverage across all server source modules:
```bash
cd server
npm run test:coverage
```
This generates a module-by-module coverage table with line-level un-covered range diagnostics using Node.js's built-in coverage engine.

---

## 5. Continuous Integration (CI) Enforcement

Nexora CI workflows in `.github/workflows/` enforce:
- **Lockfile & Dependency Integrity**: `npm ci` verifies `package-lock.json` hashes before install.
- **Automated Secret Detection**: `gitleaks detect` scans working trees and commit history for credential leaks.
- **Vulnerability Audit**: `npm audit --audit-level=high` blocks high/critical CVEs.
- **Full Test Suite Run**: Every pull request must achieve 100% test pass rate across all suites.
