import { Router } from 'express';

import { analyse, create, list, read, remove } from '../controllers/resume.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * Resume routes.
 *
 * `requireAuth` is applied to the router, so a route added here later cannot
 * be left unprotected by omission.
 *
 * Unlike the profile, these carry an id in the URL. Ownership is enforced in
 * the service by scoping every query to the authenticated user — never by
 * loading a document and checking it afterwards.
 */
const router = Router();

router.use(requireAuth);

router.post('/', create);
router.get('/', list);

router.get('/:resumeId', read);
router.delete('/:resumeId', remove);

router.post('/:resumeId/analysis', analyse);

export default router;
