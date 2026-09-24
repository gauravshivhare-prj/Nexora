import { AI_REQUEST_TIMEOUT_MS, post, request } from './apiClient.js';

/**
 * CareerTwin calls against the Nexora API.
 *
 * Two endpoints, both scoped to "mine" — there is no id in the path because a
 * student has exactly one twin.
 */

/** Mirrors EVIDENCE_STRENGTH in server/src/domain/evidence/evidence.js. */
export const EVIDENCE_STRENGTH = {
  CLAIMED: 'claimed',
  SUPPORTED: 'supported',
  VERIFIED: 'verified',
};

/** Weakest to strongest, matching EVIDENCE_STRENGTH_ORDER on the server. */
export const STRENGTH_ORDER = [
  EVIDENCE_STRENGTH.CLAIMED,
  EVIDENCE_STRENGTH.SUPPORTED,
  EVIDENCE_STRENGTH.VERIFIED,
];

/** Mirrors EVIDENCE_SOURCES. Used only to label a source for a human. */
export const EVIDENCE_SOURCE_LABELS = {
  self_declared: 'Listed on your profile',
  resume: 'Named in a resume',
  project: 'Used in a project',
  certification: 'Covered by a certification',
  assessment: 'Passed an assessment',
  interview: 'Shown in an AI interview',
};

function toTwin(twin) {
  return {
    skills: (twin.skills ?? []).map((skill) => ({
      key: skill.key,
      name: skill.name,
      strength: skill.strength,
      selfDeclaredLevel: skill.selfDeclaredLevel ?? null,
      sourceCount: skill.sourceCount ?? 0,
      evidence: skill.evidence ?? [],
    })),
    interests: twin.interests ?? [],
    targetRoles: twin.targetRoles ?? [],
    academic: twin.academic ?? null,
    indicators: {
      totalSkills: 0,
      claimedOnly: 0,
      supported: 0,
      verified: 0,
      projectCount: 0,
      certificationCount: 0,
      analysedResumeCount: 0,
      hasTargetRole: false,
      ...(twin.indicators ?? {}),
    },
    narrative: twin.narrative ?? null,
    sources: {
      hasProfile: false,
      profileUpdatedAt: null,
      resumeCount: 0,
      analysedResumeCount: 0,
      verifiedEvidenceCount: 0,
      latestEvidenceAt: null,
      ...(twin.sources ?? {}),
    },
    generatedAt: twin.generatedAt ?? null,
    isStale: Boolean(twin.isStale),
    staleReasons: twin.staleReasons ?? [],
  };
}

/**
 * GET /api/career-twin
 *
 * `exists: false` before one has been generated — a 200 with an empty state,
 * because a student who has not generated one has not failed at anything.
 *
 * @returns {Promise<{ twin: object|null, exists: boolean }>}
 */
export async function fetchCareerTwin({ signal } = {}) {
  const body = await request('/api/career-twin', { signal });

  const data = body?.data;
  if (!data) throw new Error('The backend returned an unexpected response shape.');

  return {
    twin: data.careerTwin ? toTwin(data.careerTwin) : null,
    exists: Boolean(data.exists),
  };
}

/**
 * POST /api/career-twin
 *
 * @param {{ withNarrative?: boolean }} [options] The narrative costs a model
 *   call, so the server makes it opt-in and so does this. Asking for one
 *   without a configured provider is not an error — the twin is built and
 *   `narrative` comes back null.
 */
export async function generateCareerTwin({ withNarrative = false } = {}) {
  const query = withNarrative ? '?narrative=true' : '';

  // Only the narrative calls a model; the twin itself is deterministic. The
  // longer budget is therefore applied only when one was asked for.
  const body = await post(`/api/career-twin${query}`, undefined, {
    ...(withNarrative ? { timeoutMs: AI_REQUEST_TIMEOUT_MS } : {}),
  });

  const twin = body?.data?.careerTwin;
  if (!twin) throw new Error('The backend returned an unexpected response shape.');

  return toTwin(twin);
}
