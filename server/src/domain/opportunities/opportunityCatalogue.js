import { EVIDENCE_STRENGTH } from '../evidence/evidence.js';
import { CAREER_ROLES } from '../careers/roleCatalogue.js';
import { skillKey } from '../skills/skillKey.js';
import {
  OPPORTUNITY_CATALOGUE_VERSION,
  OPPORTUNITY_SOURCE_TYPES,
} from './opportunityContract.js';
import {
  validateOpportunityCatalogue,
  auditCatalogueFreshness,
} from './catalogueIntegrity.js';

export { validateOpportunityCatalogue, auditCatalogueFreshness };

const SOURCE_AS_OF = '2026-10-02';

/**
 * Task 18 & 25 — Expanded Opportunity Catalogue.
 *
 * Ten curated internal practice opportunities across four career paths.
 * IDs are stable and must never be reused for a different record.
 *
 * Design decisions:
 * - All opportunities are internal practice exercises, NOT live external postings.
 * - Eligibility requires verified evidence — claimed skills do not qualify.
 * - `minSkillFraction` (0 < f ≤ 1) allows partial-match in nearMiss matching:
 *   an opportunity appears as a near-miss if (verifiedSkills / requiredSkills) ≥ minSkillFraction
 *   but the full eligibility is not satisfied.
 * - Each entry declares `addedDate`, `expiresAt`, and `isActive` for freshness tracking.
 */
