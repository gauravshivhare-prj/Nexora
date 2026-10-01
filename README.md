# Nexora

**AI-powered career readiness for students — _From Student Profile to Career-Ready Candidate_.**

Nexora turns what a student has actually done into a clear picture of where they
stand against real roles. A student builds a profile and uploads a resume; Nexora
combines them into a **CareerTwin** — a structured, evidence-backed model of their
skills — then matches it against a curated catalogue of roles, shows exactly which
required skills are missing or only claimed, and turns those gaps into a personalised
roadmap. Assessments and interviews add stronger evidence, and readiness and
opportunities update from that evidence. AI helps read resumes and give interview
feedback; deterministic rules decide what counts as evidence.

---

## The problem

- Students rarely know which roles fit what they can already do.
- Resumes list skills without showing proof, so strengths and gaps stay hidden.
- Role requirements are vague, and learning resources are scattered.
- Interview practice gives no structured, honest feedback.
- It is hard to tell when you are actually ready to apply.

## The solution — one connected loop

```
Profile → Resume → CareerTwin → Career matching → Skill gap → Roadmap
        → Assessment / AI interview → Evidence → Readiness → Opportunities
```

Every stage reads the output of the one before it. Change a skill or add evidence and
the CareerTwin is marked stale; rebuilding it updates matches, gaps, the roadmap and
readiness.

## Key features

| Feature | What it does |
|---|---|
| **Accounts** | Registration, login and session restore with JWT; deactivated accounts are refused |
| **Student profile** | Education, skills, projects, certifications and career targets, validated server-side |
| **Resume intelligence** | Paste text or upload PDF / DOCX / TXT; AI extracts structured data, and every extracted skill, name and link must appear in the resume text or it is dropped |
| **CareerTwin** | Merges profile, resumes and evidence into one skill model with a strength per skill and stale-state detection; optional AI-written summary |
| **Career matching** | Ranks the 10-role curated catalogue with a transparent, weighted, deterministic score |
| **Skill gap** | Per-role breakdown of required and preferred skills: missing, claimed, supported or verified |
| **Personalised roadmap** | Ordered plan built from the gap, with priority, effort and prerequisite ordering |
| **Assessments** | Timed, server-scored skill assessments; answer keys never leave the server |
| **AI interview** | Question sessions with AI feedback on each answer, scored against a rubric |
| **Evidence engine** | Records assessment and interview results and feeds them back into the CareerTwin |
| **Readiness** | Per-role readiness from the gap and evidence, reported as counts — not an invented percentage |
| **Opportunities** | Matches a small curated set of practice opportunities that require verified skills |
| **Dashboard** | One summary of profile, resumes, CareerTwin, focus role, gap, roadmap and next step |
| **UI** | Responsive from 320 px, light / dark / system theme, keyboard and screen-reader support |

## What makes it different

**Evidence, not self-assessment.** Every skill carries a strength:

```
claimed   → the student says so (profile, or resume skills list)
supported → backed by something built (a project, a resume project)
verified  → passed a server-scored assessment, or a human-evaluated interview
```

The strongest evidence for a skill wins, and a later weaker or failed result never
downgrades a verified skill.

**AI assists; rules decide.** AI reads resumes, writes an optional CareerTwin summary
and gives interview feedback. Matching, gaps, roadmaps, readiness and evidence are
deterministic, explainable domain logic. An AI-evaluated interview is advisory and can
never, on its own, make a skill verified.

## Architecture

```
React + Vite + Tailwind CSS  (client/)
        │  REST / JSON, Bearer JWT
        ▼
Node.js + Express API        (server/)
  routes → controllers → services
        │                     │
        ▼                     ▼
  deterministic domain     AI provider boundary
  logic (server/src/domain)   (Gemini, behind a provider registry)
        │
        ▼
     MongoDB (Mongoose)
```

- Controllers stay thin; services own business logic; `server/src/domain` holds the
  deterministic engines (CareerTwin, scoring, skill gap, roadmap, readiness, evidence,
  assessments).
- All AI calls go through one provider interface with timeouts, bounded retries and
  structured output. If no provider is configured, AI features return a clear
  "unavailable" response and nothing is invented.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router 7, Vite 6, Tailwind CSS 4 |
