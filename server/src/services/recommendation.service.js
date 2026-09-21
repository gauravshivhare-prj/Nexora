import { ERROR_CODES } from '../constants/errorCodes.js';
import { CAREER_ROLES, CATALOGUE_SOURCE, findRole } from '../domain/careers/roleCatalogue.js';
import { rankRoles, scoreRoleMatch } from '../domain/careers/matchRole.js';
import { DIMENSION_WEIGHTS, WEIGHTS_VERSION } from '../domain/careers/scoring.js';
import { CareerTwin } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { checkInteger } from '../utils/fieldTypes.js';

/**
 * Career recommendations.
 *
 * A thin layer: load the student's CareerTwin, hand it to the deterministic
 * matcher, return the result. There is no persistence of its own — a
 * recommendation is a pure function of a twin and a versioned catalogue, so
 * storing one would create a second copy that could disagree with the first.
 * Recomputing is cheap; a stale stored recommendation is not.
 *
 * Everything is computed from the twin rather than from profiles and resumes
 * directly. The twin has already merged skill spellings and attached
 * evidence, and reaching past it would eventually redo that work differently.
 */

const MAX_LIMIT = 20;

/**
 * Loads the student's CareerTwin, in the shape the matcher expects.
 *
 * @throws {ApiError} 409 when none has been generated.
 */
async function loadTwin(userId) {
  const twin = await CareerTwin.findOne({ user: userId });

  if (!twin) {
    // A 409 rather than a 404: the resource being asked for is the
    // recommendation, and the reason it cannot be produced is a missing
    // prerequisite the student can act on.
    throw new ApiError(
      409,
      'Generate your CareerTwin first — recommendations are matched against it.',
      ERROR_CODES.CAREER_TWIN_NOT_FOUND,
    );
  }

  return {
    skills: twin.skills.map((skill) => ({
      key: skill.key,
      name: skill.name,
      strength: skill.strength,
      sourceCount: skill.sourceCount,
      evidence: skill.evidence,
    })),
    interests: twin.interests ?? [],
    targetRoles: twin.targetRoles ?? [],
    academic: twin.academic ?? null,
    generatedAt: twin.generatedAt,
  };
}

/** Validates the `limit` query parameter. */
function parseLimit(raw) {
  if (raw === undefined) return 5;

  const { value, error } = checkInteger(raw, { min: 1, max: MAX_LIMIT });
  if (error) {
    throw ApiError.badRequest(
      `The limit must be a whole number between 1 and ${MAX_LIMIT}.`,
      ERROR_CODES.VALIDATION_ERROR,
    );
  }

  return value;
}

/**
 * Ranks career roles for the signed-in student.
 *
 * @param {string} userId From requireAuth.
 * @param {{ limit?: unknown, includeAll?: boolean }} [options]
 */
export async function recommendRoles(userId, { limit, includeAll = false } = {}) {
  const twin = await loadTwin(userId);

  const { matches, catalogue } = rankRoles(twin, {
    limit: parseLimit(limit),
    includeBelowThreshold: includeAll,
  });

  return {
    matches,
    basedOn: {
      careerTwinGeneratedAt: twin.generatedAt,
      skillsConsidered: twin.skills.length,
    },
    /**
     * How the score was arrived at, returned with every response.
     *
     * A recommendation a student cannot interrogate is one they have to take
     * on faith, and the weights are a judgement rather than a measurement.
     * Shipping them alongside the result is what makes the judgement
     * reviewable.
     */
    method: {
      ...catalogue,
      weights: DIMENSION_WEIGHTS,
      weightsVersion: WEIGHTS_VERSION,
      deterministic: true,
      usesAi: false,
      catalogueSource: CATALOGUE_SOURCE,
    },
  };
}

/**
 * Scores the student against one named role.
 *
 * Exists so a student can ask about a role they are curious about even when
 * it did not make the top list — which is otherwise a dead end.
 *
 * @throws {ApiError} 404 when the role is not in the catalogue.
 */
export async function scoreAgainstRole(userId, roleId) {
  const role = findRole(roleId);

  if (!role) {
    throw ApiError.notFound(
      'No career role was found with that id.',
      ERROR_CODES.CAREER_ROLE_NOT_FOUND,
    );
  }

  const twin = await loadTwin(userId);

  return {
    match: scoreRoleMatch(twin, role),
    basedOn: {
      careerTwinGeneratedAt: twin.generatedAt,
      skillsConsidered: twin.skills.length,
    },
    method: {
      weights: DIMENSION_WEIGHTS,
      weightsVersion: WEIGHTS_VERSION,
      deterministic: true,
      usesAi: false,
      catalogueSource: CATALOGUE_SOURCE,
    },
  };
}

/**
 * The catalogue itself.
 *
 * Public and unauthenticated-adjacent in spirit — it is reference data, not
 * anybody's personal information — but still behind auth for consistency
 * with every other route. Lets a client show what roles exist before a
 * student has a twin.
 */
export function listRoles() {
  return {
    roles: CAREER_ROLES.map((role) => ({
      id: role.id,
      title: role.title,
      category: role.category,
      summary: role.summary,
      requiredSkills: role.requiredSkills,
      preferredSkills: role.preferredSkills,
      relatedTechnologies: role.relatedTechnologies,
    })),
    source: CATALOGUE_SOURCE,
  };
}
