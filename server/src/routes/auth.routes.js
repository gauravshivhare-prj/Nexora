import { Router } from 'express';

import {
  exportData,
  login,
  logout,
  me,
  refresh,
  register,
  removeAccount,
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
 * Task 39: GDPR right to portability (export) and right to erasure (account deletion).
 */
const router = Router();

export const loginLimiter = createRateLimiter(RATE_LIMIT_POLICY.login);
export const registerLimiter = createRateLimiter(RATE_LIMIT_POLICY.register);
export const exportLimiter = createRateLimiter(RATE_LIMIT_POLICY.exportData);
export const deleteAccountLimiter = createRateLimiter(RATE_LIMIT_POLICY.accountDeletion);

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.post('/refresh', requireAuth, refresh);
router.post('/change-password', requireAuth, updatePassword);
router.get('/export', requireAuth, exportLimiter, exportData);
router.delete('/account', requireAuth, deleteAccountLimiter, removeAccount);

export default router;
