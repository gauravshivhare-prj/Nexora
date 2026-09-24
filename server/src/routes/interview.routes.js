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

router.post('/sessions', create);
router.get('/sessions', list);
router.get('/sessions/:sessionId', read);
router.post('/sessions/:sessionId/start', start);
router.post('/sessions/:sessionId/questions/:questionId/answers', evaluationLimiter, submitAnswer);
router.post('/sessions/:sessionId/complete', complete);
router.post('/sessions/:sessionId/abandon', abandon);

export default router;
