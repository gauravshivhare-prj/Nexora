import { findRole, getAuthoritativeRoles } from './roleCatalogue.js';
import { bandFor } from './scoring.js';
import { skillKey } from '../skills/skillKey.js';
import { resolveCanonicalSkill } from '../skills/skillOntology.js';

/**
 * Task 09 — Career Recommendation Validation & Anti-Hallucination Layer
 *
 * Provides an independent verification layer that audits career recommendations and
 * AI proposals against the student's canonical CareerTwin evidence and authoritative role specifications.
 *
 * Rules Enforced:
 * 1. Grounded Skill Verification: Every claimed match must exist in CareerTwin.
 * 2. Evidence Strength Alignment: Claimed strength cannot exceed CareerTwin truth.
 * 3. Prerequisite Defense: Rejects or downgrades proposals where foundational prerequisites are absent.
 * 4. Authoritative Catalogue Boundary: Rejects uncurated, unpromoted, or deprecated roles.
 */

export const VALIDATION_CODES = Object.freeze({
  GROUNDED: 'GROUNDED',
  UNGROUNDED_SKILL: 'UNGROUNDED_SKILL',
  EVIDENCE_EXAGGERATION: 'EVIDENCE_EXAGGERATION',
  PREREQUISITE_DEFICIT: 'PREREQUISITE_DEFICIT',
  UNAUTHORITATIVE_ROLE: 'UNAUTHORITATIVE_ROLE',
  DOWNGRADED: 'DOWNGRADED',
  REJECTED: 'REJECTED',
});

/**
 * Checks if held skills satisfy a prerequisite ID.
 */
export function satisfiesPrerequisite(prereqId, heldSkillsMap) {
  if (!prereqId) return true;
  const normKey = prereqId.replace(/^sk_/, '');

  for (const s of heldSkillsMap.values()) {
    if (s.skillId === prereqId || s.key === normKey) return true;
    const resolved = resolveCanonicalSkill(s.key || s.name);
    if (resolved && resolved.id === prereqId) return true;
  }

  // Domain knowledge: programming fundamentals is satisfied by programming languages or dependent tech
  if (prereqId === 'sk_programming_fundamentals') {
    for (const s of heldSkillsMap.values()) {
      const resolved = resolveCanonicalSkill(s.key || s.name);
      if (resolved) {
        if (resolved.category === 'programming_languages') return true;
        if (resolved.prerequisites?.includes('sk_programming_fundamentals')) return true;
      }
    }
  }

  return false;
}

/**
 * Audits a single role match or proposal against the student's CareerTwin.
 *
 * @param {object} match Computed or proposed role match
 * @param {object} twin Canonical CareerTwin content
 * @param {Array<object>} [roleCatalogue] Controlled role knowledge base
 * @returns {{
 *   isValid: boolean,
 *   action: 'accepted'|'downgraded'|'rejected',
 *   validatedMatch: object|null,
 *   rejectionReasons: string[],
 *   warnings: string[],
 *   audit: {
 *     originalScore: number,
 *     finalScore: number,
 *     downgradePenalty: number,
 *     unsupportedSkills: string[],
 *     missingPrerequisites: string[],
 *   }
 * }}
 */
