import { Router } from 'express';

import { checkHealth } from '../controllers/health.controller.js';
import { getSystemMetrics } from '../controllers/metrics.controller.js';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';

const router = Router();

router.get('/', checkHealth);
router.get('/metrics', requireAuth, requireRole('admin'), getSystemMetrics);

export default router;
