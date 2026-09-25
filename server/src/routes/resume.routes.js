import { Router } from 'express';

import { RATE_LIMIT_POLICY } from '../constants/authPolicy.js';
import { analyse, create, list, read, remove, upload } from '../controllers/resume.controller.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { uploadResumeFile } from '../middleware/uploadResume.js';

/**
 * Resume routes.
 *
 * `requireAuth` is applied to the router, so a route added here later cannot
 * be left unprotected by omission.
 *
 * Unlike the profile, these carry an id in the URL. Ownership is enforced in
 * the service by scoping every query to the authenticated user — never by
 * loading a document and checking it afterwards.
 */
const router = Router();

router.use(requireAuth);

/**
 * Limiters for the two endpoints that cost something real.
 *
 * Mounted after `requireAuth`, deliberately: the limiter keys by
 * `req.auth.userId` when it is set, and the cost of an analysis follows the
 * account rather than the connection. Ordering them the other way round
 * would silently fall back to per-IP keying.
 */
export const analysisLimiter = createRateLimiter(RATE_LIMIT_POLICY.aiAnalysis);
export const uploadLimiter = createRateLimiter(RATE_LIMIT_POLICY.upload);

router.post('/', uploadLimiter, create);

// The multipart parser sits behind requireAuth *and* the limiter, so
// neither an anonymous nor a flooding request gets a single byte of its
// body read, let alone parsed.
router.post('/upload', uploadLimiter, uploadResumeFile, upload);

router.get('/', list);

router.get('/:resumeId', read);
router.delete('/:resumeId', remove);

router.post('/:resumeId/analysis', analysisLimiter, analyse);

export default router;
