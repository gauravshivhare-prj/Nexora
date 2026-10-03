import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getOwnConsistencyReport } from '../controllers/consistency.controller.js';
import { getUserAiQuotaStatus } from '../services/ai/aiQuota.service.js';

const router = Router();

router.use(requireAuth);

router.get('/consistency', getOwnConsistencyReport);
router.post('/consistency/reconcile', getOwnConsistencyReport);

router.get('/ai-quota', async (req, res, next) => {
  try {
    const status = await getUserAiQuotaStatus(req.auth.userId);
    res.status(200).json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

export default router;
