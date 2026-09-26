import { parseJsonObject } from '../../services/ai/aiJson.js';
import { canonicalSkill } from '../skills/skillKey.js';
import {
  FORBIDDEN_SECURITY_FIELDS,
  isForbiddenOrPrototypeKey,
  INTERVIEW_LIMITS,
  RUBRIC_DIMENSION_KEYS,
  calculateCompositeQuestionScore,
} from './interviewContract.js';

export { FORBIDDEN_SECURITY_FIELDS, isForbiddenOrPrototypeKey };

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
  /(ignore|disregard|forget)\s+(all\s+|the\s+|your\s+)*(previous|prior|earlier|past|preceding|above|former)?\s*(instructions|directives|rules|guidelines|prompts|rubrics?|text)\b/i,
  /(ignore|disregard|forget)\s+(about\s+)?(the\s+)?(rubric|grading|criteria|rules|instructions)\b/i,
  /(system|admin|administrator|developer|evaluation|instruction)\s*(_|\s*)?(override|directive|instruction|mode|prompt|note)\b/i,
  /new\s+system\s+(prompt|directive|rule|instruction)/i,
  /give\s+(a\s+)?full\s+marks/i,
  /always\s+(return|award)\s+(a\s+)?(perfect\s+)?(score|marks?)?\s*(of\s*)?1(\.0)?/i,
  /(award|give|receive|grant|assign|set|return)\s+(a\s+)?(perfect|full|maximum|1(\.0)?|100%?)\s*(score|marks?)?/i,
  /(set|make|change)\s+(all\s+)?(the\s+)?(scores?|dimensions?|ratings?)\s*(to|=)?\s*1(\.0)?/i,
  /score\s+is\s+100/i,
  /bypass\s+(all\s+)?(the\s+)?(evaluation|scoring|rubric|grading|assessment|checks?)/i,
  /roleplay\s+game/i,
  /\bDAN\s*\(/i,
  /\b(DAN|jailbreak|unrestricted)\s+mode\b/i,
  /do\s+anything\s+now/i,
  /you\s+are\s+(now\s+)?(in\s+)?(a\s+)?(helpful\s+)?(tutor|assistant|bot|Dan|an\s+unrestricted|override\s+mode|developer\s+mode|jailbreak\s+mode)/i,
  /(act|behave|respond)\s+as\s+(an?\s+)?(unrestricted|jailbroken|helpful\s+assistant|tutor|system\s+administrator)/i,
  /reveal\s+(your\s+)?(complete\s+)?(system\s+)?(prompt|instructions)/i,
  /repeat\s+(your\s+)?(complete\s+)?(system\s+)?(prompt|instructions)/i,
  /what\s+is\s+your\s+system\s+prompt/i,
  /output\s+JSON\s+immediately/i,
  /override\s+all\s+(rules|rubrics|criteria)/i,
  /do\s+not\s+grade/i,

  // Institutional evidence poisoning
  /(set|output|include|grant)\s+["']?(verified|eligibleForVerified)["']?\s*(:|\s*to)?\s*true/i,
  /grant\s+(verified\s+)?(credentials|evidence|status|diploma|certificate)/i,
  /mark\s+(this\s+)?(as\s+)?verified/i,

  // Delimiter and prompt markup breakouts (including closing tags with internal/trailing whitespace)
  /<\s*\/?\s*(candidate_untrusted_answer|system(_instruction|_override)?|question_target|rubric_criteria|developer_instruction|admin_override|instructions|prompt|rules)\b[^>]*>/i,
  /<!\[CDATA\[|\]\]>/i,

  // LLM template and chat tokens (including fullwidth bars and Anthropic turns)
  /<\s*[|｜]\s*(im_(start|end)|User|Assistant|system|end of sentence|begin of sentence)\s*[|｜]>/i,
  /\[\s*\/?\s*INST\s*\]/i,
  /<<\s*\/?\s*SYS\s*>>/i,
  /<\s*\/?\s*turn_(start|end)\s*>/i,
  /<\s*\/?\s*s\s*>/i,
  /(^|\n)\s*(Human|Assistant)\s*:\s*/i,

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
 * Normalizes invisible zero-width characters, bidirectional overrides, fullwidth brackets and vertical bars.
 *
 * @param {string} text
 * @returns {boolean} True if suspicious injection pattern is detected
 */
export function hasInjectionContent(text) {
  if (typeof text !== 'string') return false;
  const stripped = text.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g, '');
  const normalized = stripped
    .replace(/\uFF1C/g, '<')
    .replace(/\uFF1E/g, '>')
    .replace(/\uFF5C/g, '|');
  return INJECTION_PATTERNS.some(
    (pattern) => pattern.test(text) || pattern.test(stripped) || pattern.test(normalized),
  );
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
    if (isForbiddenOrPrototypeKey(key)) {
      errors.push(
        `Security violation: AI evaluation output contains forbidden security field "${key}".`,
      );
    }
  }

  // Check top-level unknown keys
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_EVALUATION_FIELDS.includes(key) && !isForbiddenOrPrototypeKey(key)) {
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
      if (isForbiddenOrPrototypeKey(dKey)) {
        errors.push(
          `Security violation: AI evaluation dimensions contains forbidden security field "${dKey}".`,
        );
      }
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

      if (
        typeof rawVal === 'boolean' ||
        Array.isArray(rawVal) ||
        (typeof rawVal === 'object' && rawVal !== null) ||
        (typeof rawVal === 'string' && rawVal.trim() === '')
      ) {
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
    score: compositeScore,
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