export function validateRecommendation(match, twin, roleCatalogue = null) {
  const warnings = [];
  const rejectionReasons = [];
  const unsupportedSkills = [];
  const missingPrerequisites = [];

  if (!match || typeof match !== 'object') {
    return {
      isValid: false,
      action: 'rejected',
      validatedMatch: null,
      rejectionReasons: ['Invalid recommendation payload'],
      warnings: [],
      audit: { originalScore: 0, finalScore: 0, downgradePenalty: 0, unsupportedSkills: [], missingPrerequisites: [] },
    };
  }

  // 1. Authoritative Role Verification
  const roleId = match.roleId || match.id;
  const role = findRole(roleId);

  if (!role) {
    rejectionReasons.push(`Role "${roleId}" does not exist in the authoritative catalogue`);
    return {
      isValid: false,
      action: 'rejected',
      validatedMatch: null,
      rejectionReasons,
      warnings,
      audit: { originalScore: match.score || 0, finalScore: 0, downgradePenalty: match.score || 0, unsupportedSkills: [], missingPrerequisites: [] },
    };
  }

  if (role.metadata?.status && role.metadata.status !== 'active') {
    rejectionReasons.push(`Role "${role.title}" has status "${role.metadata.status}" and is not approved for recommendations`);
    return {
      isValid: false,
      action: 'rejected',
      validatedMatch: null,
      rejectionReasons,
      warnings,
      audit: { originalScore: match.score || 0, finalScore: 0, downgradePenalty: match.score || 0, unsupportedSkills: [], missingPrerequisites: [] },
    };
  }

  // 2. Build index of student's actual CareerTwin skills
  const heldSkillsByKey = new Map();
  for (const s of twin?.skills ?? []) {
    const key = skillKey(s.key || s.name);
    if (key) {
      heldSkillsByKey.set(key, s);
    }
  }

  // 3. Grounded Skill Verification (Anti-Hallucination)
  const allClaimedMatches = [
    ...(match.matchedRequired || []),
    ...(match.matchedPreferred || []),
  ];

  for (const claimed of allClaimedMatches) {
    const skillName =
      typeof claimed === 'string'
        ? claimed
        : typeof claimed?.skill === 'string'
        ? claimed.skill
        : claimed?.skill?.name || claimed?.yourSkill || claimed?.name || '';
    const key = skillKey(skillName);
    const actualHeld = heldSkillsByKey.get(key);

    if (!actualHeld) {
      unsupportedSkills.push(skillName || 'unknown');
      warnings.push(`Claimed skill "${skillName}" is absent from student CareerTwin`);
    } else {
      const strength =
        typeof claimed === 'object'
          ? claimed.strength || claimed.skill?.strength
          : undefined;
      if (strength) {
        // Evidence Strength Invariant Check
        const strengthOrder = ['claimed', 'supported', 'verified'];
        const claimedRank = strengthOrder.indexOf(strength);
        const actualRank = strengthOrder.indexOf(actualHeld.strength);
        if (claimedRank > actualRank) {
          warnings.push(`Claimed strength "${strength}" for "${skillName}" exceeds actual strength "${actualHeld.strength}"`);
        }
      }
    }
  }

  // If more than 50% of claimed skills are completely hallucinated, reject proposal
  if (allClaimedMatches.length > 0 && unsupportedSkills.length > allClaimedMatches.length / 2) {
    rejectionReasons.push(`Proposal rejected: ${unsupportedSkills.length}/${allClaimedMatches.length} skills are ungrounded hallucinations`);
    return {
      isValid: false,
      action: 'rejected',
      validatedMatch: null,
      rejectionReasons,
      warnings,
      audit: { originalScore: match.score || 0, finalScore: 0, downgradePenalty: match.score || 0, unsupportedSkills, missingPrerequisites: [] },
    };
  }

  // 4. Prerequisite Competency Validation
  let prerequisiteDowngrade = 0;
  for (const prereqId of role.prerequisites || []) {
    if (!satisfiesPrerequisite(prereqId, heldSkillsByKey)) {
      missingPrerequisites.push(prereqId);
    }
  }

  if (missingPrerequisites.length > 0) {
    // Missing essential prerequisites incurs an explicit downgrade penalty
    prerequisiteDowngrade = Math.min(20, missingPrerequisites.length * 10);
    warnings.push(`Missing ${missingPrerequisites.length} foundational prerequisite(s): ${missingPrerequisites.join(', ')}`);
  }

  // Also penalize for unsupported skills that were hallucinated
  const hallucinationPenalty = unsupportedSkills.length * 15;
  const totalDowngrade = prerequisiteDowngrade + hallucinationPenalty;

  const originalScore = typeof match.score === 'number' ? match.score : 0;
  const finalScore = Math.max(0, originalScore - totalDowngrade);
  const action = totalDowngrade > 0 ? 'downgraded' : 'accepted';
  const newBand = bandFor(finalScore);

  const validatedMatch = {
    ...match,
    score: finalScore,
    band: newBand.label,
    bandDescription: newBand.description,
    validation: {
      status: action === 'downgraded' ? VALIDATION_CODES.DOWNGRADED : VALIDATION_CODES.GROUNDED,
      isGrounded: unsupportedSkills.length === 0,
      unsupportedSkills,
      missingPrerequisites,
      originalScore,
      downgradePenalty: totalDowngrade,
      auditNotes: warnings,
    },
  };

  return {
    isValid: true,
    action,
    validatedMatch,
    rejectionReasons: [],
    warnings,
    audit: {
      originalScore,
      finalScore,
      downgradePenalty: totalDowngrade,
      unsupportedSkills,
      missingPrerequisites,
    },
  };
}

/**
 * Validates a list of recommendation proposals, rejecting hallucinated/unauthoritative ones
 * and applying necessary downgrades.
 *
 * @param {Array<object>} matches
 * @param {object} twin
 * @returns {Array<object>} Validated and ground-checked matches
 */
export function validateRecommendationsList(matches, twin) {
  const result = [];
  for (const match of matches || []) {
    const outcome = validateRecommendation(match, twin);
    if (outcome.isValid && outcome.validatedMatch) {
      result.push(outcome.validatedMatch);
    }
  }
  return result;
}
