import { Router } from 'express';

import { RATE_LIMIT_POLICY } from '../constants/authPolicy.js';
import {
  abandon,
  complete,
  create,
  list,
  read,
  start,
  submitAnswer,
} from '../controllers/interview.controller.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * AI Interview session and evaluation routes.
 *
 * All routes require authentication. Ownership is strictly enforced
 * in the service layer by scoping queries to req.auth.userId.
 */
const router = Router();

router.use(requireAuth);

/**
 * Rate limiter for answer evaluation endpoint to prevent token exhaustion.
 */
export const evaluationLimiter = createRateLimiter(RATE_LIMIT_POLICY.aiAnalysis);

/** Per-user limit on session writes that are not AI calls. */
export const sessionWriteLimiter = createRateLimiter(RATE_LIMIT_POLICY.interviewSession);

router.post('/sessions', sessionWriteLimiter, create);
router.get('/sessions', list);
router.get('/sessions/:sessionId', read);
router.post('/sessions/:sessionId/start', sessionWriteLimiter, start);
router.post('/sessions/:sessionId/questions/:questionId/answers', evaluationLimiter, submitAnswer);
router.post('/sessions/:sessionId/complete', sessionWriteLimiter, complete);
router.post('/sessions/:sessionId/abandon', sessionWriteLimiter, abandon);

export default router;