export const OPPORTUNITY_CATALOGUE = Object.freeze([
  // ─── Backend ───────────────────────────────────────────────────────────────
  Object.freeze({
    id: 'curated_internal:backend-apprenticeship',
    title: 'Backend apprenticeship',
    summary:
      'A practice opportunity for building server-side applications with Node.js and RESTful APIs.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['JavaScript', 'Node.js'] },
      { type: 'target_role', roleIds: ['backend-developer'] },
    ],
    requiredSkills: ['JavaScript', 'Node.js'],
    targetRoleIds: ['backend-developer'],
    minSkillFraction: 0.5,
    addedDate: '2026-10-02',
    expiresAt: '2027-10-02',
    isActive: true,
  }),
  Object.freeze({
    id: 'curated_internal:backend-database-practicum',
    title: 'Backend Database Practicum',
    summary:
      'Hands-on practice working with relational and non-relational databases in a backend context.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['Node.js', 'SQL', 'MongoDB'] },
      { type: 'target_role', roleIds: ['backend-developer', 'full-stack-developer'] },
    ],
    requiredSkills: ['Node.js', 'SQL', 'MongoDB'],
    targetRoleIds: ['backend-developer', 'full-stack-developer'],
    minSkillFraction: 0.5,
    addedDate: '2026-10-02',
    expiresAt: '2027-10-02',
    isActive: true,
  }),
  Object.freeze({
    id: 'curated_internal:backend-api-design',
    title: 'REST API Design Workshop',
    summary:
      'Practice building well-documented, versioned REST APIs with authentication and error handling.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['JavaScript', 'Node.js', 'REST APIs'] },
      { type: 'target_role', roleIds: ['backend-developer', 'full-stack-developer'] },
    ],
    requiredSkills: ['JavaScript', 'Node.js', 'REST APIs'],
    targetRoleIds: ['backend-developer', 'full-stack-developer'],
    minSkillFraction: 0.67,
    addedDate: '2026-10-02',
    expiresAt: '2027-10-02',
    isActive: true,
  }),

  // ─── Frontend ──────────────────────────────────────────────────────────────
  Object.freeze({
    id: 'curated_internal:frontend-apprenticeship',
    title: 'Frontend Apprenticeship',
    summary: 'A practice opportunity for building accessible browser interfaces.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['HTML', 'CSS', 'JavaScript'] },
      { type: 'target_role', roleIds: ['frontend-developer'] },
    ],
    requiredSkills: ['HTML', 'CSS', 'JavaScript'],
    targetRoleIds: ['frontend-developer'],
    minSkillFraction: 0.5,
    addedDate: '2026-10-02',
    expiresAt: '2027-10-02',
    isActive: true,
  }),
  Object.freeze({
    id: 'curated_internal:react-component-challenge',
    title: 'React Component Engineering Challenge',
    summary:
      'Build reusable, accessible React components and demonstrate state management patterns.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['JavaScript', 'React', 'CSS'] },
      { type: 'target_role', roleIds: ['frontend-developer', 'full-stack-developer'] },
    ],
    requiredSkills: ['JavaScript', 'React', 'CSS'],
    targetRoleIds: ['frontend-developer', 'full-stack-developer'],
    minSkillFraction: 0.67,
    addedDate: '2026-10-02',
    expiresAt: '2027-10-02',
    isActive: true,
  }),

  // ─── Full-Stack ─────────────────────────────────────────────────────────────
  Object.freeze({
    id: 'curated_internal:fullstack-apprenticeship',
    title: 'Full-Stack Apprenticeship',
    summary:
      'End-to-end practice project covering frontend, backend, and database integration.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['JavaScript', 'React', 'Node.js'] },
      { type: 'target_role', roleIds: ['full-stack-developer'] },
    ],
    requiredSkills: ['JavaScript', 'React', 'Node.js'],
    targetRoleIds: ['full-stack-developer'],
    minSkillFraction: 0.67,
    addedDate: '2026-10-02',
    expiresAt: '2027-10-02',
    isActive: true,
  }),
  Object.freeze({
    id: 'curated_internal:fullstack-deployment',
    title: 'Full-Stack Deployment Workshop',
    summary:
      'Practice containerising and deploying a full-stack application end-to-end.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['JavaScript', 'Node.js', 'Docker'] },
      { type: 'target_role', roleIds: ['full-stack-developer', 'devops-engineer'] },
    ],
    requiredSkills: ['JavaScript', 'Node.js', 'Docker'],
    targetRoleIds: ['full-stack-developer', 'devops-engineer'],
    minSkillFraction: 0.67,
    addedDate: '2026-10-02',
    expiresAt: '2027-10-02',
    isActive: true,
  }),

  // ─── DevOps ────────────────────────────────────────────────────────────────
  Object.freeze({
    id: 'curated_internal:devops-pipeline-practicum',
    title: 'CI/CD Pipeline Practicum',
    summary:
      'Build and configure a complete CI/CD pipeline with containerisation and infrastructure-as-code.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['Docker', 'Git', 'Linux'] },
      { type: 'target_role', roleIds: ['devops-engineer'] },
    ],
    requiredSkills: ['Docker', 'Git', 'Linux'],
    targetRoleIds: ['devops-engineer'],
    minSkillFraction: 0.5,
    addedDate: '2026-10-02',
    expiresAt: '2027-10-02',
    isActive: true,
  }),
  Object.freeze({
    id: 'curated_internal:devops-kubernetes',
    title: 'Kubernetes Orchestration Challenge',
    summary:
      'Practice deploying, scaling, and managing containerised workloads with Kubernetes.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['Docker', 'Kubernetes', 'Linux'] },
      { type: 'target_role', roleIds: ['devops-engineer'] },
    ],
    requiredSkills: ['Docker', 'Kubernetes', 'Linux'],
    targetRoleIds: ['devops-engineer'],
    minSkillFraction: 0.67,
    addedDate: '2026-10-02',
    expiresAt: '2027-10-02',
    isActive: true,
  }),

  // ─── Cross-role ─────────────────────────────────────────────────────────────
  Object.freeze({
    id: 'curated_internal:git-collaboration-challenge',
    title: 'Git Collaboration Challenge',
    summary:
      'Practice real-world Git workflows: branching, pull requests, code review, and conflict resolution.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['Git'] },
      {
        type: 'target_role',
        roleIds: ['backend-developer', 'frontend-developer', 'full-stack-developer', 'devops-engineer'],
      },
    ],
    requiredSkills: ['Git'],
    targetRoleIds: [
      'backend-developer',
      'frontend-developer',
      'full-stack-developer',
      'devops-engineer',
    ],
    minSkillFraction: 1.0,
    addedDate: '2026-10-02',
    expiresAt: '2027-10-02',
    isActive: true,
  }),
]);

