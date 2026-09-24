import { Router } from 'express';

import {
  getAssessmentHandler,
  getAttemptHandler,
  getLatestResultHandler,
  listAssessmentsHandler,
  listAttemptsHandler,
  startAttemptHandler,
  submitAttemptHandler,
} from '../controllers/assessment.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { RATE_LIMIT_POLICY } from '../constants/authPolicy.js';

/**
 * Assessment rate limiters (keyed per authenticated student).
 */
export const assessmentAttemptLimiter = createRateLimiter(RATE_LIMIT_POLICY.assessmentAttempt);
export const assessmentSubmitLimiter = createRateLimiter(RATE_LIMIT_POLICY.assessmentSubmit);

/**
 * Assessment routes.
 *
 * All routes require authentication (`requireAuth`) to prevent anonymous
 * access or cross-tenant contamination.
 */
const router = Router();

router.use(requireAuth);

// 1. Root collection: list sanitized assessments
router.get('/', listAssessmentsHandler);

// 2. Student attempt collection routes (mounted before parameterized :assessmentId)
router.get('/attempts', listAttemptsHandler);
router.post('/attempts', assessmentAttemptLimiter, startAttemptHandler);
router.get('/attempts/:attemptId', getAttemptHandler);
router.post('/attempts/:attemptId/submit', assessmentSubmitLimiter, submitAttemptHandler);

// 3. Named assessment routes
router.get('/:assessmentId', getAssessmentHandler);
router.post('/:assessmentId/attempts', assessmentAttemptLimiter, startAttemptHandler);
router.post('/:assessmentId/submit', assessmentSubmitLimiter, submitAttemptHandler);
router.get('/:assessmentId/latest', getLatestResultHandler);

export default router;
