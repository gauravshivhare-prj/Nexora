import { Router } from 'express';

import {
  createAssessment,
  createInterview,
  listChecks,
} from '../controllers/skillEvidence.controller.js';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';

const router = Router();

router.use(requireAuth);
router.get('/', listChecks);
// Recording a result directly trusts the score in the request body, so only
// administrators may do it. Students earn evidence through the assessment
// engine and interview sessions, which record results server-side.
router.post('/assessments', requireRole('admin'), createAssessment);
router.post('/interviews', requireRole('admin'), createInterview);

export default router;