// ─── Matching API ─────────────────────────────────────────────────────────────

/**
 * Matches opportunities with all explicit eligibility rules satisfied.
 *
 * Invalid, duplicated, or stale records are rejected before matching. This is
 * intentionally strict: an unsupported catalogue item must not leak into a
 * student's result merely because one field happened to match.
 *
 * Supports optional filters (roleId, skill, currentDate, includeExpired) without compromising deterministic matching.
 */
export function matchOpportunities(
  twin,
  profile,
  catalogue = OPPORTUNITY_CATALOGUE,
  filters = {},
) {
  validateCatalogue(catalogue);

  const verifiedSkills = resolveVerifiedSkills(twin);
  const targetRoleId = resolveTargetRoleId(profile?.career?.targetRole ?? profile?.targetRole);

  const filterRoleId = filters?.roleId ? filters.roleId.trim().toLowerCase() : null;
  const filterSkillKey = filters?.skill ? skillKey(filters.skill) : null;

  const filtered = applyFilters(catalogue, filterRoleId, filterSkillKey, filters);

  return filtered
    .map((opportunity) => matchOne(opportunity, verifiedSkills, targetRoleId))
    .filter(Boolean);
}

/**
 * Returns opportunities the student is close to qualifying for.
 *
 * A "near miss" is an opportunity where:
 * 1. The student does NOT fully qualify (not in matchOpportunities result).
 * 2. The student meets at least `opportunity.minSkillFraction` of required skills
 *    (or a custom threshold specified via filters.threshold / filters.nearMissThreshold).
 * 3. The opportunity targets a role the student is interested in (if profile has one).
 *
 * Each near-miss includes a `gapToEligibility` field listing exactly which
 * skills the student needs to verify to unlock the opportunity, plus a
 * `matchExplanation` detailing satisfied and missing requirements.
 *
 * @param {object|null} twin CareerTwin document
 * @param {object|null} profile StudentProfile document
 * @param {object[]|readonly object[]} [catalogue] Opportunity catalogue
 * @param {object} [filters] Optional roleId / skill / threshold filters
 * @returns {object[]} Near-miss opportunities with gapToEligibility
 */
