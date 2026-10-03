import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getOwnConsistencyReport } from '../controllers/consistency.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/consistency', getOwnConsistencyReport);
router.post('/consistency/reconcile', getOwnConsistencyReport);

export default router;
