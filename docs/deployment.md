# Nexora — Deployment & Working Verification

## Goal

Deployment is not complete when the server says "running".

Deployment is complete only when the deployed application is tested end-to-end.

## Environments

### Local
Used for development.

### Staging/Preview
Used for integration testing.

### Production
Only approved, tested code.

## Environment Variables

Never commit secrets.

Example:

```env
NODE_ENV=
PORT=
MONGODB_URI=
JWT_SECRET=
JWT_EXPIRES_IN=
CLIENT_URL=
TRUST_PROXY=
AI_PROVIDER=
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_TIMEOUT_MS=
```

Maintain `.env.example` with variable names only.

## Deployment Checklist

### Before Deployment
- [ ] Build succeeds
- [ ] Lint/checks pass
- [ ] Tests pass
- [ ] No hardcoded secrets
- [ ] Environment variables configured
- [ ] Database migrations/schema changes reviewed
- [ ] API health check works
- [ ] Critical user flow tested locally
- [ ] Known open issues reviewed

### Frontend
- [ ] Production build succeeds
- [ ] API base URL points to correct environment
- [ ] No localhost URLs remain
- [ ] No console errors
- [ ] Routes work after refresh

### Backend
- [ ] Server starts successfully
- [ ] `/health` returns healthy status
- [ ] Database connection succeeds
- [ ] Authentication works
- [ ] CORS is correctly configured
- [ ] Production errors do not expose stack traces

### Database
- [ ] Correct production connection
- [ ] Required indexes exist
- [ ] Seed/reference data verified
- [ ] No accidental test data in production

## Post-Deployment Smoke Test

Run this complete flow:

```text
Open Landing Page
      ↓
Register
      ↓
Login
      ↓
Create Profile
      ↓
Upload Resume
      ↓
Generate CareerTwin
      ↓
View Career Recommendations
      ↓
Open Skill Gap
      ↓
Generate Roadmap
      ↓
Take Assessment / AI Interview
      ↓
Verify Readiness Update
      ↓
Open Opportunities
      ↓
Logout
```

## Production Verification

Check:
- Browser console
- Network requests
- API response status
- Database writes
- Authentication
- AI response handling
- Loading states
- Error states
- Mobile/responsive layout

## Rollback

If deployment introduces a critical regression:
1. Stop promoting new changes.
2. Identify last known good version.
3. Roll back.
4. Record the incident in the team issue tracker.
5. Fix and test in staging.
6. Redeploy only after verification.

## Strict Rule

**Never deploy directly from an untested local state.**

## Known MVP Limitations

### In-Memory Rate Limiter
The rate limiter stores hit counts in Node.js process memory. In a multi-instance or horizontally scaled deployment, rate limits apply per-instance rather than globally across instances. For multi-instance production, replace or back the store with Redis or an external distributed cache.

### In-Memory Resume File Extraction
`POST /api/resumes/upload` extracts text in-memory from PDF/DOCX uploads and stores the extracted text in MongoDB. Original file binaries are discarded after extraction. The `file.storageKey` field on the Resume model serves as a placeholder for future persistent object storage (e.g., S3/GCS) if re-downloading becomes a product requirement.

### AI Provider Configuration & Interview Deployment
- **Provider Setup**: Resume analysis (`POST /api/resumes/:id/analysis`) and live interview question evaluation (`POST /api/interviews/sessions/:id/questions/:questionId/answers`) require `AI_PROVIDER=gemini` (or another registered adapter) and `GEMINI_API_KEY`. If unconfigured, endpoints return `503 AI_PROVIDER_NOT_CONFIGURED` without corrupting session state or inventing student data. In contrast, CareerTwin narrative generation (`POST /api/career-twin?narrative=true`) falls back gracefully without a narrative if AI is unconfigured or unavailable.
- **Institutional Evidence Policy**: Student interview completions run via AI evaluation and produce advisory evidence (`outcome: 'uncertain'`, `evidenceStrength: 'supported'`). Institutional `verified` evidence requires authorized human administrative evaluation (`POST /api/skill-evidence/interviews` or human examiner workflow) or passing intermediate/advanced skill assessments (>= 70%).
- **Evidence Coexistence**: Advisory interview evidence (`supported`) coexists with assessment evidence without downgrading existing verified evidence (`verified`) in CareerTwin aggregation.
- **Provider Outage & Rate Limiting**: Upstream 429 quota exhaustion and network drop/timeout are safely isolated to 503/429 without committing fake evaluations or advancing question progress. In-flight evaluations for the same question are deduplicated.
- **Text-Only Submissions**: Candidates type text responses (10–5,000 characters); speech-to-text and video proctoring are intentional non-goals for MVP.

### Deterministic Opportunity Matching
`GET /api/opportunities` matches student profiles deterministically against a curated internal catalogue (`curated_internal`). It does not scrape live job boards, submit applications, or use LLMs to invent live external job listings.

