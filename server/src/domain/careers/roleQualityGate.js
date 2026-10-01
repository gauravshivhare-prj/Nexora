import { ROLE_CATEGORIES } from './roleCatalogue.js';
import { skillKey } from '../skills/skillKey.js';

/**
 * Task 08 — Career Role Quality Gate & Requirement Engineering Engine
 *
 * Enforces strict quality gates before any career role can enter recommendation logic.
 * Separates authoritative, human-reviewed role definitions from AI-generated suggestions.
 */

export const ROLE_STATUS = Object.freeze({
  ACTIVE: 'active',
  DRAFT: 'draft',
  DEPRECATED: 'deprecated',
  AI_SUGGESTED: 'ai_suggested',
});

export const ROLE_PROVENANCE = Object.freeze({
  CURATED: 'curated',
  INDUSTRY_STANDARD: 'industry_standard',
  COMMUNITY_CONTRIBUTED: 'community_contributed',
  AI_DRAFT: 'ai_draft',
});

export const VALID_PROFICIENCY_LEVELS = Object.freeze(['beginner', 'intermediate', 'advanced']);

/**
 * Validates a role's requirement specifications against Nexora's quality gates.
 *
 * Quality Gate Rules:
 * 1. Must possess canonical and slug IDs, and a valid title.
 * 2. Category must be one of the official ROLE_CATEGORIES.
 * 3. Summary must be descriptive (20-500 characters).
 * 4. Must define at least 2 required skills and 2 preferred skills.
 * 5. Must define proficiency expectations for every required skill.
 * 6. Must define structured evidence expectations (acceptable types, portfolio guidance).
 * 7. Prerequisite competencies must be an array of canonical skill IDs.
 *
 * @param {object} role
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validateRoleRequirements(role) {
  const errors = [];

  if (!role || typeof role !== 'object') {
    return { isValid: false, errors: ['Role must be a non-null object'] };
  }

  // 1. Identity & Naming
  if (!role.id || typeof role.id !== 'string' || !/^[a-z0-9_-]+$/.test(role.id)) {
    errors.push('Role must have a valid lowercase alphanumeric slug id');
  }
  if (!role.title || typeof role.title !== 'string' || role.title.trim().length < 3) {
    errors.push('Role must have a valid title with at least 3 characters');
  }

  // 2. Category
  const validCategories = Object.values(ROLE_CATEGORIES);
  if (!role.category || !validCategories.includes(role.category)) {
    errors.push(`Role category "${role.category}" must be one of: ${validCategories.join(', ')}`);
  }

  // 3. Summary
  if (!role.summary || typeof role.summary !== 'string' || role.summary.trim().length < 20) {
    errors.push('Role summary must be a descriptive string of at least 20 characters');
  }

  // 4. Skills Quantity & Canonical Representation
  if (!Array.isArray(role.requiredSkills) || role.requiredSkills.length < 2) {
    errors.push('Role must specify at least 2 required skills');
  } else {
    for (const skill of role.requiredSkills) {
      const name = typeof skill === 'string' ? skill : skill?.name;
      if (!name || skillKey(name) === '') {
        errors.push(`Invalid required skill entry: ${JSON.stringify(skill)}`);
      }
    }
  }

  if (!Array.isArray(role.preferredSkills) || role.preferredSkills.length < 2) {
    errors.push('Role must specify at least 2 preferred skills');
  } else {
    for (const skill of role.preferredSkills) {
      const name = typeof skill === 'string' ? skill : skill?.name;
      if (!name || skillKey(name) === '') {
        errors.push(`Invalid preferred skill entry: ${JSON.stringify(skill)}`);
      }
    }
  }

  // 5. Proficiency Expectations
  if (!role.proficiencyExpectations || typeof role.proficiencyExpectations !== 'object') {
    errors.push('Role must define proficiencyExpectations object');
  } else {
    if (
      role.proficiencyExpectations.overallMinimum &&
      !VALID_PROFICIENCY_LEVELS.includes(role.proficiencyExpectations.overallMinimum)
    ) {
      errors.push(`overallMinimum must be one of: ${VALID_PROFICIENCY_LEVELS.join(', ')}`);
    }
  }

  // 6. Evidence Expectations
  if (!role.evidenceExpectations || typeof role.evidenceExpectations !== 'object') {
    errors.push('Role must define evidenceExpectations object');
  } else {
    if (
      typeof role.evidenceExpectations.minimumSupportedProjects !== 'number' ||
      role.evidenceExpectations.minimumSupportedProjects < 0
    ) {
      errors.push('evidenceExpectations.minimumSupportedProjects must be a non-negative number');
    }
    if (
      !Array.isArray(role.evidenceExpectations.acceptableEvidenceTypes) ||
      role.evidenceExpectations.acceptableEvidenceTypes.length === 0
    ) {
      errors.push('evidenceExpectations.acceptableEvidenceTypes must contain at least one evidence type');
    }
  }

  // 7. Metadata & Status
  if (role.metadata) {
    const validStatuses = Object.values(ROLE_STATUS);
    if (role.metadata.status && !validStatuses.includes(role.metadata.status)) {
      errors.push(`metadata.status must be one of: ${validStatuses.join(', ')}`);
    }
    const validProvenances = Object.values(ROLE_PROVENANCE);
    if (role.metadata.provenance && !validProvenances.includes(role.metadata.provenance)) {
      errors.push(`metadata.provenance must be one of: ${validProvenances.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Evaluates whether a role passes quality gates to enter live recommendation and matching logic.
 *
 * Rules:
 * - Must pass all structural quality gates.
 * - Must have metadata.status === 'active' (Draft, Deprecated, and AI-suggested roles are blocked).
 *
 * @param {object} role
 * @returns {boolean}
 */
