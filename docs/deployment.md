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
- [ ] `error.md` reviewed

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
4. Record incident in `error.md`.
5. Fix and test in staging.
6. Redeploy only after verification.

## Strict Rule

**Never deploy directly from an untested local state.**

## Known MVP Limitations

### In-Memory Rate Limiter
The rate limiter stores hit counts in Node.js process memory. In a multi-instance or horizontally scaled deployment, rate limits apply per-instance rather than globally across instances. For multi-instance production, replace or back the store with Redis or an external distributed cache.

### In-Memory Resume File Extraction
`POST /api/resumes/upload` extracts text in-memory from PDF/DOCX uploads and stores the extracted text in MongoDB. Original file binaries are discarded after extraction. The `file.storageKey` field on the Resume model serves as a placeholder for future persistent object storage (e.g., S3/GCS) if re-downloading becomes a product requirement.

### AI Provider Configuration
Resume analysis (`POST /api/resumes/:id/analysis`) and interview answer evaluation (`POST /api/interviews/sessions/:id/questions/:questionId/answers`) require `AI_PROVIDER=gemini` (or another registered adapter) and `GEMINI_API_KEY`. If unconfigured, these endpoints return `503 AI_PROVIDER_NOT_CONFIGURED` without inventing student career data. In contrast, CareerTwin narrative generation (`POST /api/career-twin?narrative=true`) falls back gracefully without a narrative if AI is unconfigured or unavailable.

### AI Advisory Role & Institutional Evidence Policy
AI mock interview evaluations are strictly advisory (`outcome: 'uncertain'`, `eligibleForVerified: false`). Raw AI feedback cannot directly grant verified skill evidence regardless of candidate scores. Verified evidence is granted exclusively through deterministic assessments (e.g., passing multiple-choice and coding tests) or authenticated human examiner reviews.

### Deterministic Opportunity Matching
`GET /api/opportunities` matches student profiles deterministically against a curated internal catalogue (`curated_internal`). It does not scrape live job boards, submit applications, or use LLMs to invent live external job listings.

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

Recommended behavior:
- Micro-interactions: ~150–250ms
- Standard transitions: ~250–400ms
- Complex/reveal animations: ~400–700ms
- Respect `prefers-reduced-motion`.

Animation must reinforce **cause → effect**. For example, completing an assessment should visibly update the relevant readiness/skill state instead of merely showing a generic success toast.
