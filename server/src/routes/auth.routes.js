import { Router } from 'express';

import {
  login,
  logout,
  me,
  refresh,
  register,
  updatePassword,
} from '../controllers/auth.controller.js';
import { RATE_LIMIT_POLICY } from '../constants/authPolicy.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * Authentication routes.
 *
 * Phase 1 complete surface: register, login, logout and the current-user lookup.
 * Hardened with token refresh, password change, and account lockout protection.
 */
const router = Router();

export const loginLimiter = createRateLimiter(RATE_LIMIT_POLICY.login);
export const registerLimiter = createRateLimiter(RATE_LIMIT_POLICY.register);

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.post('/refresh', requireAuth, refresh);
router.post('/change-password', requireAuth, updatePassword);

export default router;
