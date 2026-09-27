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
    CareerTwin.findOne({ user: userId }).lean(),
    StudentProfile.findOne({ user: userId }).select('career.targetRole targetRole').lean(),
  ]);

  let effectiveFilters = { ...filters };
  const roleFilter = filters?.role || filters?.roleId;
  if (roleFilter && typeof roleFilter === 'string' && roleFilter.trim() !== '') {
    const normalized = roleFilter.trim().toLowerCase();
    const matchedRole = CAREER_ROLES.find(
      (cr) => cr.id.toLowerCase() === normalized || cr.title.toLowerCase() === normalized,
    );
    if (matchedRole) {
      effectiveFilters.roleId = matchedRole.id;
    } else {
      effectiveFilters.roleId = roleFilter.trim();
    }
  }

  const opportunities = matchOpportunities(twin, profile, OPPORTUNITY_CATALOGUE, effectiveFilters);

  return {
    opportunities,
    catalogue: {
      version: OPPORTUNITY_CATALOGUE_VERSION,
      source: OPPORTUNITY_CATALOGUE[0]?.source ?? null,
    },
    method: {
      deterministic: true,
      usesAi: false,
      requiresVerifiedEvidence: true,
      sourceStatus: 'curated_internal',
      liveCoverage: false,
      note: 'Opportunities are curated internal practice exercises and apprenticeships, not live external job postings.',
    },
  };
}
