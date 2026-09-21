import {
  listRoles,
  recommendRoles,
  scoreAgainstRole,
} from '../services/recommendation.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/careers/roles
 *
 * The curated role catalogue, with its source stated. Lets a client show
 * what roles exist before a student has generated a CareerTwin.
 */
export const roles = asyncHandler(async (_req, res) => {
  const data = listRoles();

  res.status(200).json({
    success: true,
    message: 'Career roles retrieved',
    data,
  });
});

/**
 * GET /api/careers/recommendations
 *
 * Ranks roles for the signed-in student against their CareerTwin.
 *
 * A GET despite doing real work: it is a pure read that stores nothing and
 * returns the same answer for the same twin, which is exactly what a GET
 * promises. Nothing is persisted, because a recommendation is a function of
 * a twin and a versioned catalogue — a stored copy could only go stale.
 *
 * `?limit=` caps the list; `?includeAll=true` returns weak matches too,
 * which are normally filtered out as noise.
 */
export const recommendations = asyncHandler(async (req, res) => {
  const data = await recommendRoles(req.auth.userId, {
    limit: req.query.limit,
    includeAll: req.query.includeAll === 'true',
  });

  res.status(200).json({
    success: true,
    message:
      data.matches.length > 0
        ? 'Career recommendations generated'
        : 'No roles matched strongly enough to recommend yet',
    data,
  });
});

/**
 * GET /api/careers/roles/:roleId/match
 *
 * Scores the student against one named role, so a role they are curious
 * about is not a dead end just because it missed the top list.
 */
export const roleMatch = asyncHandler(async (req, res) => {
  const data = await scoreAgainstRole(req.auth.userId, req.params.roleId);

  res.status(200).json({
    success: true,
    message: 'Role match calculated',
    data,
  });
});
