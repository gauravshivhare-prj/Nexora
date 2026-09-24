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

- `GET /api/health` returns HTTP `200` and a healthy status.
- An unauthenticated request to a protected endpoint returns `401` with the
  standard error envelope.
- The frontend build completes and its API base URL is the deployed backend,
  not a localhost fallback.
- The backend starts with `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, and
  `TRUST_PROXY` configured; `GEMINI_API_KEY` is required only when
  `AI_PROVIDER=gemini`.
- CORS allows the configured `CLIENT_URL` and does not allow an unrelated
  origin.
- Register, login, profile save, resume storage, CareerTwin generation,
  recommendations, skill gap, roadmap, readiness, and opportunities return
  their documented envelopes.
- Provider-unavailable responses are controlled `503` responses and do not
  expose provider details or stack traces.
- Check database connectivity and indexes in startup logs before sending real
  traffic. Never point test commands at a production database.

The current MVP intentionally uses an in-memory rate limiter and in-memory
resume extraction. Multi-instance deployment needs an external rate-limit
store and persistent object storage before those workflows are horizontally
scaled.