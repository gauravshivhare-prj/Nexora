import { Router } from 'express';

import { login, logout, me, register } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * Authentication routes.
 *
 * Phase 1 complete surface: register, login, logout and the current-user
 * lookup. Only /me is protected — logout is stateless and needs no token.
 */
const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;
