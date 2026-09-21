import { generateCareerTwin, getCareerTwin } from '../services/careerTwin.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/career-twin
 *
 * Returns the stored twin, or `exists: false` before one has been generated.
 * A student who has not generated one has not failed at anything, so this is
 * a 200 with an empty state rather than a 404.
 *
 * Deliberately does not regenerate. A read that rewrote stored data would
 * make GET a mutation, and would hide from the student that their twin had
 * gone out of date. `isStale` and `staleReasons` say so instead, and the
 * client can offer to refresh.
 */
export const read = asyncHandler(async (req, res) => {
  const { twin, exists } = await getCareerTwin(req.auth.userId);

  res.status(200).json({
    success: true,
    message: exists ? 'CareerTwin retrieved' : 'No CareerTwin generated yet',
    data: { careerTwin: twin, exists },
  });
});

/**
 * POST /api/career-twin
 *
 * Rebuilds the twin from the student's current profile and analysed resumes.
 *
 * A POST rather than a PUT: the client supplies no representation, and the
 * result depends on data that may have changed since the last call.
 *
 * `?narrative=true` additionally asks a model for a short written summary.
 * Opt-in because it costs a provider call; the twin itself is built without
 * one. If no provider is configured — Nexora's shipped state — the twin is
 * still generated and `narrative` comes back null.
 */
export const generate = asyncHandler(async (req, res) => {
  const withNarrative = req.query.narrative === 'true';

  const twin = await generateCareerTwin(req.auth.userId, { withNarrative });

  res.status(200).json({
    success: true,
    message: 'CareerTwin generated',
    data: { careerTwin: twin, exists: true },
  });
});
