import {
  listRoles,
  recommendRoles,
  scoreAgainstRole,
} from '../services/recommendation.service.js';
import { getRoadmap } from '../services/roadmap.service.js';
import { getSkillGap } from '../services/skillGap.service.js';
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

/**
 * GET /api/careers/roles/:roleId/skill-gap
 *
 * Every skill the role names, with where the student stands on it and what
 * would move it up a level.
 *
 * Sits under the role rather than at a top-level `/skill-gap` because a gap
 * has no meaning without a role to be short of. Nothing is persisted — it is
 * a pure function of a CareerTwin and a versioned role.
 */
export const skillGap = asyncHandler(async (req, res) => {
  const data = await getSkillGap(req.auth.userId, req.params.roleId);

  res.status(200).json({
    success: true,
    message: 'Skill gap calculated',
    data,
  });
});

/**
 * GET /api/careers/roles/:roleId/roadmap
 *
 * A prioritised plan for closing the gaps towards this role.
 *
 * Under the role for the same reason the gap is: a roadmap without a
 * destination is a reading list. `?maxItems=` caps the plan; the summary
 * reports how many actionable gaps existed before the cap, so a student is
 * not left thinking a ten-item plan is the whole of it.
 */
export const roadmap = asyncHandler(async (req, res) => {
  const data = await getRoadmap(req.auth.userId, req.params.roleId, {
    maxItems: req.query.maxItems,
  });

  res.status(200).json({
    success: true,
    message:
      data.roadmap.items.length > 0
        ? 'Roadmap generated'
        : 'No roadmap needed — you already meet what this role asks for',
    data,
  });
});
