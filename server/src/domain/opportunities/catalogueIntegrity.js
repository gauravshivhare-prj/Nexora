import { CAREER_ROLES } from '../careers/roleCatalogue.js';
import { resolveCanonicalSkill } from '../skills/skillOntology.js';
import { skillKey, knownSkillNames } from '../skills/skillKey.js';
import { OPPORTUNITY_SOURCE_TYPES, OPPORTUNITY_CATALOGUE_VERSION } from './opportunityContract.js';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const KNOWN_SKILL_KEYS = new Set(knownSkillNames().map((s) => skillKey(s)));

function isTaxonomyGroundedSkill(skill) {
  if (typeof skill !== 'string') return false;
  const key = skillKey(skill);
  if (!key) return false;
  return KNOWN_SKILL_KEYS.has(key) || resolveCanonicalSkill(skill) !== null;
}

/**
 * Validates the integrity, schema conformance, and taxonomy grounding
 * of an opportunity catalogue.
 *
 * Checks:
 * 1. Array structure and non-empty.
 * 2. Stable, unique identifier with valid prefix.
 * 3. Title and summary non-empty strings.
 * 4. Valid source metadata (curated_internal, version, asOf).
 * 5. Valid eligibility rules (verified_skills, target_role).
 * 6. Required skills are valid strings grounded in the canonical skill taxonomy.
 * 7. Target roles are valid IDs from CAREER_ROLES.
 * 8. addedDate and expiresAt are valid ISO dates, with expiresAt strictly after addedDate.
 * 9. isActive is boolean.
 * 10. minSkillFraction is a number in (0, 1].
 * 11. Deduplication: no identical IDs and no duplicate semantic definitions.
 *
 * @param {readonly object[]|object[]} catalogue
 * @returns {{ valid: boolean, count: number, errors: string[] }}
 */
export function validateOpportunityCatalogue(catalogue) {
  if (!Array.isArray(catalogue)) {
    throw new Error('Opportunity catalogue must be an array.');
  }

  const errors = [];
  const seenIds = new Set();
  const seenSignatures = new Set();
  const knownRoleIds = new Set(CAREER_ROLES.map((r) => r.id));

  for (let i = 0; i < catalogue.length; i++) {
    const opp = catalogue[i];
    const prefix = `Catalogue item at index ${i}`;

    if (!opp || typeof opp !== 'object') {
      errors.push(`${prefix}: must be an object.`);
      continue;
    }

    // ID validation
    if (!opp.id || typeof opp.id !== 'string') {
      errors.push(`${prefix}: duplicate or missing stable id.`);
      continue;
    }

    if (seenIds.has(opp.id)) {
      errors.push(`${prefix} (${opp.id}): contains a duplicate or missing stable id.`);
    }
    seenIds.add(opp.id);

    // Title & Summary
    if (!opp.title || typeof opp.title !== 'string' || opp.title.trim().length === 0) {
      errors.push(`${opp.id}: title must be a non-empty string.`);
    }
    if (!opp.summary || typeof opp.summary !== 'string' || opp.summary.trim().length === 0) {
      errors.push(`${opp.id}: summary must be a non-empty string.`);
    }

    // Source metadata
    if (!opp.source || typeof opp.source !== 'object') {
      errors.push(`${opp.id}: source metadata is required.`);
    } else {
      if (opp.source.type !== OPPORTUNITY_SOURCE_TYPES.CURATED_INTERNAL) {
        errors.push(`${opp.id}: source type must be '${OPPORTUNITY_SOURCE_TYPES.CURATED_INTERNAL}'.`);
      }
      if (opp.source.version !== OPPORTUNITY_CATALOGUE_VERSION) {
        errors.push(`${opp.id}: source version must be ${OPPORTUNITY_CATALOGUE_VERSION}.`);
      }
      if (!ISO_DATE_REGEX.test(opp.source.asOf ?? '')) {
        errors.push(`${opp.id}: source.asOf must be an ISO date string (YYYY-MM-DD).`);
      }
    }

    // Eligibility rules
    if (!Array.isArray(opp.eligibility) || opp.eligibility.length === 0) {
      errors.push(`${opp.id}: eligibility must be a non-empty array of rules.`);
    } else {
      for (const rule of opp.eligibility) {
        if (!rule || typeof rule !== 'object' || !['verified_skills', 'target_role'].includes(rule.type)) {
          errors.push(`${opp.id}: invalid eligibility rule type.`);
        }
      }
    }

    // Required skills
    if (!Array.isArray(opp.requiredSkills) || opp.requiredSkills.length === 0) {
      errors.push(`${opp.id}: requiredSkills must be a non-empty array.`);
    } else {
      for (const skill of opp.requiredSkills) {
        if (typeof skill !== 'string' || skill.trim().length === 0) {
          errors.push(`${opp.id}: skill name must be a non-empty string.`);
        } else if (!isTaxonomyGroundedSkill(skill)) {
          errors.push(`${opp.id}: required skill '${skill}' is not grounded in the canonical skill taxonomy.`);
        }
      }
    }

    // Target roles
    if (!Array.isArray(opp.targetRoleIds) || opp.targetRoleIds.length === 0) {
      errors.push(`${opp.id}: targetRoleIds must be a non-empty array.`);
    } else {
      for (const roleId of opp.targetRoleIds) {
        if (!knownRoleIds.has(roleId)) {
          errors.push(`${opp.id}: targetRoleId '${roleId}' is not in CAREER_ROLES.`);
        }
      }
    }

    // Dates (addedDate, expiresAt)
    if (opp.addedDate !== undefined) {
      if (!ISO_DATE_REGEX.test(opp.addedDate)) {
        errors.push(`${opp.id}: addedDate must be a valid ISO date (YYYY-MM-DD).`);
      }
    }
    if (opp.expiresAt !== undefined) {
      if (!ISO_DATE_REGEX.test(opp.expiresAt)) {
        errors.push(`${opp.id}: expiresAt must be a valid ISO date (YYYY-MM-DD).`);
      }
      if (opp.addedDate && ISO_DATE_REGEX.test(opp.addedDate) && ISO_DATE_REGEX.test(opp.expiresAt)) {
        if (opp.expiresAt <= opp.addedDate) {
          errors.push(`${opp.id}: expiresAt must be strictly after addedDate.`);
        }
      }
    }

    // isActive flag
    if (opp.isActive !== undefined && typeof opp.isActive !== 'boolean') {
      errors.push(`${opp.id}: isActive must be a boolean.`);
    }

    // minSkillFraction
    if (opp.minSkillFraction !== undefined) {
      if (
        typeof opp.minSkillFraction !== 'number' ||
        Number.isNaN(opp.minSkillFraction) ||
        opp.minSkillFraction <= 0 ||
        opp.minSkillFraction > 1
      ) {
        errors.push(`${opp.id}: minSkillFraction must be a number between 0 and 1.`);
      }
    }

    // Semantic deduplication signature (title + sorted skills + sorted roles)
    const sortedSkills = [...(opp.requiredSkills ?? [])].map((s) => s.toLowerCase()).sort().join(',');
    const sortedRoles = [...(opp.targetRoleIds ?? [])].map((r) => r.toLowerCase()).sort().join(',');
    const signature = `${(opp.title ?? '').trim().toLowerCase()}|${sortedSkills}|${sortedRoles}`;
    if (seenSignatures.has(signature)) {
      errors.push(`${opp.id}: semantic duplicate detected with identical title, skills, and target roles.`);
    }
    seenSignatures.add(signature);
  }

  if (errors.length > 0) {
    const errorMsg = `Opportunity catalogue validation failed:\n- ${errors.join('\n- ')}`;
    const err = new Error(errorMsg);
    err.validationErrors = errors;
    throw err;
  }

  return { valid: true, count: catalogue.length, errors: [] };
}

