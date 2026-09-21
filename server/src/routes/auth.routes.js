import { Router } from 'express';

import { login, logout, me, register } from '../controllers/auth.controller.js';
import { RATE_LIMIT_POLICY } from '../constants/authPolicy.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * Authentication routes.
 *
 * Phase 1 complete surface: register, login, logout and the current-user
 * lookup. Login and register are rate-limited per IP to protect against
 * credential guessing and registration abuse.
 */
const router = Router();

export const loginLimiter = createRateLimiter(RATE_LIMIT_POLICY.login);
export const registerLimiter = createRateLimiter(RATE_LIMIT_POLICY.register);

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;
