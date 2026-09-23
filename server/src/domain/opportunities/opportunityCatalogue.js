import { EVIDENCE_STRENGTH } from '../evidence/evidence.js';
import { CAREER_ROLES } from '../careers/roleCatalogue.js';
import { skillKey } from '../skills/skillKey.js';
import {
  OPPORTUNITY_CATALOGUE_VERSION,
  OPPORTUNITY_SOURCE_TYPES,
} from './opportunityContract.js';

const SOURCE_AS_OF = '2026-09-23';

/**
 * Small internal catalogue. These are practice opportunities, not live jobs.
 * IDs are stable and must never be reused for a different record.
 */
export const OPPORTUNITY_CATALOGUE = Object.freeze([
  Object.freeze({
    id: 'curated_internal:backend-apprenticeship',
    title: 'Backend apprenticeship',
    summary: 'A practice opportunity for building server-side applications.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['JavaScript', 'Node.js'] },
      { type: 'target_role', roleIds: ['backend-developer'] },
    ],
    requiredSkills: ['JavaScript', 'Node.js'],
    targetRoleIds: ['backend-developer'],
  }),
  Object.freeze({
    id: 'curated_internal:frontend-apprenticeship',
    title: 'Frontend apprenticeship',
    summary: 'A practice opportunity for building accessible browser interfaces.',
    source: source(),
    eligibility: [
      { type: 'verified_skills', skills: ['HTML', 'CSS', 'JavaScript'] },
      { type: 'target_role', roleIds: ['frontend-developer'] },
    ],
    requiredSkills: ['HTML', 'CSS', 'JavaScript'],
    targetRoleIds: ['frontend-developer'],
  }),
]);

/**
 * Matches opportunities with all explicit eligibility rules satisfied.
 *
 * Invalid, duplicated, or stale records are rejected before matching. This is
 * intentionally strict: an unsupported catalogue item must not leak into a
 * student's result merely because one field happened to match.
 */
export function matchOpportunities(
  twin,
  profile,
  catalogue = OPPORTUNITY_CATALOGUE,
) {
  validateCatalogue(catalogue);

  const verifiedSkills = new Set(
    (twin?.skills ?? [])
      .filter((skill) => skill.strength === EVIDENCE_STRENGTH.VERIFIED)
      .map((skill) => skill.key ?? skillKey(skill.name)),
  );
  const targetRoleId = resolveTargetRoleId(profile?.career?.targetRole);

  return catalogue
    .filter((opportunity) => isCurrentSource(opportunity.source))
    .map((opportunity) => matchOne(opportunity, verifiedSkills, targetRoleId))
    .filter(Boolean);
}

function matchOne(opportunity, verifiedSkills, targetRoleId) {
  const matchedEligibility = [];

  for (const rule of opportunity.eligibility) {
    if (rule.type === 'verified_skills') {
      const skills = rule.skills.map((name) => skillKey(name));
      if (!skills.every((key) => verifiedSkills.has(key))) return null;
      matchedEligibility.push({ type: rule.type, skills: rule.skills });
    } else if (rule.type === 'target_role') {
      if (!targetRoleId || !rule.roleIds.includes(targetRoleId)) return null;
      matchedEligibility.push({ type: rule.type, roleIds: rule.roleIds });
    } else {
      return null;
    }
  }

  return {
    id: opportunity.id,
    title: opportunity.title,
    summary: opportunity.summary,
    source: { ...opportunity.source },
    eligibility: opportunity.eligibility,
    requiredSkills: opportunity.requiredSkills,
    targetRoleIds: opportunity.targetRoleIds,
    matchedEligibility,
    explanation: 'All listed eligibility rules are satisfied by verified evidence and profile data.',
  };
}

function resolveTargetRoleId(targetRole) {
  if (!targetRole) return null;
  return CAREER_ROLES.find((role) => role.title.toLowerCase() === targetRole.toLowerCase())?.id ?? null;
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
  const ids = new Set();
  for (const opportunity of catalogue) {
    if (!opportunity?.id || ids.has(opportunity.id)) {
      throw new Error('Opportunity catalogue contains a duplicate or missing stable id.');
    }
    ids.add(opportunity.id);
  }
}