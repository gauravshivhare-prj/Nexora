import { Router } from 'express';

import { register } from '../controllers/auth.controller.js';

/**
 * Authentication routes.
 *
 * Phase 1 step 1: registration only. Login, logout and token refresh are
 * separate, individually tested steps.
 */
const router = Router();

router.post('/register', register);

export default router;
