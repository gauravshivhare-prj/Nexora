import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { readinessHistory } from '../controllers/recommendation.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/history/:roleId', readinessHistory);

export default router;
