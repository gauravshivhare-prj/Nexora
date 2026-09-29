import { INTERVIEW_LIMITS } from './interviewContract.js';

/**
 * Regex patterns matching sensitive credentials, tokens, connection URIs,
 * and private keys that must NEVER be exposed in evaluator feedback.
 */
export const SECRET_PATTERNS = Object.freeze([
  // Google / Gemini API keys (e.g. AIzaSy...)
  { pattern: /\bAIza[0-9A-Za-z-_]{30,40}\b/g, replacement: '[REDACTED_SECRET]' },
  // OpenAI API keys (e.g. sk-...)
  { pattern: /\bsk-[a-zA-Z0-9_-]{20,}\b/g, replacement: '[REDACTED_SECRET]' },
  // Anthropic API keys (e.g. sk-ant-...)
  { pattern: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/g, replacement: '[REDACTED_SECRET]' },
  // GitHub Personal Access Tokens (ghp_..., gho_..., etc.)
  { pattern: /\bgh[pousr]_[0-9a-zA-Z]{25,50}\b/g, replacement: '[REDACTED_SECRET]' },
  // AWS Access Key ID
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[REDACTED_SECRET]' },
  // Slack Tokens (xoxb-..., xoxp-...)
  { pattern: /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/g, replacement: '[REDACTED_SECRET]' },
  // Bearer tokens with JWT or long hash payloads
  { pattern: /Bearer\s+[a-zA-Z0-9_.-]{16,}/gi, replacement: 'Bearer [REDACTED_SECRET]' },
  // JSON Web Token standard format (header.payload.signature)
  { pattern: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, replacement: '[REDACTED_SECRET]' },
  // Database connection URIs containing credentials
  { pattern: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis(?:s)?):\/\/[^\s"'<>]+/gi, replacement: '[REDACTED_URI]' },
  // Explicit secret/key assignment expressions
  { pattern: /\b(?:api[_-]?key|secret[_-]?key|jwt[_-]?secret|auth[_-]?token|access[_-]?token|refresh[_-]?token|password|passwd|mongodb[_-]?uri|database[_-]?url)\s*[:=]\s*['"]?[a-zA-Z0-9-_/.=+@:?&%]{8,}['"]?/gi, replacement: '[REDACTED_SECRET]' },
  // PEM Private Keys
  { pattern: /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z0-9_-]*PRIVATE KEY-----/g, replacement: '[REDACTED_PRIVATE_KEY]' },
]);

/**
 * Regex patterns matching raw provider errors, stack traces, and low-level socket traces.
 */
export const PROVIDER_ERROR_PATTERNS = Object.freeze([
  // Stack trace frames and error headers
  {
    pattern: /(?:\b(?:Error|Exception|TypeError|RangeError|ReferenceError):[^\n]*|\bat\s+(?:async\s+)?[^\n]+)/gi,
    replacement: '[REDACTED_PROVIDER_ERROR]',
  },
  // AI Provider SDK errors
  {
    pattern: /\b(?:GoogleGenerativeAIError|GoogleGenerativeAI|AnthropicError|OpenAIError)\s*:\s*[^\n.]*/gi,
    replacement: '[REDACTED_PROVIDER_ERROR]',
  },
  // Node.js low-level socket, DNS, and I/O error codes
  {
    pattern: /\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH)\b[^\n.]*/gi,
    replacement: '[REDACTED_PROVIDER_ERROR]',
  },
  // Upstream proxy and gateway error dumps
  {
    pattern: /\bupstream\s+(?:connect\s+error|request\s+timeout|502\s+bad\s+gateway|503\s+service\s+unavailable|reset\s+before\s+headers)\b[^\n.]*/gi,
    replacement: '[REDACTED_PROVIDER_ERROR]',
  },
]);

/**
 * Regex patterns matching unsupported claims that an AI evaluator is forbidden from making.
 * In Nexora's institutional model, AI evaluations are strictly advisory and cannot confer
 * institutional verification, official certification, or job guarantees.
 */
export const UNSUPPORTED_CLAIM_PATTERNS = Object.freeze([
  // 1. Official verification / certification claims
  {
    pattern: /\b(?:officially|institutionally|formally)\s+(?:verified|certified|accredited|approved)\b/gi,
    replacement: 'demonstrated (advisory)',
    claimType: 'verification',
  },
  {
    pattern: /\b(?:grant(?:ed|ing|s)?|award(?:ed|ing|s)?|issu(?:ed|ing|es)?|confirm(?:ed|ing|s)?)\s+(?:official\s+)?(?:verified\s+)?(?:credentials?|badge|certificate|certification)\b/gi,
    replacement: 'evaluated for candidate skill development',
    claimType: 'verification',
  },
  {
    pattern: /\beligible\s+for\s+verified(?:\s+credentials?|\s+status)?\b/gi,
    replacement: 'recorded as advisory evaluation',
    claimType: 'verification',
  },
  {
    pattern: /\bverified\s+(?:status|credential|badge|certification)\s+(?:granted|confirmed|achieved|awarded)\b/gi,
    replacement: 'advisory skill practice recorded',
    claimType: 'verification',
  },
  {
    pattern: /\b(?:you\s+are\s+now|candidate\s+is\s+now)\s+(?:certified|verified)\b/gi,
    replacement: 'candidate demonstrated competence',
    claimType: 'verification',
  },
  // 2. Hiring & employment guarantees
  {
    pattern: /\b(?:guaranteed?\s+(?:a\s+)?(?:job|employment|offer|hiring|placement)|will\s+(?:definitely|guaranteed\s+to)\s+be\s+hired)\b/gi,
    replacement: 'demonstrated technical preparation',
    claimType: 'employment_guarantee',
  },
  {
    pattern: /\bguaranteed\s+to\s+pass\b/gi,
    replacement: 'well-prepared for',
    claimType: 'employment_guarantee',
  },
  {
    pattern: /\b(?:100%|definitely|guaranteed)\s+(?:hire|get\s+hired|hired)\b/gi,
    replacement: 'strong technical performance',
    claimType: 'employment_guarantee',
  },
  // 3. Rubric or institutional policy waivers
  {
    pattern: /\b(?:rubric|policy|evaluation|criteria)\s+(?:is\s+)?(?:waived|bypassed|ignored|exempted)\b/gi,
    replacement: 'standard rubric applied',
    claimType: 'policy_waiver',
  },
  {
    pattern: /\b(?:bypasses?|waives?|overrides?)\s+(?:human\s+review|institutional\s+approval|verification\s+policy)\b/gi,
    replacement: 'requires standard institutional review',
    claimType: 'policy_waiver',
  },
]);

/**
 * Redacts known sensitive credential, token, and database connection patterns from text.
 *
 * @param {string} text Raw text potentially containing secrets
 * @returns {{ text: string, redactedSecretsCount: number }}
 */
export function redactSensitiveSecrets(text) {
  if (typeof text !== 'string' || text === '') {
    return { text: '', redactedSecretsCount: 0 };
  }

  let sanitized = text;
  let count = 0;

  for (const { pattern, replacement } of SECRET_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches && matches.length > 0) {
      count += matches.length;
      sanitized = sanitized.replace(pattern, replacement);
    }
  }

  return { text: sanitized, redactedSecretsCount: count };
}

