# Nexora

AI-Powered Career Readiness & Employability Platform — *From Student Profile to Career-Ready Candidate*.

> **Status: Phase 5 — Career Recommendation backend foundation.**
> Implemented: the project foundation, authentication (register, login, logout,
> JWT-protected routes, session restore, rate limiting), the student profile, resume
> storage with an AI analysis pipeline, the CareerTwin — a derived career
> representation whose every skill carries traceable evidence — and deterministic,
> explainable career matching against a curated role catalogue.
>
> **No AI provider ships with Nexora**, so resume analysis answers `503 — not
> configured` rather than returning invented data. The CareerTwin and career
> matching use no AI at all and work fully in that state. The role catalogue is a
> hand-written reference list and carries **no salary, demand or hiring figures** —
> there is no verified source for them.
>
> Not built: resume file upload, skill gap, the roadmap, and any UI beyond
> authentication and the profile. See [docs/phases.md](docs/phases.md) for the
> sequence and
> [docs/architecture.md](docs/architecture.md#7-implemented-surface) for the exact
> data model, API surface and AI boundary that exist today.

## Repository layout

```text
client/   React + Vite + Tailwind frontend
server/   Node + Express + MongoDB API
docs/     Product, architecture, UI/UX and process documentation
```

## Prerequisites

- Node.js 20 or later (developed on 22.x)
- A reachable MongoDB instance (local or Atlas)

## Setup

Both applications read their configuration from a local `.env` file. Neither `.env` is
committed — copy the example and fill in your own values.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env    # then set MONGODB_URI
npm run dev             # http://localhost:5000
```

The server **will not start** if `MONGODB_URI` is missing or the database is
unreachable. That is deliberate: a server that boots without its database would
report itself healthy while being unable to do any real work.

Verify it:

```bash
curl http://localhost:5000/api/health
# {"success":true,"message":"Nexora API is healthy","environment":"development"}
```

### 2. Frontend

Run this in a second terminal, with the backend already running.

```bash
cd client
npm install
cp .env.example .env    # VITE_API_URL defaults to http://localhost:5000
npm run dev             # http://localhost:5173
```

Open <http://localhost:5173> and press **Check API Connection** to call the real
`GET /api/health` endpoint.

> The dev server port is pinned to 5173 because the backend's CORS origin
> (`CLIENT_URL` in `server/.env`) is configured for it. If you change one, change
> the other.

## Scripts

| Location | Command | Purpose |
|---|---|---|
| `server` | `npm run dev` | Start the API with file watching |
| `server` | `npm start` | Start the API |
| `server` | `npm test` | Integration tests against a real MongoDB |
| `client` | `npm run dev` | Start the Vite dev server |
| `client` | `npm run build` | Production build into `client/dist` |
| `client` | `npm run preview` | Serve the production build locally |
| `client` | `npm test` | End-to-end tests in a real headless browser |

### Testing notes

Neither suite mocks anything. The backend tests run the real Express app against a
real MongoDB; the frontend tests boot the backend, the Vite dev server and headless
Chrome, then drive the browser over the DevTools Protocol. Both refuse to run against
a database whose name does not end in `_test`, and both drop their database afterwards.

The frontend suite needs Chrome or Edge installed. Neither suite adds a test
dependency — the harnesses are in `server/tests/helpers/` and `client/tests/helpers/`.

## Environment variables

| File | Variable | Notes |
|---|---|---|
| `server/.env` | `NODE_ENV` | `development` / `production` |
| `server/.env` | `PORT` | Defaults to `5000` |
| `server/.env` | `CLIENT_URL` | Allowed CORS origin; defaults to `http://localhost:5173` |
| `server/.env` | `MONGODB_URI` | **Required.** Server refuses to start without it |
| `server/.env` | `MONGODB_URI_TEST` | Optional. Overrides the derived `_test` database |
| `server/.env` | `JWT_SECRET` | **Required.** At least 32 random characters |
| `server/.env` | `JWT_EXPIRES_IN` | Token lifetime, e.g. `1h`. Defaults to `1h` |
| `server/.env` | `AI_PROVIDER` | Optional. Name of a registered AI provider; empty ships no provider |
| `client/.env` | `VITE_API_URL` | Backend base URL, no trailing slash |

Only `VITE_`-prefixed variables are exposed to the browser. Never put a secret in
`client/.env`.

## Conventions

Development process, coding standards and the design system are documented in
[docs/development.md](docs/development.md), [docs/PROJECT_RULES.md](docs/PROJECT_RULES.md)
and [docs/ui-ux.md](docs/ui-ux.md). In short: one feature at a time, every phase
tested and reviewed before the next begins.
