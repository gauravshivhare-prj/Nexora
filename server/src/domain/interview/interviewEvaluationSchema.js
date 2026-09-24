import { parseJsonObject } from '../../services/ai/aiJson.js';
import { canonicalSkill } from '../skills/skillKey.js';
import {
  INTERVIEW_LIMITS,
  RUBRIC_DIMENSION_KEYS,
  calculateCompositeQuestionScore,
} from './interviewContract.js';

/**
 * Forbidden security-sensitive fields that an untrusted AI model (or an attacker
 * attempting prompt injection) must NEVER be permitted to set or influence.
 */
export const FORBIDDEN_SECURITY_FIELDS = Object.freeze([
  'verified',
  'eligibleforverified',
  'outcome',
  'evaluatortype',
  'evaluator',
  'evidence',
  'evidencecheck',
  'user',
  'userid',
  'role',
  'admin',
  'permissions',
  'token',
  'apikey',
  'secret',
  'password',
  'sessionstatus',
  'passmark',
]);

/**
 * Permitted top-level keys for an AI interview question evaluation payload.
 */
export const ALLOWED_EVALUATION_FIELDS = Object.freeze([
  'questionId',
  'dimensions',
  'compositeScore',
  'score',
  'feedback',
  'strengths',
  'growthAreas',
  'groundedSkills',
]);

/**
 * Common adversarial prompt injection and code injection signatures.
 */
