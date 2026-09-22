import { Router } from 'express';

import { summary } from '../controllers/summary.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * Dashboard summary route.
 *
 * `requireAuth` on the router, so a route added here later cannot be left
 * unprotected by omission.
 */
const router = Router();

router.use(requireAuth);

router.get('/', summary);

export default router;
