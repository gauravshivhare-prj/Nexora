/**
 * Gemini Intelligence Architecture & AI Boundary Redesign (Task 13)
 *
 * Formally defines every AI/Gemini interaction in Nexora:
 * - Specific purpose and explicit authority tier (Generation vs Decision separation)
 * - Input contracts and sanitization requirements
 * - Output schemas and bounds
 * - Context token and character limits
 * - Deterministic failure policies
 * - Strict prohibitions against establishing ground truth or bypassing domain gates
 * - Versioned prompt and contract contracts for auditability and model upgrades
 */

export const AI_AUTHORITY_TIER = Object.freeze({
  EXTRACTION_CLAIMED: 'EXTRACTION_CLAIMED',
  ADVISORY_EVALUATION: 'ADVISORY_EVALUATION',
  PRESENTATION_ONLY: 'PRESENTATION_ONLY',
  PROPOSAL_ONLY: 'PROPOSAL_ONLY',
});

export const AI_CONTRACT_ID = Object.freeze({
  RESUME_EXTRACTION: 'ai_contract_resume_extraction',
  INTERVIEW_EVALUATION: 'ai_contract_interview_evaluation',
  CAREERTWIN_NARRATIVE: 'ai_contract_careertwin_narrative',
  ROLE_PROPOSAL: 'ai_contract_role_proposal',
});

export const AI_FAILURE_POLICY = Object.freeze({
  REJECT_WITH_502: 'REJECT_WITH_502',
  SAFE_SERVICE_UNAVAILABLE: 'SAFE_SERVICE_UNAVAILABLE',
  OMIT_PRESENTATION: 'OMIT_PRESENTATION',
  REJECT_PROPOSAL: 'REJECT_PROPOSAL',
});

/**
 * Immutable Registry of all authorized AI Contracts across Nexora.
 */
