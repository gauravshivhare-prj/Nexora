import { CATALOGUE_VERSION, findRole } from '../domain/careers/roleCatalogue.js';
import { computeReadiness } from '../domain/readiness/computeReadiness.js';
import { getCareerTwin } from './careerTwin.service.js';
import { getSkillGap } from './skillGap.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * Builds readiness from the existing CareerTwin and skill-gap contracts.
 * Nothing is persisted and no model output participates in the result.
 */
export async function getReadiness(userId, roleId) {
  if (!findRole(roleId)) {
    throw ApiError.notFound(
      'No career role was found with that id.',
      ERROR_CODES.CAREER_ROLE_NOT_FOUND,
    );
  }

  const twinResult = await getCareerTwin(userId);

  if (!twinResult.exists) {
    return computeReadiness(null, {
      dataStatus: 'incomplete',
      basedOn: { catalogueVersion: CATALOGUE_VERSION },
    });
  }

  const gapResult = await getSkillGap(userId, roleId);

  return computeReadiness(gapResult.gap, {
    dataStatus: twinResult.twin.isStale ? 'stale' : 'fresh',
    basedOn: {
      careerTwinGeneratedAt: gapResult.basedOn.careerTwinGeneratedAt,
      catalogueVersion: gapResult.method.catalogueVersion,
    },
  });
}