/**
 * Redacts raw provider internal errors, stack traces, and low-level socket exceptions.
 *
 * @param {string} text Raw text potentially containing provider errors
 * @returns {{ text: string, redactedErrorsCount: number }}
 */
export function redactProviderErrors(text) {
  if (typeof text !== 'string' || text === '') {
    return { text: '', redactedErrorsCount: 0 };
  }

  let sanitized = text;
  let count = 0;

  for (const { pattern, replacement } of PROVIDER_ERROR_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches && matches.length > 0) {
      count += matches.length;
      sanitized = sanitized.replace(pattern, replacement);
    }
  }

  return { text: sanitized, redactedErrorsCount: count };
}

/**
 * Neutralizes unsupported claims (official verification, certifications, hiring guarantees).
 * Replaces them with safe advisory language while preserving the surrounding constructive feedback.
 *
 * @param {string} text Raw evaluator feedback text
 * @returns {{ text: string, neutralizedClaimsCount: number }}
 */
export function neutralizeUnsupportedClaims(text) {
  if (typeof text !== 'string' || text === '') {
    return { text: '', neutralizedClaimsCount: 0 };
  }

  let sanitized = text;
  let count = 0;

  for (const { pattern, replacement } of UNSUPPORTED_CLAIM_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches && matches.length > 0) {
      count += matches.length;
      sanitized = sanitized.replace(pattern, replacement);
    }
  }

  return { text: sanitized, neutralizedClaimsCount: count };
}