export function nearMissOpportunities(
  twin,
  profile,
  catalogue = OPPORTUNITY_CATALOGUE,
  filters = {},
) {
  validateCatalogue(catalogue);

  const verifiedSkills = resolveVerifiedSkills(twin);
  const targetRoleId = resolveTargetRoleId(profile?.career?.targetRole ?? profile?.targetRole);

  const filterRoleId = filters?.roleId ? filters.roleId.trim().toLowerCase() : null;
  const filterSkillKey = filters?.skill ? skillKey(filters.skill) : null;

  const filtered = applyFilters(catalogue, filterRoleId, filterSkillKey, filters);

  // Exclude fully-matched opportunities from near-miss results
  const fullyMatched = new Set(
    filtered
      .filter((opp) => matchOne(opp, verifiedSkills, targetRoleId) !== null)
      .map((opp) => opp.id),
  );

  return filtered
    .filter((opp) => !fullyMatched.has(opp.id))
    .map((opp) => nearMissOne(opp, verifiedSkills, targetRoleId, filters))
    .filter(Boolean);
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/** Extracts verified skill keys from a CareerTwin document. */
function resolveVerifiedSkills(twin) {
  return new Set(
    (twin?.skills ?? [])
      .filter((skill) => skill && skill.strength === EVIDENCE_STRENGTH.VERIFIED)
      .map((skill) => skill.key || (skill.name ? skillKey(skill.name) : ''))
      .filter(Boolean),
  );
}

/** Applies role/skill and expiry filters without mutating the catalogue. */
function applyFilters(catalogue, filterRoleId, filterSkillKey, filters = {}) {
  const currentDate = filters?.currentDate || filters?.now || new Date().toISOString().slice(0, 10);
  const includeExpired = Boolean(filters?.includeExpired);

  return catalogue
    .filter((opportunity) => isCurrentSource(opportunity?.source))
    .filter((opportunity) => {
      // Exclude inactive opportunities
      if (opportunity.isActive === false) {
        return false;
      }
      // Exclude expired opportunities (unless explicitly requested)
      if (!includeExpired && opportunity.expiresAt && opportunity.expiresAt < currentDate) {
        return false;
      }
      if (
        filterRoleId &&
        !opportunity.targetRoleIds?.some((r) => r.toLowerCase() === filterRoleId)
      ) {
        return false;
      }
      if (
        filterSkillKey &&
        !opportunity.requiredSkills?.some((s) => skillKey(s) === filterSkillKey)
      ) {
        return false;
      }
      return true;
    });
}

/**
 * Evaluates one opportunity against a student's verified skills.
 * Returns a match object or null if the student doesn't qualify.
 */
function matchOne(opportunity, verifiedSkills, targetRoleId) {
  if (!opportunity || typeof opportunity !== 'object') return null;
  const matchedEligibility = [];

  for (const rule of opportunity.eligibility ?? []) {
    if (!rule || typeof rule !== 'object') return null;
    if (rule.type === 'verified_skills') {
      const skills = (rule.skills ?? []).map((name) => skillKey(name)).filter(Boolean);
      if (skills.length === 0 || !skills.every((key) => verifiedSkills.has(key))) return null;
      matchedEligibility.push({ type: rule.type, skills: rule.skills });
    } else if (rule.type === 'target_role') {
      const roleIds = Array.isArray(rule.roleIds) ? rule.roleIds : [];
      if (!targetRoleId || !roleIds.includes(targetRoleId)) return null;
      matchedEligibility.push({ type: rule.type, roleIds: rule.roleIds });
    } else {
      return null;
    }
  }

  const requiredKeys = (opportunity.requiredSkills ?? []).map((name) => skillKey(name)).filter(Boolean);
  const verifiedCount = requiredKeys.filter((k) => verifiedSkills.has(k)).length;
  const matchScore = requiredKeys.length > 0 ? Math.round((verifiedCount / requiredKeys.length) * 100) : 100;
  const satisfiedSkills = (opportunity.requiredSkills ?? []).filter((name) => verifiedSkills.has(skillKey(name)));

  return {
    id: opportunity.id,
    title: opportunity.title,
    summary: opportunity.summary,
    source: { ...opportunity.source },
    eligibility: opportunity.eligibility,
    requiredSkills: opportunity.requiredSkills,
    targetRoleIds: opportunity.targetRoleIds,
    matchedEligibility,
    matchScore,
    gapToEligibility: [],
    explanation: 'All listed eligibility rules are satisfied by verified evidence and profile data.',
    matchExplanation: {
      satisfiedSkills,
      missingSkills: [],
      verifiedCount,
      requiredCount: requiredKeys.length,
      matchedRole: targetRoleId,
      summary: 'All listed eligibility rules are satisfied by verified evidence and profile data.',
    },
    addedDate: opportunity.addedDate ?? null,
    expiresAt: opportunity.expiresAt ?? null,
    isActive: opportunity.isActive ?? true,
  };
}

/**
 * Evaluates one opportunity for near-miss status.
 * Returns a near-miss object if the student partially qualifies, null otherwise.
 */
function nearMissOne(opportunity, verifiedSkills, targetRoleId, filters = {}) {
  if (!opportunity || typeof opportunity !== 'object') return null;

  // Check role eligibility — must match the student's target role
  const roleRule = opportunity.eligibility?.find((r) => r.type === 'target_role');
  if (roleRule) {
    const roleIds = Array.isArray(roleRule.roleIds) ? roleRule.roleIds : [];
    if (!targetRoleId || !roleIds.includes(targetRoleId)) return null;
  }

  const requiredKeys = (opportunity.requiredSkills ?? []).map((name) => skillKey(name)).filter(Boolean);
  if (requiredKeys.length === 0) return null;

  const verifiedCount = requiredKeys.filter((k) => verifiedSkills.has(k)).length;
  const fraction = verifiedCount / requiredKeys.length;

  // Determine effective minSkillFraction (configurable via filters)
  let effectiveMinFraction = opportunity.minSkillFraction ?? 0.5;
  const rawThreshold = filters?.threshold ?? filters?.nearMissThreshold;
  if (typeof rawThreshold === 'number' && !Number.isNaN(rawThreshold)) {
    effectiveMinFraction = rawThreshold > 1 ? rawThreshold / 100 : rawThreshold;
  } else if (typeof rawThreshold === 'string' && rawThreshold.trim() !== '') {
    const parsed = Number.parseFloat(rawThreshold.trim());
    if (!Number.isNaN(parsed)) {
      effectiveMinFraction = parsed > 1 ? parsed / 100 : parsed;
    }
  }

  // Only qualify as near-miss if meeting the minimum fraction
  if (fraction < effectiveMinFraction) return null;

  const missingKeys = requiredKeys.filter((k) => !verifiedSkills.has(k));
  const gapToEligibility = missingKeys.map((key) => {
    const originalName = opportunity.requiredSkills.find((name) => skillKey(name) === key);
    return {
      skill: originalName ?? key,
      action: `Verify ${originalName ?? key} with a project or assessment to unlock this opportunity.`,
    };
  });

  const satisfiedSkills = (opportunity.requiredSkills ?? []).filter((name) => verifiedSkills.has(skillKey(name)));
  const missingSkillNames = missingKeys.map(
    (key) => opportunity.requiredSkills.find((name) => skillKey(name) === key) ?? key,
  );

  const matchScore = Math.round(fraction * 100);

  return {
    id: opportunity.id,
    title: opportunity.title,
    summary: opportunity.summary,
    source: { ...opportunity.source },
    eligibility: opportunity.eligibility,
    requiredSkills: opportunity.requiredSkills,
    targetRoleIds: opportunity.targetRoleIds,
    matchScore,
    gapToEligibility,
    explanation: `You meet ${verifiedCount} of ${requiredKeys.length} required skills. Verify the remaining ${missingKeys.length} to qualify.`,
    matchExplanation: {
      satisfiedSkills,
      missingSkills: missingSkillNames,
      verifiedCount,
      requiredCount: requiredKeys.length,
      thresholdUsed: effectiveMinFraction,
      summary: `You meet ${verifiedCount} of ${requiredKeys.length} required skills. Verify the remaining ${missingKeys.length} to qualify.`,
    },
    addedDate: opportunity.addedDate ?? null,
    expiresAt: opportunity.expiresAt ?? null,
    isActive: opportunity.isActive ?? true,
  };
}

function resolveTargetRoleId(targetRole) {
  if (!targetRole || typeof targetRole !== 'string') return null;
  const trimmed = targetRole.trim().toLowerCase();
  return (
    CAREER_ROLES.find(
      (role) =>
        role.id.toLowerCase() === trimmed ||
        role.title.toLowerCase() === trimmed,
    )?.id ?? null
  );
}

function source() {
  return {
    type: OPPORTUNITY_SOURCE_TYPES.CURATED_INTERNAL,
    version: OPPORTUNITY_CATALOGUE_VERSION,
    asOf: SOURCE_AS_OF,
  };
}

function isCurrentSource(metadata) {
  return (
    metadata?.type === OPPORTUNITY_SOURCE_TYPES.CURATED_INTERNAL &&
    metadata.version === OPPORTUNITY_CATALOGUE_VERSION &&
    /^\d{4}-\d{2}-\d{2}$/.test(metadata.asOf ?? '')
  );
}

function validateCatalogue(catalogue) {
  if (!Array.isArray(catalogue)) {
    throw new Error('Opportunity catalogue must be an array.');
  }

  const ids = new Set();
  for (const opportunity of catalogue) {
    if (!opportunity?.id || ids.has(opportunity.id)) {
      throw new Error('Opportunity catalogue contains a duplicate or missing stable id.');
    }
    ids.add(opportunity.id);
  }
}