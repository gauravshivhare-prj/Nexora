import {
  OPPORTUNITY_CATALOGUE,
  matchOpportunities,
  nearMissOpportunities,
} from '../domain/opportunities/opportunityCatalogue.js';
import { OPPORTUNITY_CATALOGUE_VERSION } from '../domain/opportunities/opportunityContract.js';
import { CAREER_ROLES } from '../domain/careers/roleCatalogue.js';
import { CareerTwin, StudentProfile } from '../models/index.js';

/**
 * Returns matched and near-miss opportunities for the authenticated student.
 *
 * Task 18 — Opportunity Matching & Eligibility Engine Reconstruction:
 *   - Expanded catalogue (10 curated opportunities across 4 career paths).
 *   - `opportunities`: fully-matched (all eligibility rules satisfied).
 *   - `nearMiss`: opportunities the student partially qualifies for, with
 *     `gapToEligibility` listing exactly which skills to verify.
 *   - `matchScore`: percentage of required skills already verified.
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

  // Support configurable threshold
  if (filters?.threshold !== undefined && filters?.nearMissThreshold === undefined) {
    effectiveFilters.nearMissThreshold = filters.threshold;
  }

  const opportunities = matchOpportunities(twin, profile, OPPORTUNITY_CATALOGUE, effectiveFilters);
  const nearMiss = nearMissOpportunities(twin, profile, OPPORTUNITY_CATALOGUE, effectiveFilters);

  return {
    opportunities,
    nearMiss,
    catalogue: {
      version: OPPORTUNITY_CATALOGUE_VERSION,
      source: OPPORTUNITY_CATALOGUE[0]?.source ? { ...OPPORTUNITY_CATALOGUE[0].source } : null,
      totalInCatalogue: OPPORTUNITY_CATALOGUE.length,
    },
    method: {
      deterministic: true,
      usesAi: false,
      requiresVerifiedEvidence: true,
      sourceStatus: 'curated_internal',
      liveCoverage: false,
      note: 'Opportunities are curated internal practice exercises and apprenticeships, not live external job postings. nearMiss shows opportunities you partially qualify for with a gapToEligibility action list.',
    },
  };
}
