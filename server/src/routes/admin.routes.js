import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';
import { getAdminConsistencyReport } from '../controllers/consistency.controller.js';
import { getAuditLogs } from '../controllers/auditLog.controller.js';

const router = Router();

const adminGuard = [requireAuth, requireRole('admin')];

router.get('/consistency/:userId', ...adminGuard, getAdminConsistencyReport);
router.post('/consistency/:userId/reconcile', ...adminGuard, getAdminConsistencyReport);
router.get('/audit-logs', ...adminGuard, getAuditLogs);

export default router;

