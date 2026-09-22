import { Router } from 'express';

import {
  createAssessment,
  createInterview,
  listChecks,
} from '../controllers/skillEvidence.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.use(requireAuth);
router.get('/', listChecks);
router.post('/assessments', createAssessment);
router.post('/interviews', createInterview);

export default router;
