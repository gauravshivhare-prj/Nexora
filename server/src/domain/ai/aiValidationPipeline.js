/**
 * Reusable Multi-Stage AI Output Validation Pipeline (Task 14)
 *
 * Implements the standard 6-stage validation pipeline for all Gemini/AI outputs:
 *  1. JSON / Syntactic parsing & bounds check (aiJson)
 *  2. Schema, type & numeric range verification
 *  3. Domain & canonical taxonomy validation (ontology)
 *  4. Grounding & evidence verification (source text span matching)
 *  5. Prerequisite & dependency graph validation (DAG compliance)
 *  6. Consistency, contradiction & anti-injection safety audit
 */

import { parseJsonObject } from '../../services/ai/aiJson.js';
import { getAiContract, AI_CONTRACT_ID, AI_FAILURE_POLICY } from './aiContracts.js';
import { resolveCanonicalSkill } from '../skills/skillOntology.js';
import { isForbiddenOrPrototypeKey } from '../interview/interviewContract.js';
import { hasInjectionContent } from '../interview/interviewEvaluationSchema.js';

export const PIPELINE_STAGE = Object.freeze({
  SYNTAX_PARSING: 'SYNTAX_PARSING',
  SCHEMA_TYPE_RANGE: 'SCHEMA_TYPE_RANGE',
  DOMAIN_TAXONOMY: 'DOMAIN_TAXONOMY',
  EVIDENCE_GROUNDING: 'EVIDENCE_GROUNDING',
  PREREQUISITE_DEPENDENCY: 'PREREQUISITE_DEPENDENCY',
  CONSISTENCY_SAFETY: 'CONSISTENCY_SAFETY',
});

/**
 * Executes the complete validation pipeline on raw AI output according to its contract.
 *
 * @param {string} contractId AI contract identifier
 * @param {string|object} rawOutput Raw string response from model or parsed object
 * @param {object} context Contextual inputs (e.g. sourceText, studentTwin, rubric, question)
 * @param {object} [options]
 * @returns {{
 *   isValid: boolean,
 *   value: object|null,
 *   errors: string[],
 *   warnings: string[],
 *   failedStage: string|null,
 *   fallbackUsed: boolean
 * }}
 */
