import { Router } from 'express';

import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';

/** Root API router. Future feature routers mount here, one per phase. */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

export default router;
