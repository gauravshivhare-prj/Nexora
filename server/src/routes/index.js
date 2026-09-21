import { Router } from 'express';

import healthRoutes from './health.routes.js';

/** Root API router. Future feature routers mount here, one per phase. */
const router = Router();

router.use('/health', healthRoutes);

export default router;
