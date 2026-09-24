import { Router } from 'express';

import { list } from '../controllers/opportunity.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.use(requireAuth);
router.get('/', list);

export default router;