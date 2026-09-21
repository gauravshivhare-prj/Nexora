import { Router } from 'express';

import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';
import profileRoutes from './profile.routes.js';
import resumeRoutes from './resume.routes.js';

/** Root API router. Future feature routers mount here, one per phase. */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/resumes', resumeRoutes);

export default router;
