import express, { Router } from 'express';

import authRoutes from './auth.routes.js';
import careerRoutes from './career.routes.js';
import careerTwinRoutes from './careerTwin.routes.js';
import healthRoutes from './health.routes.js';
import interviewRoutes from './interview.routes.js';
import profileRoutes from './profile.routes.js';
import opportunityRoutes from './opportunity.routes.js';
import resumeRoutes from './resume.routes.js';
import summaryRoutes from './summary.routes.js';
import skillEvidenceRoutes from './skillEvidence.routes.js';
import assessmentRoutes from './assessment.routes.js';
import readinessRoutes from './readiness.routes.js';

import studentRoutes from './student.routes.js';
import adminRoutes from './admin.routes.js';
import { handleCspReport } from '../controllers/security.controller.js';

/** Root API router. Future feature routers mount here, one per phase. */
const router = Router();

router.post(
  '/csp-report',
  express.json({ type: ['application/json', 'application/csp-report', '*/*'] }),
  handleCspReport,
);

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/opportunities', opportunityRoutes);
router.use('/resumes', resumeRoutes);
router.use('/career-twin', careerTwinRoutes);
router.use('/careers', careerRoutes);
router.use('/readiness', readinessRoutes);
router.use('/summary', summaryRoutes);
router.use('/skill-evidence', skillEvidenceRoutes);
router.use('/assessments', assessmentRoutes);
router.use('/interviews', interviewRoutes);
router.use('/student', studentRoutes);
router.use('/admin', adminRoutes);

export default router;