export const AI_CONTRACT_REGISTRY = Object.freeze({
  [AI_CONTRACT_ID.RESUME_EXTRACTION]: Object.freeze({
    id: AI_CONTRACT_ID.RESUME_EXTRACTION,
    name: 'Resume Information Extraction',
    version: '2.1.0',
    purpose: 'Extract candidate stated education, projects, experience, and skills from unverified uploaded resume text.',
    authorityTier: AI_AUTHORITY_TIER.EXTRACTION_CLAIMED,
    canEstablishTruth: false,
    contextLimits: Object.freeze({
      maxInputChars: 100_000,
      maxOutputTokens: 4096,
      timeoutMs: 30_000,
    }),
    inputContract: Object.freeze({
      expectedFields: ['resumeText'],
      sanitization: 'Prompt-injection guarded, XML-escaped via sanitizePromptInput, sandwich defense.',
      untrustedWrapperTag: 'untrusted_resume_text',
    }),
    outputSchema: Object.freeze({
      type: 'object',
      requiredKeys: ['basics', 'education', 'skills', 'projects', 'experience', 'certifications', 'achievements'],
      maxSkillsCount: 100,
    }),
    failurePolicy: AI_FAILURE_POLICY.REJECT_WITH_502,
    allowedDownstreamUsage: Object.freeze([
      'evidence_engine:create_claimed_evidence',
      'resume_pipeline:store_parsed_data',
    ]),
    forbiddenDownstreamUsage: Object.freeze([
      'direct_verification_promotion',
      'bypass_grounding_check',
      'invent_unmentioned_competency',
      'assign_proficiency_tier',
      'bypass_canonical_taxonomy',
    ]),
  }),

  [AI_CONTRACT_ID.INTERVIEW_EVALUATION]: Object.freeze({
    id: AI_CONTRACT_ID.INTERVIEW_EVALUATION,
    name: 'Mock Interview Technical Evaluation',
    version: '2.0.0',
    purpose: 'Analyze candidate verbal or written responses against question rubrics for conceptual understanding and practical reasoning.',
    authorityTier: AI_AUTHORITY_TIER.ADVISORY_EVALUATION,
    canEstablishTruth: false,
    contextLimits: Object.freeze({
      maxInputChars: 15_000,
      maxOutputTokens: 1024,
      timeoutMs: 15_000,
    }),
    inputContract: Object.freeze({
      expectedFields: ['question', 'answerText', 'targetSkill'],
      sanitization: 'Full control-character stripping, prompt-injection guarded, sandwich defense.',
      untrustedWrapperTag: 'candidate_untrusted_answer',
    }),
    outputSchema: Object.freeze({
      type: 'object',
      requiredKeys: ['dimensions', 'overallScore', 'feedback', 'strengths', 'growthAreas'],
      dimensionScoreRange: [0.0, 1.0],
    }),
    failurePolicy: AI_FAILURE_POLICY.SAFE_SERVICE_UNAVAILABLE,
    allowedDownstreamUsage: Object.freeze([
      'evidence_engine:ai_interview_advisory_evidence',
      'interview_session:record_feedback',
    ]),
    forbiddenDownstreamUsage: Object.freeze([
      'overwrite_assessment_mcq_score',
      'certify_seniority_without_human_review',
      'grant_verified_competency_tier_alone',
      'alter_target_role_requirements',
    ]),
  }),

  [AI_CONTRACT_ID.CAREERTWIN_NARRATIVE]: Object.freeze({
    id: AI_CONTRACT_ID.CAREERTWIN_NARRATIVE,
    name: 'CareerTwin Summary Narrative',
    version: '2.0.0',
    purpose: 'Synthesize a human-readable 2-3 sentence introductory narrative summarizing deterministic CareerTwin data.',
    authorityTier: AI_AUTHORITY_TIER.PRESENTATION_ONLY,
    canEstablishTruth: false,
    contextLimits: Object.freeze({
      maxInputChars: 5_000,
      maxOutputTokens: 500,
      timeoutMs: 10_000,
    }),
    inputContract: Object.freeze({
      expectedFields: ['twin'],
      sanitization: 'Strict PII omission (no name, email, phone, or raw resume). Only deterministic metrics.',
      untrustedWrapperTag: 'twin_profile_context',
    }),
    outputSchema: Object.freeze({
      type: 'object',
      requiredKeys: ['summary'],
      maxSummaryChars: 1200,
    }),
    failurePolicy: AI_FAILURE_POLICY.OMIT_PRESENTATION,
    allowedDownstreamUsage: Object.freeze([
      'frontend_ui:display_profile_narrative',
    ]),
    forbiddenDownstreamUsage: Object.freeze([
      'career_matching_influence',
      'skill_gap_computation',
      'roadmap_generation_influence',
      'readiness_score_influence',
      'feed_downstream_decision_engines',
    ]),
  }),

  [AI_CONTRACT_ID.ROLE_PROPOSAL]: Object.freeze({
    id: AI_CONTRACT_ID.ROLE_PROPOSAL,
    name: 'AI Emerging Role Proposal',
    version: '1.1.0',
    purpose: 'Draft emerging technology and job role competency requirements for administrative editorial review.',
    authorityTier: AI_AUTHORITY_TIER.PROPOSAL_ONLY,
    canEstablishTruth: false,
    contextLimits: Object.freeze({
      maxInputChars: 2_000,
      maxOutputTokens: 2048,
      timeoutMs: 20_000,
    }),
    inputContract: Object.freeze({
      expectedFields: ['roleName', 'category'],
      sanitization: 'Prompt sanitizer.',
      untrustedWrapperTag: 'proposed_role_context',
    }),
    outputSchema: Object.freeze({
      type: 'object',
      requiredKeys: ['title', 'category', 'description', 'competencies'],
    }),
    failurePolicy: AI_FAILURE_POLICY.REJECT_PROPOSAL,
    allowedDownstreamUsage: Object.freeze([
      'role_catalogue:admin_draft_proposal',
    ]),
    forbiddenDownstreamUsage: Object.freeze([
      'automatic_role_catalogue_publication',
      'career_recommendation_intake_without_editorial_approval',
      'student_readiness_calculation_without_review',
    ]),
  }),
});

/**
 * Retrieves the formal AI contract specification by contract ID.
 *
 * @param {string} contractId
 * @returns {object} The frozen AI contract
 */
export function getAiContract(contractId) {
  const contract = AI_CONTRACT_REGISTRY[contractId];
  if (!contract) {
    throw new Error(`Unrecognized AI Contract ID "${contractId}". Every AI invocation must adhere to a formal contract.`);
  }
  return contract;
}

/**
 * Returns an inventory listing of all defined AI contracts with boundaries.
 *
 * @returns {Array<object>}
 */
export function getAiContractInventory() {
  return Object.values(AI_CONTRACT_REGISTRY);
}

/**
 * Enforces authority boundaries on AI outputs.
 *
 * Verifies that the attempted downstream operation is strictly permitted
 * and not in the forbidden set for this contract.
 *
 * @param {string} contractId
 * @param {string} attemptedAction
 * @throws {Error} If the attempted action violates domain security boundaries
 */
export function assertAiBoundary(contractId, attemptedAction) {
  const contract = getAiContract(contractId);

  // Absolute invariant: No AI call in Nexora may directly establish ground truth
  if (attemptedAction === 'establish_canonical_truth') {
    throw new Error(
      `AI Boundary Violation: AI contract "${contract.name}" (${contract.id}) is forbidden from establishing ground truth. Only deterministic domain engines and verified human inputs establish canonical truth.`,
    );
  }

  if (contract.forbiddenDownstreamUsage.includes(attemptedAction)) {
    throw new Error(
      `AI Boundary Violation: Action "${attemptedAction}" is strictly forbidden for AI contract "${contract.name}" (${contract.id}) under tier ${contract.authorityTier}.`,
    );
  }

  return true;
}
