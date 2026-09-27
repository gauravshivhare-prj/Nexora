# Deployment Smoke Test

Run these checks against the same built artifacts and environment variables
that will be deployed. Do not paste secrets into the checklist or commit an
environment file.

## Reproducible local run

```powershell
Push-Location server
npm test -- tests/deployment.smoke.test.js
Pop-Location

Push-Location client
npm run build
Pop-Location
```

For a deployed environment, set `VITE_API_URL` to the deployed API origin,
start the backend with `npm start` from `server`, and serve the client build.

## Checks

- `GET /api/health` returns HTTP `200` and a healthy status with connected database state and timestamp.
- An unauthenticated request to a protected endpoint returns `401` with standard error envelope (`errorCode: AUTH_TOKEN_MISSING`).
- The frontend build completes (`npm run build`) and its API base URL is the deployed backend, not a localhost fallback.
- The backend starts with all required and optional environment variables:
  - `MONGODB_URI`: Required. MongoDB replica set connection string.
  - `JWT_SECRET`: Required. 32+ character random secret (non-placeholder, >= 8 distinct characters).
  - `PORT`: Optional (defaults to 5000).
  - `CLIENT_URL`: Optional (defaults to `http://localhost:5173`). Supports single URL or comma-separated origins for CORS.
  - `TRUST_PROXY`: Optional (defaults to `false`). Set to `true` or integer hop count behind reverse proxy/load balancer.
  - `JWT_EXPIRES_IN`: Optional (defaults to `1h`, format: `\d+[smhd]`).
  - `AI_PROVIDER`: Optional (`gemini` or unset).
  - `GEMINI_API_KEY`: Required only when `AI_PROVIDER=gemini`.
  - `GEMINI_MODEL`: Optional (defaults to `gemini-2.0-flash`).
  - `GEMINI_TIMEOUT_MS`: Optional (defaults to `60000`).
- CORS allows the configured `CLIENT_URL` (or list of origins) and denies unpermitted origins.
- Core-loop smoke checks verify:
  - `POST /api/auth/register` creates user and returns 201.
  - `POST /api/auth/login` verifies credentials and returns 200 with JWT.
  - `GET /api/profile` returns student profile with 200.
  - `GET /api/careers/roles` returns career roles catalogue with 200.
  - `GET /api/opportunities` returns opportunities list with 200.
  - `GET /api/summary` returns unified dashboard aggregation with 200.
- Provider-unavailable responses are controlled `503` responses (`AI_PROVIDER_FAILED`) and do not expose provider details or stack traces.
- Check database connectivity and indexes in startup logs before sending real traffic. Never point test commands at a production database.

The current MVP intentionally uses an in-memory rate limiter and in-memory resume extraction. Multi-instance deployment needs an external rate-limit store (e.g. Redis) and persistent object storage before those workflows are horizontally scaled.
