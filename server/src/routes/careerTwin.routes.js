import { Router } from 'express';

import { RATE_LIMIT_POLICY } from '../constants/authPolicy.js';
import { generate, read } from '../controllers/careerTwin.controller.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * CareerTwin routes.
 *
 * `requireAuth` on the router, so a route added later cannot be left
 * unprotected by omission.
 *
 * No id in the path: a student has exactly one CareerTwin and it is only ever
 * addressable as "mine". Same reasoning as the profile — a route that took an
 * id would need an ownership check on every call, and not having the route
 * removes the chance of forgetting one.
 */
const router = Router();

router.use(requireAuth);

/**
 * Generation rebuilds from the profile and every analysed resume, and with
 * `?narrative=true` also calls a provider. Reads are not limited: they load
 * one document.
 */
export const generateLimiter = createRateLimiter(RATE_LIMIT_POLICY.careerTwin);

router.get('/', read);
router.post('/', generateLimiter, generate);

export default router;
