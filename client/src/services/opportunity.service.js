import { request } from './apiClient.js';
import { OPPORTUNITY_SOURCE_TYPES } from '../constants/opportunityOptions.js';

/**
 * Normalizes an opportunity record received from the backend.
 * Ensures consistent types, strips undefined/dangerous properties, and assigns curated/live flags.
 */
export function toOpportunity(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Opportunity record must be an object.');
  }

  const sourceType = raw.source?.type ?? OPPORTUNITY_SOURCE_TYPES.CURATED_INTERNAL;
  const isCurated = sourceType === OPPORTUNITY_SOURCE_TYPES.CURATED_INTERNAL;
  const isLive = sourceType === OPPORTUNITY_SOURCE_TYPES.LIVE_EXTERNAL;

  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? 'Untitled Opportunity'),
    summary: String(raw.summary ?? ''),
    source: {
      type: sourceType,
      version: Number(raw.source?.version ?? 1),
      asOf: String(raw.source?.asOf ?? ''),
    },
    isCurated,
    isLive,
    requiredSkills: Array.isArray(raw.requiredSkills) ? raw.requiredSkills.map(String) : [],
    targetRoleIds: Array.isArray(raw.targetRoleIds) ? raw.targetRoleIds.map(String) : [],
    eligibility: Array.isArray(raw.eligibility) ? raw.eligibility : [],
    matchedEligibility: Array.isArray(raw.matchedEligibility) ? raw.matchedEligibility : [],
    explanation: String(
      raw.explanation ?? 'All listed eligibility rules are satisfied by verified evidence and profile data.',
    ),
    matchScore: typeof raw.matchScore === 'number' ? raw.matchScore : 100,
    gapToEligibility: Array.isArray(raw.gapToEligibility) ? raw.gapToEligibility : [],
    addedDate: raw.addedDate ? String(raw.addedDate) : null,
    expiresAt: raw.expiresAt ? String(raw.expiresAt) : null,
    isActive: raw.isActive !== false,
    matchExplanation: raw.matchExplanation ?? null,
  };
}

/**
 * GET /api/opportunities
 * Fetches matched and near-miss opportunities for the authenticated student.
 */
export async function fetchOpportunities({ threshold, signal } = {}) {
  const query = threshold !== undefined ? `?threshold=${encodeURIComponent(threshold)}` : '';
  const body = await request(`/api/opportunities${query}`, { signal });
  const data = body?.data ?? body;

  if (!Array.isArray(data?.opportunities)) {
    throw new Error('The backend returned an unexpected opportunities response.');
  }

  return {
    opportunities: data.opportunities.map(toOpportunity),
    nearMiss: Array.isArray(data.nearMiss) ? data.nearMiss.map(toOpportunity) : [],
    catalogue: data.catalogue
      ? {
          version: Number(data.catalogue.version ?? 1),
          source: data.catalogue.source ? { ...data.catalogue.source } : null,
        }
      : null,
    method: data.method
      ? {
          deterministic: Boolean(data.method.deterministic),
          usesAi: Boolean(data.method.usesAi),
          requiresVerifiedEvidence: Boolean(data.method.requiresVerifiedEvidence),
          sourceStatus: String(data.method.sourceStatus ?? 'curated_internal'),
        }
      : null,
  };
}
