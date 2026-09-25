import { ERROR_CODES } from '../constants/errorCodes.js';
import { computeSkillGap } from '../domain/skillGap/computeSkillGap.js';
import { findRole } from '../domain/careers/roleCatalogue.js';
import { CATALOGUE_SOURCE, CATALOGUE_VERSION } from '../domain/careers/roleCatalogue.js';
import { CareerTwin } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Skill gap analysis.
 *
 * Like recommendations, nothing is persisted: a gap is a pure function of a
 * CareerTwin and a versioned role, so a stored copy could only go stale
 * against the twin it was derived from. Recomputing is cheap.
 *
 * The twin is the only input. Reaching into profiles and resumes directly
 * would redo the merging and evidence work the twin already did, and would
 * eventually redo it differently — at which point a student's skill gap and
 * their CareerTwin would disagree about what they know.
 */

/**
 * Loads the student's twin in the shape the comparison expects.
 *
 * @throws {ApiError} 409 when none has been generated.
 */
async function loadTwin(userId) {
  const twin = await CareerTwin.findOne({ user: userId }).lean();

  if (!twin) {
    throw new ApiError(
      409,
      'Generate your CareerTwin first — your skill gaps are measured against it.',
      ERROR_CODES.CAREER_TWIN_NOT_FOUND,
    );
  }

  return {
    skills: twin.skills.map((skill) => ({
      key: skill.key,
      name: skill.name,
      strength: skill.strength,
      selfDeclaredLevel: skill.selfDeclaredLevel ?? null,
      sourceCount: skill.sourceCount,
      evidence: (skill.evidence ?? []).map((item) => ({
        source: item.source,
        strength: item.strength,
        detail: item.detail,
        reference: item.reference ?? null,
      })),
    })),
    targetRoles: twin.targetRoles ?? [],
    generatedAt: twin.generatedAt,
  };
}

/**
 * Compares the student against one role.
 *
 * @param {string} userId From requireAuth.
 * @param {string} roleId
 * @throws {ApiError} 404 unknown role, 409 no CareerTwin.
 */
export async function getSkillGap(userId, roleId) {
  const role = findRole(roleId);

  if (!role) {
    throw ApiError.notFound(
      'No career role was found with that id.',
      ERROR_CODES.CAREER_ROLE_NOT_FOUND,
    );
  }

  const twin = await loadTwin(userId);

  return {
    gap: computeSkillGap(twin, role),
    basedOn: {
      careerTwinGeneratedAt: twin.generatedAt,
      skillsConsidered: twin.skills.length,
    },
    method: {
      deterministic: true,
      usesAi: false,
      catalogueVersion: CATALOGUE_VERSION,
      catalogueSource: CATALOGUE_SOURCE,
      /**
       * Stated in the response, not only the docs. A client showing "you
       * have this skill" must be able to explain what Nexora means by it,
       * and a student reading "claimed" deserves to know it is a distinct
       * thing from "shown".
       */
      statusMeanings: {
        missing: 'Nexora has not seen this skill anywhere in your profile or resumes.',
        claimed: 'You have listed this skill, but Nexora has not seen you use it.',
        supported: 'You have pointed at a project or certification that involves it.',
        verified: 'An independent check has passed. Not available until assessments exist.',
      },
    },
  };
}
