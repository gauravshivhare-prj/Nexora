import { ERROR_CODES } from '../constants/errorCodes.js';
import { buildRoadmap } from '../domain/roadmap/buildRoadmap.js';
import { getSkillGap } from './skillGap.service.js';
import { ApiError } from '../utils/ApiError.js';
import { checkInteger } from '../utils/fieldTypes.js';

/**
 * Roadmap generation.
 *
 * Built directly on the skill gap service rather than reaching for the
 * CareerTwin itself. That is the whole architectural point: a roadmap item
 * exists because a gap was measured, so if the two were computed
 * independently they could eventually disagree — and a plan that tells a
 * student to learn something their own gap analysis says they have is worse
 * than no plan.
 *
 * ```text
 * CareerTwin → skill gap → prioritised skills → roadmap
 * ```
 *
 * Nothing is persisted, for the same reason as the gap: it is a pure
 * function of a twin and a versioned role. Completion is not stored either —
 * a student completes an item by adding the evidence, which closes the gap,
 * which removes the item. A stored completion flag could disagree with the
 * evidence, which is exactly what this design prevents.
 */

const MAX_ITEMS = 25;

function parseMaxItems(raw) {
  if (raw === undefined) return 10;

  const { value, error } = checkInteger(raw, { min: 1, max: MAX_ITEMS });
  if (error) {
    throw ApiError.badRequest(
      `The item limit must be a whole number between 1 and ${MAX_ITEMS}.`,
      ERROR_CODES.VALIDATION_ERROR,
    );
  }

  return value;
}

/**
 * Generates a roadmap towards one role.
 *
 * @param {string} userId From requireAuth.
 * @param {string} roleId
 * @param {{ maxItems?: unknown }} [options]
 * @throws {ApiError} 404 unknown role, 409 no CareerTwin.
 */
export async function getRoadmap(userId, roleId, { maxItems, skillGap } = {}) {
  // Reuses the skill gap service wholesale, including its ownership scoping,
  // its 404 for an unknown role and its 409 for a missing CareerTwin. If a
  // precomputed skillGap is provided (e.g. by summary.service), reuse it directly.
  const { gap, basedOn } = skillGap ?? (await getSkillGap(userId, roleId));

  const roadmap = buildRoadmap(gap, { maxItems: parseMaxItems(maxItems) });

  return {
    roadmap,
    basedOn: {
      ...basedOn,
      skillGapSkills: gap.skills.length,
    },
  };
}
