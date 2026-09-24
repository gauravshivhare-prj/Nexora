import { Router } from 'express';

import authRoutes from './auth.routes.js';
import careerRoutes from './career.routes.js';
import careerTwinRoutes from './careerTwin.routes.js';
import healthRoutes from './health.routes.js';
import profileRoutes from './profile.routes.js';
import opportunityRoutes from './opportunity.routes.js';
import resumeRoutes from './resume.routes.js';
import summaryRoutes from './summary.routes.js';
import skillEvidenceRoutes from './skillEvidence.routes.js';
import assessmentRoutes from './assessment.routes.js';

/** Root API router. Future feature routers mount here, one per phase. */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/opportunities', opportunityRoutes);
router.use('/resumes', resumeRoutes);
router.use('/career-twin', careerTwinRoutes);
router.use('/careers', careerRoutes);
router.use('/summary', summaryRoutes);
router.use('/skill-evidence', skillEvidenceRoutes);
router.use('/assessments', assessmentRoutes);

export default router;
