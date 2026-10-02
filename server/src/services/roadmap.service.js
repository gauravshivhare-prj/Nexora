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
 *
 * Task 16 — Personalised Roadmap Engine:
 *   Passes `availableHoursPerWeek` and `studentGoals` through to buildRoadmap
 *   so the priority engine can pace milestones and align goal-adjacent skills.
 */

const MAX_ITEMS = 25;
const MAX_HOURS_PER_WEEK = 80;
const MIN_HOURS_PER_WEEK = 1;

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
 * Parses and validates availableHoursPerWeek from a query parameter.
 *
 * Defaults to 15 when absent. Clamps to [1, 80] rather than rejecting — a
 * student who says "100 hours/week" is optimistic, not malicious, and
 * clamping produces a useful plan rather than an error page.
 *
 * @param {unknown} raw
 * @returns {number}
 */
function parseHoursPerWeek(raw) {
  if (raw === undefined || raw === null) return 15;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 15;

  return Math.min(MAX_HOURS_PER_WEEK, Math.max(MIN_HOURS_PER_WEEK, Math.round(parsed)));
}

/**
 * Parses student goals from a comma-separated query parameter.
 *
 * Goals are matched against skill names during prioritisation — a student
 * who says "I want to learn React" gets a modest boost on React-adjacent
 * skills. The list is normalised to strings and deduplicated.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseStudentGoals(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return [...new Set(raw.split(',').map((g) => g.trim()).filter(Boolean))];
}

/**
 * Generates a personalised roadmap towards one role.
 *
 * @param {string} userId From requireAuth.
 * @param {string} roleId
 * @param {object} [options]
 * @param {unknown} [options.maxItems]
 * @param {unknown} [options.availableHoursPerWeek]
 * @param {unknown} [options.studentGoals]
 * @param {object} [options.skillGap] Pre-computed gap (e.g. from summary.service).
 * @throws {ApiError} 404 unknown role, 409 no CareerTwin.
 */
export async function getRoadmap(userId, roleId, {
  maxItems,
  availableHoursPerWeek,
  studentGoals,
  skillGap,
} = {}) {
  // Reuses the skill gap service wholesale, including its ownership scoping,
  // its 404 for an unknown role and its 409 for a missing CareerTwin. If a
  // precomputed skillGap is provided (e.g. by summary.service), reuse it directly.
  const { gap, basedOn } = skillGap ?? (await getSkillGap(userId, roleId));

  const roadmap = buildRoadmap(gap, {
    maxItems: parseMaxItems(maxItems),
    availableHoursPerWeek: parseHoursPerWeek(availableHoursPerWeek),
    studentGoals: parseStudentGoals(studentGoals),
  });

  return {
    roadmap,
    basedOn: {
      ...basedOn,
      skillGapSkills: gap.skills.length,
    },
  };
}
