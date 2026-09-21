import { Router } from 'express';

import {
  recommendations,
  roleMatch,
  roles,
  skillGap,
} from '../controllers/recommendation.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * Career role and recommendation routes.
 *
 * `requireAuth` on the router, so a route added later cannot be left
 * unprotected by omission.
 *
 * The `:roleId` here is catalogue reference data, not a student-owned
 * resource — every student sees the same roles. The *match* against it is
 * computed from `req.auth.userId`, so there is still no path by which one
 * student's data reaches another.
 */
const router = Router();

router.use(requireAuth);

router.get('/roles', roles);
router.get('/roles/:roleId/match', roleMatch);
router.get('/roles/:roleId/skill-gap', skillGap);
router.get('/recommendations', recommendations);

export default router;
