import { OPPORTUNITY_CATALOGUE, matchOpportunities } from '../domain/opportunities/opportunityCatalogue.js';
import { OPPORTUNITY_CATALOGUE_VERSION } from '../domain/opportunities/opportunityContract.js';
import { CareerTwin, StudentProfile } from '../models/index.js';

/**
 * Returns opportunities for the authenticated student only.
 *
 * Missing inputs are an honest empty result: eligibility cannot be inferred
 * from an incomplete profile or from claims weaker than verified evidence.
 */
export async function getOpportunities(userId) {
  const [twin, profile] = await Promise.all([
    CareerTwin.findOne({ user: userId }),
    StudentProfile.findOne({ user: userId }).select('career.targetRole'),
  ]);

  return {
    opportunities: matchOpportunities(twin, profile),
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