| Backend | Node.js (≥ 20), Express |
| Database | MongoDB with Mongoose |
| Auth | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` |
| Files | `multer` (in-memory), `pdf-parse`, `mammoth` |
| AI | Google Gemini API |

## AI safety and trust

- **Structured output only**: model responses must be JSON matching a strict schema;
  anything else is rejected, and scores are recomputed on the server.
- **Grounding**: resume skills must appear in the resume as whole words; interview
  feedback is checked against the question and answer.
- **Prompt boundaries**: untrusted text (resumes, answers) is delimited and escaped, and
  instructions inside it are ignored; red-team tests cover injection and delimiter
  attacks.
- **No self-certification by AI**: AI output is advisory. Verified evidence comes only
  from server-scored assessments or human evaluation.
- **Honest failure**: provider errors, timeouts and quota limits return a clean
  "try again" response — never a fake result. The deterministic demo provider cannot
  run in production.

## Security

- JWT (HS256 pinned, issuer, audience, expiry); the user's role is read from the
  database on every request, not trusted from the token.
- Passwords hashed with bcrypt; strong-secret checks on `JWT_SECRET` at startup.
- Every user-owned query is filtered by the authenticated user (no cross-user access).
- Server-side validation of every request, with unknown fields rejected; 1 MB JSON limit.
- Uploads: size, type, extension and file-signature checks, ZIP-bomb protection for
  DOCX, page and text limits; files are parsed in memory and never stored on disk.
- Per-IP and per-user rate limits on login, registration, uploads, AI calls,
  assessments and interviews.
- CORS restricted to the configured client origin; `nosniff`, `X-Frame-Options: DENY`,
  `no-referrer`; `X-Powered-By` removed.
- Errors return generic messages; logs redact secrets and tokens.

## Getting started

### Prerequisites

- Node.js 20 or later
- A MongoDB instance (local or MongoDB Atlas)
- A Gemini API key, for AI features (optional — everything else works without it)

### 1. Backend

```bash
cd server
npm install
cp .env.example .env     # set MONGODB_URI and JWT_SECRET (and AI settings if wanted)
npm run dev              # http://localhost:5000
```

Check it: `curl http://localhost:5000/api/health`

The server refuses to start without a reachable database or a strong `JWT_SECRET`.

### 2. Frontend

In a second terminal:

```bash
cd client
npm install
cp .env.example .env     # VITE_API_URL=http://localhost:5000
npm run dev              # http://localhost:5173
```

The dev server is pinned to port 5173 because the backend's `CLIENT_URL` (CORS origin)
points there — change both together.

### Scripts

| Location | Command | Purpose |
|---|---|---|
| `server` | `npm run dev` / `npm start` | Run the API (with / without file watching) |
| `server` | `npm test` | Integration tests against a real MongoDB `_test` database |
| `server` | `npm run seed:demo` | Seed demo accounts for a local demo — **never run against production** |
| `client` | `npm run dev` | Vite dev server |
| `client` | `npm run build` | Production build into `client/dist` |
| `client` | `npm run preview` | Serve the production build locally |
| `client` | `npm test` | End-to-end tests in headless Chrome/Edge |

Tests use a database whose name ends in `_test` and refuse to run otherwise. Run one
backend suite at a time per test database.

## Environment variables

Copy the `.env.example` files; never commit a real `.env`. Names only below.

**`server/.env`**

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | **Yes** | MongoDB connection string |
| `JWT_SECRET` | **Yes** | At least 32 random characters |
| `NODE_ENV` | Recommended | Set to `production` in production (hides error details) |
| `PORT` | No | Default `5000` |
| `CLIENT_URL` | No | Allowed CORS origin; default `http://localhost:5173` |
| `TRUST_PROXY` | No | Set when running behind a reverse proxy |
| `JWT_EXPIRES_IN` | No | Default `1h` |
| `AI_PROVIDER` | No | `gemini`, `demo` (not allowed in production), or empty to disable AI |
| `GEMINI_API_KEY` | If `AI_PROVIDER=gemini` | Secret |
| `GEMINI_MODEL` | No | Gemini model id |
| `GEMINI_TIMEOUT_MS` | No | Default `60000` |
| `MONGODB_URI_TEST` | No | Test database override |
| `DEMO_STUDENT_PASSWORD`, `DEMO_ADMIN_PASSWORD` | For `seed:demo` only | Your own choice; the seed script refuses to run without them |

**`client/.env`**

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend base URL, no trailing slash. Browser-visible — never put a secret here |

## Secrets and configuration

- Real credentials live **only** in `server/.env` locally (git-ignored) and in your host's
  secret settings in deployment. The code reads them from `process.env`
  (`MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`).
- `.env.example` files hold variable names and harmless defaults only — never real values.
- Tests never use real credentials. Code that detects or redacts secrets is tested with
  the generated fakes in `server/tests/helpers/fakeSecrets.js`; the test database comes
  from `MONGODB_URI_TEST` or a local `_test` database.
### Secret scanning gate

