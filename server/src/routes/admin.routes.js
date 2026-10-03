import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';
import { getAdminConsistencyReport } from '../controllers/consistency.controller.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/consistency/:userId', getAdminConsistencyReport);
router.post('/consistency/:userId/reconcile', getAdminConsistencyReport);

export default router;
