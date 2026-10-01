import { Router } from 'express';

import {
  confirmProfileField,
  readProfile,
  readProfileReconciliation,
  saveProfile,
} from '../controllers/profile.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * Student Profile routes.
 *
 * `requireAuth` is applied to the router rather than to each route, so a route
 * added here later cannot be left unprotected by omission.
 *
 * There is no `/profile/:id`: a profile is only ever addressed as "mine". An
 * endpoint that took an id would need an ownership check on every call, and
 * one forgotten check would expose every student's profile. Not having the
 * route removes the possibility.
 */
const router = Router();

router.use(requireAuth);

router.get('/', readProfile);
router.patch('/', saveProfile);
router.get('/reconcile', readProfileReconciliation);
router.post('/confirm-field', confirmProfileField);

export default router;