export const INJECTION_PATTERNS = Object.freeze([
  // Prompt overrides and instruction hijacking
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s*(_|\s*)?(override|instruction|prompt|note|directive)\b/i,
  /give\s+(a\s+)?full\s+marks/i,
  /always\s+(return|award)\s+(a\s+)?(perfect\s+)?(score|marks?)?\s*(of\s*)?1(\.0)?/i,
  /(award|give|receive|grant)\s+(a\s+)?(perfect|full|maximum|1(\.0)?)\s+(score|marks?)/i,
  /score\s+is\s+100/i,
  /bypass\s+evaluation/i,
  /roleplay\s+game/i,
  /\bDAN\s*\(/i,
  /do\s+anything\s+now/i,

  // Delimiter and prompt markup breakouts
  /<\s*\/?\s*candidate_untrusted_answer\s*>/i,
  /<\s*\/?\s*system(_instruction|_override)?\s*>/i,
  /<\s*\/?\s*question_target\s*>/i,
  /<\s*\/?\s*rubric_criteria\s*>/i,

  // HTML / Script / XSS payloads
  /<\s*script\b[^>]*>/i,
  /<\s*iframe\b[^>]*>/i,
  /javascript\s*:/i,
  /onload\s*=/i,
  /onerror\s*=/i,

  // SQL / Command injection primitives
  /\bDROP\s+TABLE\b/i,
  /\bUNION\s+SELECT\b/i,
  /\beval\s*\(/i,

  // Null bytes
  /\x00/,
]);

/**
 * Scans a string for malicious or injection-like patterns.
 *
 * @param {string} text
 * @returns {boolean} True if suspicious injection pattern is detected
 */
export function hasInjectionContent(text) {
  if (typeof text !== 'string') return false;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Validates untrusted AI evaluation JSON output.
 *
 * Performs strict structural, data type, numeric range, security-sensitive field,
 * and prompt-injection checks.
 *
 * @param {string|object} rawInput Raw JSON string or parsed object
 * @param {object} [options]
 * @param {boolean} [options.strict=true] Whether extra unknown keys trigger an error
 * @returns {{ isValid: boolean, data: object|null, errors: string[], warnings: string[] }}
 */
export function validateAiEvaluationJson(rawInput, options = {}) {
  const { strict = true } = options;
  const errors = [];
  const warnings = [];

  // Step 1: Parse JSON if string input
  let raw = rawInput;
  if (typeof rawInput === 'string') {
    const parsed = parseJsonObject(rawInput);
    if (parsed.error) {
      return {
        isValid: false,
        data: null,
        errors: [parsed.error],
        warnings,
      };
    }
    raw = parsed.value;
  }

  // Step 2: Validate root shape
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      isValid: false,
      data: null,
      errors: ['AI evaluation output must be a JSON object.'],
      warnings,
    };
  }

  // Step 3: Scan for forbidden security-sensitive fields (root & nested)
  for (const key of Object.keys(raw)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (FORBIDDEN_SECURITY_FIELDS.includes(normalizedKey)) {
      errors.push(
        `Security violation: AI evaluation output contains forbidden security field "${key}".`,
      );
    }
  }

  // Check top-level unknown keys
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_EVALUATION_FIELDS.includes(key)) {
      if (strict) {
        errors.push(`Unexpected field "${key}" in AI evaluation output.`);
      } else {
        warnings.push(`Dropped unrecognized field "${key}".`);
      }
    }
  }

  // Step 4: Validate Rubric Dimensions
  let validDimensions = null;
  if (!raw.dimensions || typeof raw.dimensions !== 'object' || Array.isArray(raw.dimensions)) {
    errors.push('Missing required rubric dimensions object.');
  } else {
    // Check for nested security fields inside dimensions
    for (const dKey of Object.keys(raw.dimensions)) {
      const normalizedDKey = dKey.toLowerCase().replace(/[^a-z]/g, '');
      if (FORBIDDEN_SECURITY_FIELDS.includes(normalizedDKey)) {
        errors.push(
          `Security violation: AI evaluation dimensions contains forbidden security field "${dKey}".`,
        );
      }
    }

    // Check for unexpected extra dimensions
    for (const dKey of Object.keys(raw.dimensions)) {
      if (!RUBRIC_DIMENSION_KEYS.includes(dKey)) {
        errors.push(
          `Unexpected dimension "${dKey}". Allowed dimensions are: ${RUBRIC_DIMENSION_KEYS.join(', ')}.`,
        );
      }
    }

    const parsedDim = {};
    for (const dimKey of RUBRIC_DIMENSION_KEYS) {
      const rawVal = raw.dimensions[dimKey];
      if (rawVal === undefined || rawVal === null) {
        errors.push(`Missing required rubric dimension: "${dimKey}".`);
        continue;
      }

      if (typeof rawVal === 'boolean' || Array.isArray(rawVal) || (typeof rawVal === 'object' && rawVal !== null)) {
        errors.push(`Dimension "${dimKey}" must be a numeric value.`);
        continue;
      }

      const num = Number(rawVal);
      if (Number.isNaN(num) || !Number.isFinite(num)) {
        errors.push(`Dimension "${dimKey}" must be a numeric value.`);
        continue;
      }

      if (num < 0 || num > 1) {
        errors.push(
          `Dimension "${dimKey}" value (${rawVal}) is out of range. Must be between 0.0 and 1.0.`,
        );
        continue;
      }

      parsedDim[dimKey] = Math.round(num * 10000) / 10000;
    }

    if (Object.keys(parsedDim).length === RUBRIC_DIMENSION_KEYS.length) {
      validDimensions = parsedDim;
    }
  }

  // Step 5: Validate Feedback Summary
  let validFeedback = null;
  if (raw.feedback === undefined || raw.feedback === null) {
    errors.push('Feedback summary is required.');
  } else if (typeof raw.feedback !== 'string') {
    errors.push('Feedback summary must be a string.');
  } else {
    const trimmed = raw.feedback.trim();
    if (trimmed.length < 10) {
      errors.push('Feedback summary is too short (minimum 10 characters).');
    } else if (trimmed.length > INTERVIEW_LIMITS.feedbackSummary.max) {
      errors.push(
        `Feedback summary exceeds maximum length of ${INTERVIEW_LIMITS.feedbackSummary.max} characters.`,
      );
    } else if (hasInjectionContent(trimmed)) {
      errors.push('Feedback summary contains potentially unsafe or injection-like content.');
    } else {
      validFeedback = trimmed;
    }
  }

  // Step 6: Validate Strengths
  const validStrengths = [];
  if (raw.strengths !== undefined && raw.strengths !== null) {
    if (!Array.isArray(raw.strengths)) {
      errors.push('Strengths must be an array of strings.');
    } else if (raw.strengths.length > 5) {
      errors.push('Strengths list cannot exceed 5 items.');
    } else {
      for (let i = 0; i < raw.strengths.length; i += 1) {
        const item = raw.strengths[i];
        if (typeof item !== 'string' || item.trim().length === 0) {
          errors.push(`Strength at index ${i} must be a non-empty string.`);
        } else if (item.trim().length > 250) {
          errors.push(`Strength at index ${i} exceeds maximum length of 250 characters.`);
        } else if (hasInjectionContent(item)) {
          errors.push(`Strength at index ${i} contains injection-like content.`);
        } else {
          validStrengths.push(item.trim());
        }
      }
    }
  }

  // Step 7: Validate Growth Areas
  const validGrowthAreas = [];
  if (raw.growthAreas !== undefined && raw.growthAreas !== null) {
    if (!Array.isArray(raw.growthAreas)) {
      errors.push('Growth areas must be an array of strings.');
    } else if (raw.growthAreas.length > 5) {
      errors.push('Growth areas list cannot exceed 5 items.');
    } else {
      for (let i = 0; i < raw.growthAreas.length; i += 1) {
        const item = raw.growthAreas[i];
        if (typeof item !== 'string' || item.trim().length === 0) {
          errors.push(`Growth area at index ${i} must be a non-empty string.`);
        } else if (item.trim().length > 250) {
          errors.push(`Growth area at index ${i} exceeds maximum length of 250 characters.`);
        } else if (hasInjectionContent(item)) {
          errors.push(`Growth area at index ${i} contains injection-like content.`);
        } else {
          validGrowthAreas.push(item.trim());
        }
      }
    }
  }

  // Step 8: Validate Grounded Skills against Canonical Taxonomy
  const validGroundedSkills = [];
  if (raw.groundedSkills !== undefined && raw.groundedSkills !== null) {
    if (!Array.isArray(raw.groundedSkills)) {
      errors.push('Grounded skills must be an array of strings.');
    } else {
      for (const item of raw.groundedSkills) {
        if (typeof item === 'string' && item.trim().length > 0) {
          const canonical = canonicalSkill(item.trim());
          if (canonical) {
            if (!validGroundedSkills.includes(canonical.name)) {
              validGroundedSkills.push(canonical.name);
            }
          } else {
            warnings.push(
              `Dropped non-canonical grounded skill "${item}": not recognized in taxonomy.`,
            );
          }
        }
      }
    }
  }

  // Stop early if structural or security errors exist
  if (errors.length > 0) {
    return {
      isValid: false,
      data: null,
      errors,
      warnings,
    };
  }

  // Step 9: Deterministically calculate composite score from validated dimensions
  const compositeScore = calculateCompositeQuestionScore(validDimensions);

  // If model tried to supply its own score that differs from verified composite score
  const suppliedScore = raw.compositeScore ?? raw.score;
  if (suppliedScore !== undefined && suppliedScore !== null) {
    const numSupplied = Number(suppliedScore);
    if (Math.abs(numSupplied - compositeScore) > 0.01) {
      warnings.push(
        `AI-supplied score (${suppliedScore}) was overridden by verified composite score (${compositeScore}).`,
      );
    }
  }

  const cleanData = {
    dimensions: validDimensions,
    compositeScore,
    feedback: validFeedback,
    strengths: validStrengths,
    growthAreas: validGrowthAreas,
    groundedSkills: validGroundedSkills,
  };

  if (raw.questionId && typeof raw.questionId === 'string') {
    cleanData.questionId = raw.questionId.trim();
  }

  return {
    isValid: true,
    data: cleanData,
    errors: [],
    warnings,
  };
}

/**
 * Throws a descriptive validation error if rawInput fails strict AI evaluation schema checks,
 * otherwise returns the clean validated evaluation object.
 *
 * @param {string|object} rawInput
 * @param {object} [options]
 * @returns {object} Clean validated evaluation object
 * @throws {Error} If validation fails
 */
export function parseAndValidateAiEvaluation(rawInput, options = {}) {
  const result = validateAiEvaluationJson(rawInput, options);
  if (!result.isValid) {
    throw new Error(result.errors.join(' '));
  }
  return result.data;
}
