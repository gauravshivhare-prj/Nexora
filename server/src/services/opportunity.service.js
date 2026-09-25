import { OPPORTUNITY_CATALOGUE, matchOpportunities } from '../domain/opportunities/opportunityCatalogue.js';
import { OPPORTUNITY_CATALOGUE_VERSION } from '../domain/opportunities/opportunityContract.js';
import { CAREER_ROLES } from '../domain/careers/roleCatalogue.js';
import { CareerTwin, StudentProfile } from '../models/index.js';

/**
 * Returns opportunities for the authenticated student only.
 *
 * Missing inputs are an honest empty result: eligibility cannot be inferred
 * from an incomplete profile or from claims weaker than verified evidence.
 */
export async function getOpportunities(userId, filters = {}) {
  const [twin, profile] = await Promise.all([
    CareerTwin.findOne({ user: userId }),
    StudentProfile.findOne({ user: userId }).select('career.targetRole'),
  ]);

  let matched = matchOpportunities(twin, profile);

  const roleFilter = filters?.role || filters?.roleId;
  if (roleFilter && typeof roleFilter === 'string' && roleFilter.trim() !== '') {
    const normalized = roleFilter.trim().toLowerCase();
    matched = matched.filter((opp) =>
      opp.targetRoleIds.some((id) => id.toLowerCase() === normalized) ||
      opp.targetRoleIds.some((id) => {
        const r = CAREER_ROLES.find((cr) => cr.id === id);
        return r && r.title.toLowerCase() === normalized;
      }),
    );
  }

  return {
    opportunities: matched,
    catalogue: {
      version: OPPORTUNITY_CATALOGUE_VERSION,
      source: OPPORTUNITY_CATALOGUE[0]?.source ?? null,
    },
    method: {
      deterministic: true,
      usesAi: false,
      requiresVerifiedEvidence: true,
      sourceStatus: 'curated_internal',
    },
  };
}