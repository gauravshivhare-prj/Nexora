import { parseJsonObject } from '../../services/ai/aiJson.js';
import { canonicalSkill } from '../skills/skillKey.js';
import {
  FORBIDDEN_SECURITY_FIELDS,
  isForbiddenOrPrototypeKey,
  INTERVIEW_LIMITS,
  RUBRIC_DIMENSION_KEYS,
  calculateCompositeQuestionScore,
} from './interviewContract.js';
import {
  boundFeedbackList,
  boundFeedbackSummary,
} from './interviewFeedbackSafety.js';

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
  /(ignore|disregard|forget)\s+(all\s+|the\s+|your\s+)*(previous|prior|earlier|past|preceding|above|former|system)?\s*(instructions|directives|rules|guidelines|prompts|rubrics?|text)\b/i,
  /(ignore|disregard|forget)\s+(about\s+)?(the\s+)?(rubric|grading|criteria|rules|instructions)\b/i,
  /(system|admin|administrator|developer|evaluation|instruction|institutional)\s*(_|\s*)?(override|directive|instruction|mode|prompt|note|message|command)s?\b/i,
  /new\s+system\s+(prompt|directive|rule|instruction)s?/i,
  /from\s+now\s+on\b/i,
  /give\s+(a\s+)?full\s+marks/i,
  /always\s+(return|award)\s+(a\s+)?(perfect\s+)?(score|marks?)?\s*(of\s*)?1(\.0)?/i,
  /(award|give|receive|grant|assign|set|return)\s+(the\s+candidate\s+)?(a\s+)?(perfect|full|maximum|1(\.0)?|100%?)\s*(score|marks?)?/i,
  /(award|give|receive|grant|assign)\s+(the\s+candidate\s+)?(a\s+)?score\s+(of\s+)?1(\.0)?\b/i,
  /(set|make|force|change)\s+(all\s+|the\s+)?(scores?|dimensions?|ratings?)\s*(to|=|\:)?\s*1(\.0)?\b/i,
  /all\s+dimensions?\s+(to\s+)?1(\.0)?\b/i,
  /score\s+is\s+100/i,
  /(bypass|disregard|ignore)\s+(all\s+|the\s+)*(safety|security|rubric|grading|evaluation|assessment|checks?|filters?|rules?|guidelines?|constraints?)\b/i,
  /\b(roleplay|role-play)\b/i,
  /pretend\s+(you\s+are|to\s+be)\b/i,
  /you\s+are\s+no\s+longer\b/i,
  /act\s+as\s+(an?|my)\s+(unrestricted|assistant|helpful|evaluator|interviewer|tutor)\b/i,
  /\bDAN\s*\(/i,
  /\b(DAN|AIM|jailbreak|unrestricted|developer|evil|god|unfiltered)\s+mode\b/i,
  /\b(enable|activate)\s+(developer|debug|admin|unrestricted|god)\s+mode\b/i,
  /do\s+anything\s+now/i,
  /you\s+are\s+(now\s+)?(in\s+)?(a\s+)?(helpful\s+)?(tutor|assistant|bot|Dan|AIM|an\s+unrestricted|override\s+mode|developer\s+mode|jailbreak\s+mode)/i,
  /(act|behave|respond)\s+as\s+(an?\s+)?(unrestricted|jailbroken|helpful\s+assistant|tutor|system\s+administrator)/i,
  /(reveal|repeat|dump|print|display|show|echo|output)\s+(the\s+|your\s+)*(complete\s+)?(initial\s+|original\s+|system\s+|evaluator\s+)?(prompt|instructions|directives|rules)\b/i,
  /print\s+(the\s+)?(text|prompt|instructions)\s+above/i,
  /what\s+(is|are)\s+your\s+(complete\s+)?(initial\s+)?(system\s+)?(prompt|instructions|rules|directives)\b/i,
  /(reveal|show|display|give\s+me|tell\s+me)\s+(the\s+)?(rubric(\s+criteria)?|answer\s*key|scoring\s+criteria|expected\s+solution|model\s+answer)\b/i,
  /tell\s+me\s+the\s+correct\s+answer/i,
  /what\s+is\s+the\s+(expected|correct)\s+(answer|solution)\b/i,
  /output\s+JSON\s+immediately/i,
  /override\s+all\s+(rules|rubrics|criteria|instructions|guidelines)/i,
  /ignore\s+(the\s+)?rubric/i,
  /do\s+not\s+(grade|evaluate|assess)\b/i,

  // Institutional evidence poisoning
  /(set|output|include|grant)\s+["']?(verified|eligibleForVerified)["']?\s*(:|\s*to)?\s*true/i,
  /grant\s+(verified\s+)?(credentials|evidence|status|diploma|certificate)/i,
  /mark\s+(this\s+)?(as\s+)?verified/i,

  // Delimiter and prompt markup breakouts (including closing tags with internal/trailing whitespace, backslashes, or unclosed)
  /<\s*[\/\\|]?\s*(candidate_untrusted_answer|system(_instruction|_override)?|question_target|rubric_criteria|developer_instruction|admin_override|instructions|prompt|rules|untrusted_resume_text|resume_text|candidate_profile|student_profile_data)\b/i,
  /<!--|-->/,
  /<!\[CDATA\[|\]\]>|<!DOCTYPE/i,
  /<\?xml|<\?(php|=|\w+)?/i,

  // LLM template and chat tokens (including fullwidth bars and Anthropic turns)
  /<\s*[|｜]\s*(im_(start|end)|User|Assistant|system|end of sentence|begin of sentence)\s*[|｜]>/i,
  /\[\s*\/?\s*INST\s*\]/i,
  /<<\s*\/?\s*SYS\s*>>/i,
  /<\s*\/?\s*turn_(start|end)\s*>/i,
  /<\s*\/?\s*s\s*>/i,
  /(^|\n)\s*(Human|Assistant)\s*:\s*/i,

  // Exfiltration beacons and encoded directives
  /!\[[^\]]*\]\(https?:\/\/[^\)]+\)/i,
  /\bbase64\s+(decode|encoded|payload|instruction|directive)\b/i,

  // HTML / Script / XSS payloads / DOM Event handlers
  /<\s*script\b[^>]*>/i,
  /<\s*iframe\b[^>]*>/i,
  /javascript\s*:/i,
  /\bon(error|load|click|mouseover|focus|blur)\s*=/i,
  /data:text\/(html|javascript)/i,
  /\bsrcdoc\s*=/i,
  /\[REDACTED_SCRIPT\]/i,
  /\[REDACTED_IMAGE_EXFILTRATION\]/i,

  // SQL / Command injection primitives
  /\bDROP\s+TABLE\b/i,
  /\bUNION\s+SELECT\b/i,
  /\beval\s*\(/i,

  // Null bytes
  /\x00/,
]);

