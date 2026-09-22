import { getSummary } from '../services/summary.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/summary
 *
 * Everything the authenticated dashboard needs, in one read.
 *
 * A GET despite doing real work: it stores nothing and returns the same
 * answer for the same data, which is exactly what a GET promises. Scoped to
 * the caller with no id in the path, like the profile and the CareerTwin —
 * there is no route by which one student could ask for another's summary.
 *
 * Always 200. A new account has no CareerTwin, no matches and no roadmap,
 * and each section says so; that is an empty state, not an error, and
 * answering 404 would make a client treat a normal first visit as a failure.
 */
export const summary = asyncHandler(async (req, res) => {
  const data = await getSummary(req.auth.userId);

  res.status(200).json({
    success: true,
    message: 'Summary retrieved',
    data,
  });
});
