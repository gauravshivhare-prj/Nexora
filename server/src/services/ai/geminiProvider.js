/**
 * Concrete Google Gemini implementation of the AiProvider contract.
 *
 * Calls the Gemini REST generateContent endpoint using native fetch, avoiding
 * vendor SDK dependencies while supporting native JSON mode, timeout control,
 * signal propagation, and robust candidate extraction.
 *
 * @typedef {import('./aiProvider.js').AiProvider} AiProvider
 * @typedef {import('./aiProvider.js').AiCompletionRequest} AiCompletionRequest
 * @typedef {import('./aiProvider.js').AiCompletionResult} AiCompletionResult
 */

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

/**
 * How many times a transient failure is retried.
 *
 * Two retries, three attempts in total. Enough to ride out a rate limit or a
 * single bad gateway; few enough that a sustained outage fails while the
 * student is still watching rather than after three minutes of silence.
 */
const MAX_ATTEMPTS = 3;

/** Base delay, doubled per attempt. Small — the caller is holding a request. */
const RETRY_BASE_DELAY_MS = 500;

/**
 * Statuses worth trying again.
 *
 * 429 and 5xx only. A 400 means the request was wrong and will be wrong the
 * second time; a 401 or 403 means the key is bad, and hammering an
 * authentication failure is how a key gets blocked. Retrying either would
 * turn a clear error into a slow one.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits out the backoff, unless there is no point.
 *
 * @returns {Promise<boolean>} True if the caller should try again. False on
 *   the last attempt, or when the overall deadline has already passed —
 *   sleeping through an expired budget only delays the error.
 */
async function waitBeforeRetry(attempt, signal) {
  if (attempt >= MAX_ATTEMPTS) return false;
  if (signal.aborted) return false;

  await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));

  return !signal.aborted;
}

/**
 * Reads an error body, with the key stripped out.
 *
 * The redaction is belt-and-braces now that the key travels in a header:
 * an upstream error is not supposed to echo it back, and this is cheap
 * insurance against the day one does. The result is logged, never returned
 * to a client — `requestCompletion` replaces it with a generic message.
 */
async function readErrorDetails(response, apiKey) {
  let details = '';

  try {
    const body = await response.json();
    details = body.error?.message || JSON.stringify(body);
  } catch {
    try {
      details = await response.text();
    } catch {
      // The body is unreadable. The status code is still worth reporting.
    }
  }

  if (!details) return 'No error details provided';

  return details.replaceAll(apiKey, '[REDACTED]');
}

/**
 * Creates an AiProvider backed by the Google Gemini REST API.
 *
 * @param {object} options
 * @param {string} options.apiKey Google AI Studio API key.
 * @param {string} [options.model] Gemini model identifier (defaults to 'gemini-2.0-flash').
 * @param {number} [options.timeoutMs] Request timeout in milliseconds (defaults to 60000).
 * @param {string} [options.baseUrl] Base URL override for testing or proxies.
 * @returns {AiProvider}
 */
export function createGeminiProvider(options = {}) {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error('Gemini provider requires a non-empty apiKey.');
  }

  const model = options.model?.trim() || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = options.baseUrl?.trim() || DEFAULT_BASE_URL;

  return {
    name: 'gemini',

    /**
     * Sends an extraction or generation request to Gemini.
     *
     * @param {AiCompletionRequest} request
     * @returns {Promise<AiCompletionResult>}
     */
    async complete(request) {
      // No `?key=` on the URL. A query string is the one part of a request
      // that reliably ends up somewhere it should not — proxy access logs,
      // error reports, the `url` field of a thrown fetch error — and a
      // credential there outlives the request that carried it. Gemini
      // accepts the same key as a header, which nothing logs by default.
      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

      const body = {
        contents: [
          {
            role: 'user',
            parts: [{ text: request.user ?? '' }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          /**
           * Zero, deliberately.
           *
           * Every call Nexora makes is an extraction or a restatement of
           * something the student already wrote. There is nothing here that
           * benefits from variety, and a resume that parses differently on
           * two runs would make the grounding warnings impossible to
           * reason about.
           */
          temperature: 0,
        },
      };

      if (typeof request.maxOutputTokens === 'number' && request.maxOutputTokens > 0) {
        body.generationConfig.maxOutputTokens = request.maxOutputTokens;
      }

      if (request.system && typeof request.system === 'string') {
        body.systemInstruction = {
          parts: [{ text: request.system }],
        };
      }

      const payload = JSON.stringify(body);

      /**
       * The timeout covers the whole operation, retries included.
       *
       * Per-attempt timeouts would let three slow attempts add up to three
       * times the budget, and the caller — a student waiting on a resume —
       * has one deadline, not three.
       */
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = request.signal
        ? AbortSignal.any([timeoutSignal, request.signal])
        : timeoutSignal;

      let data;
      let lastTransientError;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        let response;

        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: payload,
            signal,
          });
        } catch (fetchError) {
          // An abort is never retried: the budget is gone either way, and
          // the caller's own cancellation is not a failure to work around.
          if (signal.aborted) {
            if (timeoutSignal.aborted) {
              throw Object.assign(new Error(`Gemini API request timed out after ${timeoutMs}ms.`), { reason: 'timeout' });
            }
            throw Object.assign(new Error('Gemini API request was aborted by the caller.'), { reason: 'aborted' });
          }

          // A connection-level failure is the clearest case for trying again.
          lastTransientError = fetchError;
          if (await waitBeforeRetry(attempt, signal)) continue;
          throw Object.assign(fetchError, { reason: 'network' });
        }

        if (!response.ok) {
          const details = await readErrorDetails(response, apiKey);
          // `reason` and `status` are safe to log; the message may quote the
          // prompt and is not.
          const error = Object.assign(new Error(`Gemini API error (HTTP ${response.status}): ${details}`), {
            reason: 'http',
            status: response.status,
          });

          if (RETRYABLE_STATUSES.has(response.status)) {
            lastTransientError = error;
            if (await waitBeforeRetry(attempt, signal)) continue;
          }

          throw error;
        }

        try {
          data = await response.json();
        } catch (parseError) {
          throw new Error(`Failed to parse Gemini API response as JSON: ${parseError.message}`);
        }

        break;
      }

      // Only reachable when the final attempt was itself retryable.
      if (!data) throw lastTransientError ?? new Error('Gemini API returned no response.');

      const candidate = data.candidates?.[0];
      if (!candidate) {
        const blockReason = data.promptFeedback?.blockReason;
        if (blockReason) {
          throw new Error(`Gemini request was blocked by safety filters: ${blockReason}`);
        }
        throw new Error('Gemini API returned no candidates.');
      }

      if (candidate.finishReason === 'SAFETY') {
        throw new Error('Gemini generation stopped prematurely due to safety filters.');
      }
      if (candidate.finishReason === 'RECITATION') {
        throw new Error('Gemini generation stopped prematurely due to recitation policy.');
      }

      const text = candidate.content?.parts?.[0]?.text;
      if (typeof text !== 'string') {
        throw new Error('Gemini API candidate response contains no text.');
      }

      return {
        text,
        model: data.modelVersion || model,
      };
    },
  };
}