```
git commit → pre-commit hook → gitleaks (staged changes)   → commit allowed / blocked
git push   → pre-push hook   → gitleaks (commits being pushed) → push allowed / blocked
GitHub     → CI workflow     → gitleaks (full history)     → build passes / fails
```

- **Setup is automatic.** `npm install` in `server/` or `client/` sets
  `core.hooksPath` to `.githooks` and installs a pinned, checksum-verified
  [gitleaks](https://github.com/gitleaks/gitleaks) into `.tools/` (git-ignored). If the
  download failed (e.g. offline), run `node scripts/install-gitleaks.mjs`.
- **What is scanned**: before a push, every commit that the remote does not already have,
  using the rules in `.gitleaks.toml` — gitleaks' standard rules (API keys, tokens, JWTs,
  private keys, cloud credentials) plus credentialed database URIs and hardcoded
  passwords.
- **What blocks a push**: any finding, *or* a scan that cannot run (gitleaks missing,
  broken or misconfigured). The hook fails closed and never prints the matched value,
  only file, line and rule.
- **Fixing a detection**: remove the value from the commit that introduced it (amend it,
  or rewrite your unpushed commits) — a later commit deleting it is not enough, because
  the pushed history would still contain it. Put real values in `server/.env`, and use
  `server/tests/helpers/fakeSecrets.js` for test values. If the value really was a
  credential, rotate it.
- **Bypassing is not part of the workflow.** Git's `--no-verify` flag skips hooks; it is
  for emergencies only, requires a manual security review of the pushed commits, and CI
  scans the full history regardless.

Never commit real credentials — not in code, tests, fixtures, docs, examples or
`.env.example`. `.env` files are local or set in the host's secret settings only.

## Deployment

Nexora is two deployable parts with no platform-specific configuration in the repo:

- **API**: a Node.js service — `npm install && npm start` in `server/` — with the
  environment variables above, `NODE_ENV=production`, a reachable MongoDB (e.g. Atlas)
  and HTTPS terminated by the host or a reverse proxy (`TRUST_PROXY` set accordingly).
- **Client**: a static site — `npm run build` in `client/` with `VITE_API_URL` set to
  the API's public URL — served from `client/dist` by any static host. Set the API's
  `CLIENT_URL` to the client's public origin.

See [docs/deployment.md](docs/deployment.md) and
[docs/deployment-smoke.md](docs/deployment-smoke.md) for checks.

## Project structure

```
client/            React app
  src/pages/         one component per route
  src/components/    shared UI, landing sections, feature components
  src/services/      API client and per-feature service modules
  tests/             browser end-to-end and contract tests
server/            Express API
  src/routes/        HTTP routes          src/controllers/  request handling
  src/services/      business logic       src/domain/       deterministic engines
  src/models/        Mongoose schemas     src/services/ai/  AI provider boundary
  src/middleware/    auth, rate limits, uploads, errors
  tests/             integration, security and red-team tests
docs/              architecture, product and feature documentation
```

## Documentation

| Document | Contents |
|---|---|
| [architecture.md](docs/architecture.md) | System design, data model and API reference |
| [prd.md](docs/prd.md) · [srs.md](docs/srs.md) | Product requirements and specification |
| [ui-ux.md](docs/ui-ux.md) | Design system and UX rules |
| [interview.md](docs/interview.md) · [interview-demo.md](docs/interview-demo.md) | AI interview design and demo guide |
| [readiness.md](docs/readiness.md) · [opportunities.md](docs/opportunities.md) | Readiness and opportunity contracts |
| [quality-and-limitations.md](docs/quality-and-limitations.md) | Detailed scope and limitations |
| [phases.md](docs/phases.md) | Delivery phases |
| [deployment.md](docs/deployment.md) | Deployment and verification |

## Limitations

- **Curated domain data**: 10 career roles, a canonical skill taxonomy and curated
  assessment and interview question banks. Skills outside the taxonomy are not matched.
- **Opportunities are curated practice opportunities**, not live job listings — there is
  no job-board or government-portal integration.
- **AI dependency**: resume analysis and interview feedback need a configured Gemini key
  and are subject to its quotas; without it those features report "unavailable".
- **Single-instance design**: rate limits and in-flight AI de-duplication live in
  process memory. Running several API instances needs a shared store first.
- **Interviews are text-based**; there is no voice or video.
- **Human-verified interview evidence** currently relies on an admin account; there is no
  separate reviewer workflow.
- Dashboard and list endpoints are not paginated or cached — fine for a demo cohort,
  but they need load testing before large-scale use.

## Status

Feature-complete and verified for demonstration and submission: the full backend and
frontend test suites pass, the production build succeeds, and dependency audits report
no known vulnerabilities.
