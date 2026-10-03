/**
 * AI Cost Estimation & Token Economics.
 *
 * Implements deterministic cost estimation for outbound AI evaluation requests
 * based on Gemini 1.5 Flash and Gemini 1.5 Pro pricing models.
 *
 * Standard Gemini pricing reference (March 2026):
 * - Gemini 1.5 Flash: $0.075 / 1M input tokens, $0.30 / 1M output tokens (text <= 128k)
 * - Gemini 1.5 Pro:   $1.25 / 1M input tokens,  $5.00 / 1M output tokens (text <= 128k)
 *
 * Token Estimation Heuristic:
 * - 1 token ≈ 4 UTF-8 characters (standard OpenAI/Google approximation).
 */

export const AI_PRICING_TIERS = Object.freeze({
  'gemini-1.5-flash': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
  },
  'gemini-1.5-pro': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.0,
  },
  default: {
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
  },
});

/**
 * Approximates token count from raw character length.
 *
 * @param {number} [chars=0]
 * @returns {number}
 */
export function estimateTokensFromChars(chars = 0) {
  if (typeof chars !== 'number' || chars <= 0 || !Number.isFinite(chars)) {
    return 0;
  }
  return Math.ceil(chars / 4);
}

/**
 * Resolves pricing rates for a given model identifier.
 *
 * @param {string} [model='']
 * @returns {{ inputPerMillion: number, outputPerMillion: number }}
 */
export function resolvePricingRates(model = '') {
  const norm = String(model || '').toLowerCase();
  if (norm.includes('pro')) {
    return AI_PRICING_TIERS['gemini-1.5-pro'];
  }
  if (norm.includes('flash')) {
    return AI_PRICING_TIERS['gemini-1.5-flash'];
  }
  return AI_PRICING_TIERS.default;
}

/**
 * Computes estimated cost in USD for an AI invocation.
 *
 * @param {{
 *   contractId?: string,
 *   inputChars?: number,
 *   outputTokens?: number,
 *   model?: string,
 * }} params
 * @returns {{
 *   contractId: string|null,
 *   model: string,
 *   estimatedInputTokens: number,
 *   outputTokens: number,
 *   totalTokens: number,
 *   costUsd: number,
 *   rates: { inputPerMillion: number, outputPerMillion: number },
 * }}
 */
export function estimateAiCost({
  contractId = null,
  inputChars = 0,
  outputTokens = 0,
  model = 'gemini-1.5-flash',
} = {}) {
  const estimatedInputTokens = estimateTokensFromChars(inputChars);
  const safeOutputTokens = Math.max(0, Number.isFinite(outputTokens) ? Math.floor(outputTokens) : 0);
  const totalTokens = estimatedInputTokens + safeOutputTokens;

  const rates = resolvePricingRates(model);
  const inputCost = (estimatedInputTokens / 1_000_000) * rates.inputPerMillion;
  const outputCost = (safeOutputTokens / 1_000_000) * rates.outputPerMillion;
  const rawCost = inputCost + outputCost;

  return {
    contractId: contractId ? String(contractId) : null,
    model: String(model || 'gemini-1.5-flash'),
    estimatedInputTokens,
    outputTokens: safeOutputTokens,
    totalTokens,
    costUsd: Number(rawCost.toFixed(6)),
    rates,
  };
}
