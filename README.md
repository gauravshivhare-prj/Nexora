# Nexora

AI-Powered Career Readiness & Employability Platform — *From Student Profile to Career-Ready Candidate*.

> **Status: Phase 0 — Foundation.**
> No product features are implemented yet. The application currently proves that the
> frontend, the backend and the database connection all start and talk to each other.
> See [docs/phases.md](docs/phases.md) for the development sequence.

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
| `client` | `npm run dev` | Start the Vite dev server |
| `client` | `npm run build` | Production build into `client/dist` |
| `client` | `npm run preview` | Serve the production build locally |

## Environment variables

| File | Variable | Notes |
|---|---|---|
| `server/.env` | `NODE_ENV` | `development` / `production` |
| `server/.env` | `PORT` | Defaults to `5000` |
| `server/.env` | `CLIENT_URL` | Allowed CORS origin; defaults to `http://localhost:5173` |
| `server/.env` | `MONGODB_URI` | **Required.** Server refuses to start without it |
| `server/.env` | `JWT_SECRET` | Reserved for Phase 1; unused today |
| `client/.env` | `VITE_API_URL` | Backend base URL, no trailing slash |

Only `VITE_`-prefixed variables are exposed to the browser. Never put a secret in
`client/.env`.

## Conventions

Development process, coding standards and the design system are documented in
[docs/development.md](docs/development.md), [docs/PROJECT_RULES.md](docs/PROJECT_RULES.md)
and [docs/ui-ux.md](docs/ui-ux.md). In short: one feature at a time, every phase
tested and reviewed before the next begins.