### Post-Deployment AI Interview Verification
To smoke test the live interview feature:
1. Navigate to `/interviews` on the deployed frontend.
2. Select target role (e.g. Backend Developer), select canonical skills (e.g. Node.js, MongoDB), select difficulty (Intermediate), and click Start AI Interview.
3. Verify session initializes and transitions to `in_progress`.
4. Enter technical response (verifying active question countdown timer and live character counter bounded between 10 and 5,000 chars).
5. Submit answer; verify loading state, structured rubric dimension cards (accuracy: 0.35, depth: 0.30, clarity: 0.20, relevance: 0.15), feedback, strengths, and growth areas.
6. Complete session; verify overall score calculation and institutional badge ("Advisory Supported" for score >= 75%).
7. Check dashboard / CareerTwin to confirm recorded evidence coexists cleanly with existing assessment results without downgrade.

## Nexora Design & Experience Standard

### Final Visual Theme — Sunset Warm
The finalized Nexora visual identity is **Sunset Warm**.

| Token | Value | Usage |
|---|---|---|
| Primary | `#EA580C` | Primary actions, key highlights, brand accents |
| Secondary | `#F97316` | Secondary actions, active states, emphasis |
| Background | `#FFF7ED` | Main application background |
| Success | `#22C55E` | Completed states, positive readiness signals |
| Warning | `#F59E0B` | Skill gaps, attention states |
| Error | `#EF4444` | Validation and error states |
| Text | `#6B7280` | Secondary text / metadata |
| Card | `#FFFFFF` | Cards, panels, forms |

### Experience Principle
Nexora must feel like a **real student career-support product**, not a generic AI wrapper or a collection of disconnected screens.

The interface should communicate:
- clarity,
- progress,
- trust,
- guidance,
- student continuity,
- actionable next steps.

### Motion & Animation Standard
Use purposeful, smooth animation wherever it improves comprehension or continuity.

Appropriate uses:
- Page/section transitions
- Dashboard card entrance
- Progress-ring animation
- Skill-bar progression
- Roadmap step transitions
- Career-match reveal
- AI analysis/progress states
- Modal/drawer transitions
- Success/completion feedback
- Skeleton loading states
- Hover/focus micro-interactions

Avoid:
- excessive bouncing,
- random decorative motion,
- long transitions,
- animations that delay interaction,
- animation on every element,
- distracting parallax.

Animation must reinforce **cause → effect**. For example, completing an assessment should visibly update the relevant readiness/skill state instead of merely showing a generic success toast.

---

## Production Deployment Architecture & Security (Task 40)

### 1. Reverse Proxy & HTTPS Enforcement (HSTS)
In modern production environments (Vercel, Render, Cloudflare, AWS CloudFront), SSL/TLS termination is handled at the reverse proxy or edge CDN layer:
- **Client (Vercel)**: Configured in `client/vercel.json` with `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- **API (Render / Reverse Proxy)**: Render automatically provisions Let's Encrypt certificates and redirects all HTTP traffic to HTTPS (port 443). The edge reverse proxy appends HSTS headers.
- **Trust Proxy**: In `server/src/app.js`, `trust proxy` is configurable via `TRUST_PROXY=true` in production to accurately resolve client IP addresses through multi-tier reverse proxies.

### 2. Frontend Deployment on Vercel (`client/vercel.json`)
The React/Vite SPA is configured with:
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Clean URLs**: `true`
- **SPA Rewrites**: `[ { "source": "/(.*)", "destination": "/index.html" } ]` ensuring client-side routes (e.g. `/assessment/attempt/123`, `/interview/session/456`) reload without 404s.
- **Defensive Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

### 3. Backend Deployment on Render (`render.yaml`)
Infrastructure-as-code declaration in `render.yaml`:
- **Service Name**: `nexora-api`
- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`
- **Auto-Deploy**: Explicitly set to `false` for controlled release cycles.
- **Environment Variables**:
  - `NODE_ENV=production`
  - `PORT=10000`
  - `MONGODB_POOL_SIZE=50`
  - `MONGODB_MIN_POOL_SIZE=5`
  - `SHUTDOWN_TIMEOUT_MS=10000`
  - Secrets (`MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `CLIENT_URL`) managed through Render Secret Dashboard with zero hardcoded references.

### 4. Deep Health Check Verification
The `/api/health` endpoint performs real deep inspection of dependencies:
```json
{
  "success": true,
  "status": "healthy",
  "message": "Nexora API is healthy",
  "environment": "production",
  "database": "connected",
  "ai": "available",
  "uptime": 1420,
  "timestamp": "2026-10-03T18:00:00.000Z"
}
```
If MongoDB is disconnected, `/api/health` returns `status: "degraded"` and `database: "disconnected"`. If the AI circuit breaker is tripped, `ai: "circuit_broken"`.

### 5. Configurable Graceful Shutdown
When Render or Kubernetes sends `SIGTERM` or `SIGINT`:
- The server stops accepting new connections on `httpServer`.
- Existing in-flight requests are given up to `SHUTDOWN_TIMEOUT_MS` (default 10,000ms / 10s) to complete.
- MongoDB connection pool is drained and closed via `disconnectDatabase()`.
- An unreferenced timeout timer guarantees the container process terminates even if an unresponsive client socket fails to disconnect.