/**
 * Strips script tags, iframes, and dangerous inline event handlers from feedback text.
 *
 * @param {string} text
 * @returns {string} Sanitized string safe for client rendering
 */
export function sanitizeHtmlContent(text) {
  if (typeof text !== 'string') return '';
  return text
    // Strip script and iframe tags with content
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*iframe\b[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
    // Strip unclosed or standalone tags
    .replace(/<\s*script\b[^>]*>/gi, '')
    .replace(/<\s*iframe\b[^>]*>/gi, '')
    // Neutralize dangerous inline event attributes
    .replace(/\bon(?:load|error|click|mouseover|focus|blur|change|submit)\s*=\s*['"][^'"]*['"]/gi, '')
    .replace(/\bjavascript:\s*[^\s"')>]+/gi, '#');
}

/**
 * Bounds the feedback summary text to guaranteed [min, max] length limits.
 * Truncates gracefully at sentence or word boundaries without abruptly cutting words.
 *
 * @param {string} text Feedback summary text
 * @param {number} [maxChars=INTERVIEW_LIMITS.feedbackSummary.max] Max allowed length
 * @param {number} [minChars=INTERVIEW_LIMITS.feedbackSummary.min] Min allowed length
 * @returns {string} Bounded feedback summary
 */
export function boundFeedbackSummary(
  text,
  maxChars = INTERVIEW_LIMITS.feedbackSummary.max,
  minChars = INTERVIEW_LIMITS.feedbackSummary.min,
) {
  if (typeof text !== 'string') {
    return 'Candidate response was evaluated against the technical rubric criteria.';
  }

  let sanitized = text.trim();
  if (sanitized.length < minChars) {
    return 'Candidate response was evaluated against the technical rubric criteria.';
  }

  if (sanitized.length <= maxChars) {
    return sanitized;
  }

  // Gracefully truncate to maxChars while preserving sentence or word integrity
  const budget = maxChars - 3; // reserve 3 chars for ellipsis
  const searchSlice = sanitized.slice(0, budget);

  // Check if a sentence ends near the boundary (within last 150 chars of budget)
  const sentenceEndMatch = searchSlice.match(/^(.*[.!?])\s+[A-Z0-9]/s);
  if (sentenceEndMatch && sentenceEndMatch[1].length >= budget - 150) {
    return sentenceEndMatch[1].trim();
  }

  // Fallback to cutting at the last space before the budget limit
  const lastSpace = searchSlice.lastIndexOf(' ');
  if (lastSpace > budget - 80) {
    return `${searchSlice.slice(0, lastSpace).trim()}...`;
  }

  return `${searchSlice.trim()}...`;
}

/**
 * Bounds an array of feedback strings (strengths or growth areas).
 * Caps the total number of items and the maximum character length of each individual item.
 *
 * @param {Array<string>} items List of items
 * @param {object} [options]
 * @param {number} [options.maxItems=5] Max number of items allowed
 * @param {number} [options.maxItemLength=250] Max character length per item
 * @returns {Array<string>} Bounded list of clean strings
 */
export function boundFeedbackList(items, { maxItems = 5, maxItemLength = 250 } = {}) {
  if (!Array.isArray(items)) return [];

  const bounded = [];
  for (let i = 0; i < Math.min(items.length, maxItems); i += 1) {
    const item = items[i];
    if (typeof item !== 'string' || item.trim().length === 0) continue;

    let clean = item.trim();
    if (clean.length > maxItemLength) {
      const budget = maxItemLength - 3;
      const lastSpace = clean.slice(0, budget).lastIndexOf(' ');
      if (lastSpace > budget - 40) {
        clean = `${clean.slice(0, lastSpace).trim()}...`;
      } else {
        clean = `${clean.slice(0, budget).trim()}...`;
      }
    }
    bounded.push(clean);
  }

  return bounded;
}

/**
 * Complete feedback safety pipeline:
 * 1. Sanitizes HTML/XSS content.
 * 2. Redacts secrets, credentials, tokens, and database URIs.
 * 3. Redacts raw provider internal errors and stack traces.
 * 4. Neutralizes unsupported institutional claims (verification, certification, job guarantees).
 * 5. Bounds feedback summary and lists to guaranteed contract limits.
 *
 * Preserves genuine constructive technical feedback intact.
 *
 * @param {object} params
 * @param {string} params.feedback Raw feedback summary
 * @param {Array<string>} [params.strengths] List of strengths
 * @param {Array<string>} [params.growthAreas] List of growth areas
 * @returns {{ feedback: string, strengths: Array<string>, growthAreas: Array<string>, warnings: Array<string> }}
 */
export function sanitizeEvaluatorFeedback({ feedback, strengths = [], growthAreas = [] } = {}) {
  const warnings = [];

  // Step 1: Process feedback summary
  let safeFeedback = typeof feedback === 'string' ? feedback : '';

  // HTML sanitization
  const deXssFeedback = sanitizeHtmlContent(safeFeedback);
  if (deXssFeedback !== safeFeedback) {
    warnings.push('Potentially unsafe HTML/script tags were removed from evaluator feedback.');
    safeFeedback = deXssFeedback;
  }

  // Secret redaction
  const { text: redactedFeedback, redactedSecretsCount } = redactSensitiveSecrets(safeFeedback);
  if (redactedSecretsCount > 0) {
    warnings.push(
      `Sensitive secret/token pattern detected in evaluator feedback and redacted (${redactedSecretsCount} instance(s)).`,
    );
    safeFeedback = redactedFeedback;
  }

  // Provider error redaction
  const { text: cleanErrorFeedback, redactedErrorsCount } = redactProviderErrors(safeFeedback);
  if (redactedErrorsCount > 0) {
    warnings.push(
      `Raw provider error or stack trace detected in evaluator feedback and redacted (${redactedErrorsCount} instance(s)).`,
    );
    safeFeedback = cleanErrorFeedback;
  }

  // Unsupported claims neutralization
  const { text: neutralFeedback, neutralizedClaimsCount } = neutralizeUnsupportedClaims(safeFeedback);
  if (neutralizedClaimsCount > 0) {
    warnings.push(
      'AI feedback contained unsupported claims (verification, certification, or hiring guarantee) which were neutralized.',
    );
    safeFeedback = neutralFeedback;
  }

  // Length bounding
  const boundedFeedback = boundFeedbackSummary(safeFeedback);
  if (boundedFeedback.length !== safeFeedback.length && safeFeedback.length > INTERVIEW_LIMITS.feedbackSummary.max) {
    warnings.push('Feedback summary was bounded to maximum allowed length.');
  }
  safeFeedback = boundedFeedback;

  // Step 2: Process strengths list
  const safeStrengths = [];
  const rawStrengths = Array.isArray(strengths) ? strengths : [];
  if (rawStrengths.length > 5) {
    warnings.push('Strengths list was bounded to maximum 5 items.');
  }
  const boundedStrengthsList = boundFeedbackList(rawStrengths, { maxItems: 5, maxItemLength: 250 });

  for (const item of boundedStrengthsList) {
    let cleanItem = sanitizeHtmlContent(item);
    const { text: noSecrets } = redactSensitiveSecrets(cleanItem);
    const { text: noErrors } = redactProviderErrors(noSecrets);
    const { text: neutralized } = neutralizeUnsupportedClaims(noErrors);
    safeStrengths.push(neutralized);
  }

  // Step 3: Process growthAreas list
  const safeGrowthAreas = [];
  const rawGrowthAreas = Array.isArray(growthAreas) ? growthAreas : [];
  if (rawGrowthAreas.length > 5) {
    warnings.push('Growth areas list was bounded to maximum 5 items.');
  }
  const boundedGrowthAreasList = boundFeedbackList(rawGrowthAreas, { maxItems: 5, maxItemLength: 250 });

  for (const item of boundedGrowthAreasList) {
    let cleanItem = sanitizeHtmlContent(item);
    const { text: noSecrets } = redactSensitiveSecrets(cleanItem);
    const { text: noErrors } = redactProviderErrors(noSecrets);
    const { text: neutralized } = neutralizeUnsupportedClaims(noErrors);
    safeGrowthAreas.push(neutralized);
  }

  return {
    feedback: safeFeedback,
    strengths: safeStrengths,
    growthAreas: safeGrowthAreas,
    warnings,
  };
}
