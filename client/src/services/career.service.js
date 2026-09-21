import { request } from './apiClient.js';

/**
 * Career role, recommendation and skill-gap calls.
 *
 * Every one of these is a pure read on the backend — nothing is persisted,
 * because a match is a function of a CareerTwin and a versioned catalogue and
 * a stored copy could only go stale. That matters here too: this module never
 * caches a result, and no score or status is ever computed on this side.
 */

/** Mirrors GAP_STATUS in server/src/domain/skillGap/computeSkillGap.js. */
export const GAP_STATUS = {
  MISSING: 'missing',
  CLAIMED: 'claimed',
  SUPPORTED: 'supported',
  VERIFIED: 'verified',
};

/** Worst to best — the order a student should work through them in. */
export const GAP_STATUS_ORDER = [
  GAP_STATUS.MISSING,
  GAP_STATUS.CLAIMED,
  GAP_STATUS.SUPPORTED,
  GAP_STATUS.VERIFIED,
];

/** GET /api/careers/roles — the curated catalogue, identical for everyone. */
export async function fetchRoles({ signal } = {}) {
  const body = await request('/api/careers/roles', { signal });

  const data = body?.data;
  if (!data?.roles) throw new Error('The backend returned an unexpected response shape.');

  return { roles: data.roles, source: data.source ?? null };
}

/**
 * GET /api/careers/recommendations
 *
 * @param {{ includeAll?: boolean, limit?: number }} [options] `includeAll`
 *   returns the weak matches the backend otherwise filters out as noise.
 */
export async function fetchRecommendations({ includeAll = false, limit, signal } = {}) {
  const query = new URLSearchParams();
  if (includeAll) query.set('includeAll', 'true');
  if (limit) query.set('limit', String(limit));

  const suffix = query.toString() ? `?${query}` : '';
  const body = await request(`/api/careers/recommendations${suffix}`, { signal });

  const data = body?.data;
  if (!data) throw new Error('The backend returned an unexpected response shape.');

  return {
    matches: data.matches ?? [],
    basedOn: data.basedOn ?? null,
    method: data.method ?? null,
  };
}

/** Mirrors PRIORITY in server/src/domain/roadmap/buildRoadmap.js. */
export const ROADMAP_PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];

/**
 * GET /api/careers/roles/:roleId/roadmap
 *
 * Derived from the skill gap, which is derived from the CareerTwin. Nothing
 * is persisted and — importantly — no completion state is stored anywhere.
 * An item closes when the evidence closes the gap, so there is no flag for a
 * client to set and none for it to invent.
 *
 * @param {{ maxItems?: number }} [options] The response reports how many
 *   actionable gaps existed before this cap, so a capped plan is not
 *   mistaken for the whole of it.
 */
export async function fetchRoadmap(roleId, { maxItems, signal } = {}) {
  const suffix = maxItems ? `?maxItems=${encodeURIComponent(maxItems)}` : '';
  const body = await request(
    `/api/careers/roles/${encodeURIComponent(roleId)}/roadmap${suffix}`,
    { signal },
  );

  const data = body?.data;
  if (!data?.roadmap) throw new Error('The backend returned an unexpected response shape.');

  return { roadmap: data.roadmap, basedOn: data.basedOn ?? null };
}

/** GET /api/careers/roles/:roleId/match */
export async function fetchRoleMatch(roleId, { signal } = {}) {
  const body = await request(
    `/api/careers/roles/${encodeURIComponent(roleId)}/match`,
    { signal },
  );

  const data = body?.data;
  if (!data?.match) throw new Error('The backend returned an unexpected response shape.');

  return { match: data.match, basedOn: data.basedOn ?? null, method: data.method ?? null };
}

/**
 * GET /api/careers/roles/:roleId/skill-gap
 *
 * The response carries `method.statusMeanings` — the backend's own
 * definitions of missing/claimed/supported/verified. The UI renders those
 * rather than its own wording, so what a student is told a status means
 * cannot drift from what the server meant by it.
 */
export async function fetchSkillGap(roleId, { signal } = {}) {
  const body = await request(
    `/api/careers/roles/${encodeURIComponent(roleId)}/skill-gap`,
    { signal },
  );

  const data = body?.data;
  if (!data?.gap) throw new Error('The backend returned an unexpected response shape.');

  return { gap: data.gap, basedOn: data.basedOn ?? null, method: data.method ?? null };
}
