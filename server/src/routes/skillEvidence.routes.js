import { Router } from 'express';

import {
  createAssessment,
  createInterview,
  listChecks,
  submitSkillClaim,
  submitSkillSupport,
  invalidateEvidenceCheck,
  getSummary,
  recomputeEvidence,
} from '../controllers/skillEvidence.controller.js';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';

const router = Router();

router.use(requireAuth);

// Historical evidence checks list
router.get('/', listChecks);

// Claim -> Support -> Verification Lifecycle Endpoints
router.get('/summary', getSummary);
router.post('/claim', submitSkillClaim);
router.post('/support', submitSkillSupport);
router.post('/:evidenceId/invalidate', invalidateEvidenceCheck);
router.post('/recompute', recomputeEvidence);

// Direct result recording trusts raw scores, restricted to admins.
// Students earn assessment/interview evidence through proctored engines.
router.post('/assessments', requireRole('admin'), createAssessment);
router.post('/interviews', requireRole('admin'), createInterview);

export default router;