export function validateAiOutputPipeline(contractId, rawOutput, context = {}, options = {}) {
  const contract = getAiContract(contractId);
  const errors = [];
  const warnings = [];

  // =========================================================================
  // STAGE 1: Syntax Parsing & Syntactic Bounds
  // =========================================================================
  let parsedPayload = rawOutput;
  if (typeof rawOutput === 'string') {
    const parseResult = parseJsonObject(rawOutput);
    if (parseResult.error) {
      return handleFailure(
        contract,
        PIPELINE_STAGE.SYNTAX_PARSING,
        [`Syntactic failure: ${parseResult.error}`],
        warnings,
      );
    }
    parsedPayload = parseResult.value;
  }

  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    return handleFailure(
      contract,
      PIPELINE_STAGE.SYNTAX_PARSING,
      ['The AI response was not a valid JSON object.'],
      warnings,
    );
  }

  // Prototype pollution scan on raw text if provided
  if (typeof rawOutput === 'string' && /"__proto__"\s*:|"prototype"\s*:|"constructor"\s*:/i.test(rawOutput)) {
    return handleFailure(
      contract,
      PIPELINE_STAGE.SYNTAX_PARSING,
      ['Security violation: Response contains forbidden prototype property "__proto__".'],
      warnings,
    );
  }

  // Prototype pollution scan on top-level and nested keys
  for (const key of Object.getOwnPropertyNames(parsedPayload)) {
    if (isForbiddenOrPrototypeKey(key)) {
      return handleFailure(
        contract,
        PIPELINE_STAGE.SYNTAX_PARSING,
        [`Security violation: Response contains forbidden prototype property "${key}".`],
        warnings,
      );
    }
  }

  // =========================================================================
  // STAGE 2: Schema, Type & Range Verification
  // =========================================================================
  const schemaSpec = contract.outputSchema;
  if (schemaSpec?.requiredKeys) {
    for (const reqKey of schemaSpec.requiredKeys) {
      if (!(reqKey in parsedPayload)) {
        errors.push(`Missing required output schema property: "${reqKey}".`);
      }
    }
  }

  // Numeric range validations where applicable (e.g. interview evaluations)
  if (parsedPayload.dimensions && typeof parsedPayload.dimensions === 'object') {
    for (const [dimKey, dimVal] of Object.entries(parsedPayload.dimensions)) {
      if (typeof dimVal !== 'number' || Number.isNaN(dimVal) || !Number.isFinite(dimVal) || dimVal < 0.0 || dimVal > 1.0) {
        errors.push(`Dimension "${dimKey}" score must be a finite number between 0.0 and 1.0. Received: ${dimVal}.`);
      }
    }
  }

  if (typeof parsedPayload.overallScore === 'number') {
    if (Number.isNaN(parsedPayload.overallScore) || parsedPayload.overallScore < 0.0 || parsedPayload.overallScore > 1.0) {
      errors.push(`overallScore must be between 0.0 and 1.0. Received: ${parsedPayload.overallScore}.`);
    }
  }

  if (errors.length > 0) {
    return handleFailure(contract, PIPELINE_STAGE.SCHEMA_TYPE_RANGE, errors, warnings);
  }

  // =========================================================================
  // STAGE 3: Domain & Canonical Taxonomy Validation
  // =========================================================================
  // If the payload specifies skills, filter non-canonical / fabricated skills
  if (Array.isArray(parsedPayload.skills)) {
    const verifiedSkills = [];
    for (const s of parsedPayload.skills) {
      const name = typeof s === 'string' ? s : s?.name;
      if (!name) continue;
      const canonical = resolveCanonicalSkill(name);
      if (!canonical) {
        warnings.push(`Dropped non-canonical skill "${name}": not recognized in Nexora ontology.`);
      } else {
        verifiedSkills.push(typeof s === 'string' ? canonical.name : { ...s, name: canonical.name, canonicalSkillId: canonical.id });
      }
    }
    parsedPayload = { ...parsedPayload, skills: verifiedSkills };
  }

  // =========================================================================
  // STAGE 4: Grounding & Evidence Verification
  // =========================================================================
  if (contract.id === AI_CONTRACT_ID.RESUME_EXTRACTION && context.sourceText) {
    const sourceLower = context.sourceText.toLowerCase();
    if (Array.isArray(parsedPayload.skills)) {
      const groundedSkills = [];
      for (const s of parsedPayload.skills) {
        const name = typeof s === 'string' ? s : s.name;
        if (sourceLower.includes(name.toLowerCase())) {
          groundedSkills.push(s);
        } else {
          warnings.push(`Dropped hallucinated skill "${name}": does not appear in source resume text.`);
        }
      }
      parsedPayload = { ...parsedPayload, skills: groundedSkills };
    }
  }

  if (contract.id === AI_CONTRACT_ID.CAREERTWIN_NARRATIVE && context.studentTwin) {
    const knownTwinSkills = new Set(
      (context.studentTwin.skills || []).map((s) => (s.name || '').toLowerCase()),
    );
    const summaryText = parsedPayload.summary || '';
    // If the narrative mentions skills the student doesn't hold in their Twin, reject narrative
    const words = summaryText.split(/\W+/);
    for (const word of words) {
      if (word.length >= 3) {
        const canonical = resolveCanonicalSkill(word);
        if (canonical && !knownTwinSkills.has(canonical.name.toLowerCase()) && !knownTwinSkills.has(word.toLowerCase())) {
          errors.push(`Narrative hallucination: Mentioned skill "${canonical.name}" not recorded in student CareerTwin.`);
        }
      }
    }
    if (errors.length > 0) {
      return handleFailure(contract, PIPELINE_STAGE.EVIDENCE_GROUNDING, errors, warnings);
    }
  }

  // =========================================================================
  // STAGE 5: Prerequisite & Dependency Graph Validation
  // =========================================================================
  if (Array.isArray(parsedPayload.learningSequence)) {
    const seenPositions = new Map();
    parsedPayload.learningSequence.forEach((item, idx) => {
      const canonical = resolveCanonicalSkill(item.name || item.key || item);
      if (canonical) seenPositions.set(canonical.id, idx);
    });

    for (const [skillId, idx] of seenPositions.entries()) {
      const canonical = resolveCanonicalSkill(skillId);
      if (canonical && Array.isArray(canonical.prerequisites)) {
        for (const prereqId of canonical.prerequisites) {
          if (seenPositions.has(prereqId)) {
            const prereqIdx = seenPositions.get(prereqId);
            if (prereqIdx > idx) {
              errors.push(
                `Prerequisite inversion: "${canonical.name}" (step ${idx + 1}) scheduled before prerequisite "${prereqId}" (step ${prereqIdx + 1}).`,
              );
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      return handleFailure(contract, PIPELINE_STAGE.PREREQUISITE_DEPENDENCY, errors, warnings);
    }
  }

  // =========================================================================
  // STAGE 6: Consistency & Anti-Injection Safety Audit
  // =========================================================================
  // Recursively check all text fields for injection markers
  const textStrings = [];
  function collectStrings(obj) {
    if (typeof obj === 'string') textStrings.push(obj);
    else if (Array.isArray(obj)) obj.forEach(collectStrings);
    else if (obj && typeof obj === 'object') Object.values(obj).forEach(collectStrings);
  }
  collectStrings(parsedPayload);

  for (const str of textStrings) {
    if (hasInjectionContent(str)) {
      errors.push('Safety violation: Output contains malicious prompt injection markers.');
      return handleFailure(contract, PIPELINE_STAGE.CONSISTENCY_SAFETY, errors, warnings);
    }
  }

  // Contradiction detection: e.g. Overall score >= 0.8 with explicit zero mastery feedback
  if (parsedPayload.overallScore >= 0.8 && typeof parsedPayload.feedback === 'string') {
    if (parsedPayload.feedback.match(/completely incorrect|no understanding|failed to answer|answered nothing/i)) {
      errors.push('Contradictory output: High score (>= 0.8) contradicts failing feedback comments.');
      return handleFailure(contract, PIPELINE_STAGE.CONSISTENCY_SAFETY, errors, warnings);
    }
  }

  return {
    isValid: true,
    value: parsedPayload,
    errors: [],
    warnings,
    failedStage: null,
    fallbackUsed: false,
  };
}

/**
 * Handles validation failure according to the contract failure policy.
 */
function handleFailure(contract, stage, errors, warnings) {
  const fallbackUsed = contract.failurePolicy === AI_FAILURE_POLICY.OMIT_PRESENTATION;
  return {
    isValid: false,
    value: fallbackUsed ? null : null,
    errors,
    warnings,
    failedStage: stage,
    fallbackUsed,
  };
}