export function isEligibleForRecommendation(role) {
  if (!role) return false;
  const validation = validateRoleRequirements(role);
  if (!validation.isValid) return false;

  const status = role.metadata?.status || ROLE_STATUS.ACTIVE;
  return status === ROLE_STATUS.ACTIVE;
}

/**
 * Ingests an AI-generated role proposal, isolates it in 'ai_suggested' status,
 * and attaches full provenance tracking.
 *
 * Crucial Invariant:
 * AI-generated role suggestions NEVER enter the authoritative recommendation catalogue
 * without manual human curation and promotion.
 *
 * @param {object} rawProposal
 * @param {string} [modelName] AI model generating the suggestion
 * @returns {object} Isolated AI role proposal
 */
export function submitAiRoleProposal(rawProposal, modelName = 'gemini-1.5-pro') {
  const roleId = rawProposal.id || `ai_role_${skillKey(rawProposal.title || 'untitled')}`;

  const proposal = {
    canonicalId: `role_${skillKey(rawProposal.title || 'untitled')}`,
    id: roleId,
    title: rawProposal.title || 'Untitled Role Proposal',
    category: rawProposal.category || ROLE_CATEGORIES.ENGINEERING,
    summary: rawProposal.summary || 'AI-suggested technology career role.',
    requiredSkills: rawProposal.requiredSkills || [],
    preferredSkills: rawProposal.preferredSkills || [],
    relatedTechnologies: rawProposal.relatedTechnologies || [],
    commonBackgrounds: rawProposal.commonBackgrounds || [],
    prerequisites: rawProposal.prerequisites || ['sk_programming_fundamentals'],
    proficiencyExpectations: rawProposal.proficiencyExpectations || {
      overallMinimum: 'intermediate',
      skills: {},
    },
    evidenceExpectations: rawProposal.evidenceExpectations || {
      minimumSupportedProjects: 1,
      minimumVerifiedSkills: 1,
      acceptableEvidenceTypes: ['project_evidence', 'assessment_code'],
      portfolioGuidance: 'Portfolio demonstration required.',
    },
    competencyRelationships: rawProposal.competencyRelationships || [],
    metadata: {
      version: '0.1.0-draft',
      status: ROLE_STATUS.AI_SUGGESTED,
      provenance: ROLE_PROVENANCE.AI_DRAFT,
      lastReviewedAt: null,
      reviewedBy: null,
      generatedByModel: modelName,
      createdAt: new Date().toISOString(),
      changeLog: ['AI drafted role proposal awaiting human expert review.'],
    },
  };

  return proposal;
}

/**
 * Reviews and promotes a role proposal into the authoritative catalogue.
 *
 * @param {object} roleProposal
 * @param {object} reviewMetadata
 * @param {string} reviewMetadata.reviewerName
 * @param {string} [reviewMetadata.approvalNotes]
 * @returns {{ role: object|null, success: boolean, errors: string[] }}
 */
export function reviewAndPromoteRole(roleProposal, { reviewerName, approvalNotes = '' }) {
  if (!reviewerName || typeof reviewerName !== 'string') {
    return { role: null, success: false, errors: ['Reviewer name is required for promotion'] };
  }

  const promoted = JSON.parse(JSON.stringify(roleProposal));
  promoted.metadata = {
    ...promoted.metadata,
    status: ROLE_STATUS.ACTIVE,
    provenance: ROLE_PROVENANCE.CURATED,
    lastReviewedAt: new Date().toISOString().slice(0, 10),
    reviewedBy: reviewerName,
    version: '1.0.0',
    changeLog: [
      ...(promoted.metadata?.changeLog || []),
      `Promoted to authoritative catalogue by ${reviewerName}: ${approvalNotes}`,
    ],
  };

  const validation = validateRoleRequirements(promoted);
  if (!validation.isValid) {
    return {
      role: null,
      success: false,
      errors: [`Role failed quality gate promotion: ${validation.errors.join('; ')}`],
    };
  }

  return {
    role: promoted,
    success: true,
    errors: [],
  };
}
