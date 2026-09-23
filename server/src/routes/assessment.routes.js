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
router.post('/attempts', startAttemptHandler);
router.get('/attempts/:attemptId', getAttemptHandler);
router.post('/attempts/:attemptId/submit', submitAttemptHandler);

// 3. Named assessment routes
router.get('/:assessmentId', getAssessmentHandler);
router.post('/:assessmentId/attempts', startAttemptHandler);
router.post('/:assessmentId/submit', submitAttemptHandler);
router.get('/:assessmentId/latest', getLatestResultHandler);

export default router;