/**
 * Scans a string for malicious or injection-like patterns.
 * Normalizes invisible zero-width characters, bidirectional overrides, fullwidth brackets,
 * vertical bars, and spaced-out token evasion.
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
  // Collapse single-letter spaced-out evasion words (e.g. "i g n o r e   a l l   p r e v i o u s")
  const collapsedSpaced = stripped.replace(/(?<=\b[a-zA-Z]) (?=[a-zA-Z]\b)/g, '');

  return INJECTION_PATTERNS.some(
    (pattern) =>
      pattern.test(text) ||
      pattern.test(stripped) ||
      pattern.test(normalized) ||
      pattern.test(collapsedSpaced),
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
  const { strict = true, boundFeedback = !strict } = options;
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
          `Dimension "${dimKey}" value (${num}) is out of range. Must be between 0.0 and 1.0.`,
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
      if (strict && !boundFeedback) {
        errors.push(
          `Feedback summary exceeds maximum length of ${INTERVIEW_LIMITS.feedbackSummary.max} characters.`,
        );
      } else {
        warnings.push('Feedback summary was bounded to maximum allowed length.');
        validFeedback = boundFeedbackSummary(trimmed);
      }
    } else if (hasInjectionContent(trimmed)) {
      const hasXss = /<\s*(script|iframe)\b|javascript:|onerror=|eval\(|\[REDACTED_SCRIPT\]/i.test(trimmed);
      if (hasXss || !options.allowInjectionEcho) {
        errors.push('Feedback summary contains potentially unsafe or injection-like content.');
      } else {
        warnings.push('Feedback summary contains potentially unsafe or injection-like content.');
        validFeedback = trimmed;
      }
    } else {
      validFeedback = trimmed;
    }
  }

  // Step 6: Validate Strengths
  const validStrengths = [];
  if (raw.strengths !== undefined && raw.strengths !== null) {
    if (!Array.isArray(raw.strengths)) {
      errors.push('Strengths must be an array of strings.');
    } else if (strict && !boundFeedback && raw.strengths.length > 5) {
      errors.push('Strengths list cannot exceed 5 items.');
    } else {
      let rawList = raw.strengths;
      if (rawList.length > 5) {
        warnings.push('Strengths list was bounded to maximum 5 items.');
        rawList = boundFeedbackList(rawList, { maxItems: 5, maxItemLength: 250 });
      }
      for (let i = 0; i < rawList.length; i += 1) {
        const item = rawList[i];
        if (typeof item !== 'string' || item.trim().length === 0) {
          errors.push(`Strength at index ${i} must be a non-empty string.`);
        } else if (strict && !boundFeedback && item.trim().length > 250) {
          errors.push(`Strength at index ${i} exceeds maximum length of 250 characters.`);
        } else if (hasInjectionContent(item)) {
          const hasXss = /<\s*(script|iframe)\b|javascript:|onerror=|eval\(|\[REDACTED_SCRIPT\]/i.test(item);
          if (hasXss || !options.allowInjectionEcho) {
            errors.push(`Strength at index ${i} contains injection-like content.`);
          } else {
            warnings.push(`Strength at index ${i} contains injection-like content.`);
            validStrengths.push(item.trim());
          }
        } else {
          validStrengths.push(boundFeedback ? boundFeedbackSummary(item.trim(), 250, 1) : item.trim());
        }
      }
    }
  }

  // Step 7: Validate Growth Areas
  const validGrowthAreas = [];
  if (raw.growthAreas !== undefined && raw.growthAreas !== null) {
    if (!Array.isArray(raw.growthAreas)) {
      errors.push('Growth areas must be an array of strings.');
    } else if (strict && !boundFeedback && raw.growthAreas.length > 5) {
      errors.push('Growth areas list cannot exceed 5 items.');
    } else {
      let rawList = raw.growthAreas;
      if (rawList.length > 5) {
        warnings.push('Growth areas list was bounded to maximum 5 items.');
        rawList = boundFeedbackList(rawList, { maxItems: 5, maxItemLength: 250 });
      }
      for (let i = 0; i < rawList.length; i += 1) {
        const item = rawList[i];
        if (typeof item !== 'string' || item.trim().length === 0) {
          errors.push(`Growth area at index ${i} must be a non-empty string.`);
        } else if (strict && !boundFeedback && item.trim().length > 250) {
          errors.push(`Growth area at index ${i} exceeds maximum length of 250 characters.`);
        } else if (hasInjectionContent(item)) {
          const hasXss = /<\s*(script|iframe)\b|javascript:|onerror=|eval\(|\[REDACTED_SCRIPT\]/i.test(item);
          if (hasXss || !options.allowInjectionEcho) {
            errors.push(`Growth area at index ${i} contains injection-like content.`);
          } else {
            warnings.push(`Growth area at index ${i} contains injection-like content.`);
            validGrowthAreas.push(item.trim());
          }
        } else {
          validGrowthAreas.push(boundFeedback ? boundFeedbackSummary(item.trim(), 250, 1) : item.trim());
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