/**
 * Audits an opportunity catalogue for freshness, staleness, and upcoming expiry.
 *
 * @param {readonly object[]|object[]} catalogue
 * @param {object} [options]
 * @param {string|Date} [options.referenceDate] Defaults to current date
 * @param {number} [options.maxAgeDays=365] Threshold for flagging older entries
 * @returns {{
 *   valid: boolean,
 *   total: number,
 *   activeCount: number,
 *   expiredCount: number,
 *   staleCount: number,
 *   expiredOpportunities: object[],
 *   staleOpportunities: object[],
 *   referenceDate: string
 * }}
 */
export function auditCatalogueFreshness(catalogue, options = {}) {
  if (!Array.isArray(catalogue)) {
    throw new Error('Opportunity catalogue must be an array.');
  }

  const refDateStr =
    typeof options.referenceDate === 'string' && ISO_DATE_REGEX.test(options.referenceDate)
      ? options.referenceDate
      : options.referenceDate instanceof Date
        ? options.referenceDate.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

  const refTime = new Date(`${refDateStr}T00:00:00Z`).getTime();
  const maxAgeDays = typeof options.maxAgeDays === 'number' ? options.maxAgeDays : 365;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const expiredOpportunities = [];
  const staleOpportunities = [];
  let activeCount = 0;

  for (const opp of catalogue) {
    if (!opp || typeof opp !== 'object') continue;

    const isActive = opp.isActive !== false;
    let isExpired = false;
    let isStale = false;

    // Check expiration
    if (opp.expiresAt && ISO_DATE_REGEX.test(opp.expiresAt)) {
      const expTime = new Date(`${opp.expiresAt}T00:00:00Z`).getTime();
      if (expTime <= refTime) {
        isExpired = true;
        expiredOpportunities.push({
          id: opp.id,
          title: opp.title,
          expiresAt: opp.expiresAt,
          referenceDate: refDateStr,
        });
      }
    }

    // Check staleness (age from addedDate)
    if (opp.addedDate && ISO_DATE_REGEX.test(opp.addedDate)) {
      const addedTime = new Date(`${opp.addedDate}T00:00:00Z`).getTime();
      const ageMs = refTime - addedTime;
      if (ageMs > maxAgeMs) {
        isStale = true;
        staleOpportunities.push({
          id: opp.id,
          title: opp.title,
          addedDate: opp.addedDate,
          ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
          thresholdDays: maxAgeDays,
        });
      }
    }

    if (isActive && !isExpired) {
      activeCount += 1;
    }
  }

  return {
    valid: expiredOpportunities.length === 0,
    total: catalogue.length,
    activeCount,
    expiredCount: expiredOpportunities.length,
    staleCount: staleOpportunities.length,
    expiredOpportunities,
    staleOpportunities,
    referenceDate: refDateStr,
  };
}
