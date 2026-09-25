import { ERROR_CODES } from '../../constants/errorCodes.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';

/**
 * The boundary between Nexora's domain logic and whichever model provider is
 * configured.
 *
 * Nothing in the domain imports a vendor SDK. Everything goes through the
 * contract below, so swapping providers — or running two — is a registration
 * change rather than an edit to the resume and CareerTwin services.
 *
 * **No provider ships with Nexora today.** There is deliberately no built-in
 * fallback that returns canned output: a fake provider would make the resume
 * and CareerTwin features look finished while inventing a student's career
 * data, which is the one thing this system must never do. With nothing
 * registered, analysis endpoints answer 503 and say so plainly.
 *
 * @typedef {object} AiCompletionRequest
 * @property {string} system Instructions describing the task and output shape.
 * @property {string} user The content to work on.
 * @property {number} maxOutputTokens Upper bound on the response.
 * @property {AbortSignal} [signal]
 *
 * @typedef {object} AiCompletionResult
 * @property {string} text The raw response. Untrusted — it is parsed and
 *   validated by the caller before any part of it is stored.
 * @property {string} model Identifier of the model that answered, recorded
 *   against the result so an output can be traced to what produced it.
 *
 * @typedef {object} AiProvider
 * @property {string} name Stable key used by AI_PROVIDER to select it.
 * @property {(request: AiCompletionRequest) => Promise<AiCompletionResult>} complete
 */

/** Registered providers, by name. */
const providers = new Map();

/**
 * Which provider is currently selected.
 *
 * Initialised from AI_PROVIDER. A name may be configured before the matching
 * provider is registered — that is a configuration error, but it is reported
 * when analysis is attempted rather than at import time, so a missing
 * provider cannot stop the server from booting and serving everything else.
 */
let activeProviderName = env.aiProviderName;

/**
 * Registers a provider implementation.
 *
 * @param {AiProvider} provider
 */
export function registerAiProvider(provider) {
  if (typeof provider?.name !== 'string' || provider.name.trim() === '') {
    throw new Error('An AI provider must have a non-empty name.');
  }
  if (typeof provider.complete !== 'function') {
    throw new Error(`AI provider "${provider.name}" does not implement complete().`);
  }

  providers.set(provider.name, provider);
  logger.info(`AI provider registered: ${provider.name}`);
}

/**
 * Selects the active provider by name, or `null` for none.
 *
 * @returns {string|null} The previously active name, so a caller that changes
 *   it temporarily can put it back.
 */
export function useAiProvider(name) {
  const previous = activeProviderName;
  activeProviderName = name;
  return previous;
}

/** True when analysis can be attempted at all. Lets a caller check first. */
export function isAiConfigured() {
  return Boolean(activeProviderName && providers.get(activeProviderName));
}

/**
 * Returns the active provider.
 *
 * @returns {AiProvider}
 * @throws {ApiError} 503 when none is configured or registered. A 503 rather
 *   than a 500 because this is a deployment state, not a bug, and it is
 *   correct for a client to retry once the service is configured.
 */
export function resolveAiProvider() {
  if (!activeProviderName) {
    throw ApiError.serviceUnavailable(
      'AI analysis is not available: no AI provider is configured on this deployment.',
      ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
    );
  }

  const provider = providers.get(activeProviderName);
  if (!provider) {
    // The name is echoed because it comes from this deployment's own
    // configuration, not from the request, and naming it is what makes the
    // misconfiguration fixable.
    throw ApiError.serviceUnavailable(
      `AI analysis is not available: the configured provider "${activeProviderName}" is not registered.`,
      ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
    );
  }

  return provider;
}

/**
 * Calls the active provider, normalising every failure mode into one error.
 *
 * A provider's own exceptions — network errors, rate limits, SDK-specific
 * types — must not reach a controller, or every caller would have to know
 * about each vendor's error taxonomy. Only structured facts (error type,
 * reason, upstream status) are logged. The message is neither logged nor
 * returned: it can contain request ids, account details and fragments of
 * the prompt.
 *
 * @param {AiCompletionRequest} request
 * @returns {Promise<AiCompletionResult>}
 * @throws {ApiError} 503 if unconfigured or the provider failed.
 */
export async function requestCompletion(request) {
  const provider = resolveAiProvider();

  let result;
  try {
    result = await provider.complete(request);
  } catch (error) {
    logger.error(`AI provider "${provider.name}" failed`, {
      errorType: error?.name ?? 'UnknownError',
      // Structured facts only. The message can quote the prompt, so it is
      // never logged.
      reason: error?.reason,
      status: Number.isInteger(error?.status) ? error.status : undefined,
    });
    throw ApiError.serviceUnavailable(
      'The AI service could not be reached. Please try again in a moment.',
      ERROR_CODES.AI_PROVIDER_FAILED,
    );
  }

  // A provider that resolves with the wrong shape is as broken as one that
  // throws, and would otherwise surface much later as a confusing parse
  // failure against `undefined`.
  if (typeof result?.text !== 'string' || result.text.trim() === '') {
    logger.error(`AI provider "${provider.name}" returned no text`);
    throw ApiError.serviceUnavailable(
      'The AI service returned an unusable response. Please try again in a moment.',
      ERROR_CODES.AI_PROVIDER_FAILED,
    );
  }

  return { text: result.text, model: result.model ?? provider.name };
}

/** Clears the registry. Exists so a test run does not leak state between suites. */
export function resetAiProviders() {
  providers.clear();
  activeProviderName = env.aiProviderName;
}
