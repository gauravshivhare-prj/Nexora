/**
 * The single place the frontend talks to the Nexora backend.
 *
 * Components never call `fetch` directly: they call a feature service, which
 * calls `request()` here. That keeps the base URL, timeout, error shape and
 * response parsing in one file.
 */

/** How long to wait before treating a request as unreachable. */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * The configured backend origin, or null when VITE_API_URL is missing.
 *
 * There is deliberately no fallback URL: a hardcoded default would send
 * requests somewhere the developer never configured and fail confusingly.
 * Resolved lazily rather than thrown at import time so a misconfiguration
 * surfaces in the UI's error state instead of a blank page.
 */
export function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (!configured) return null;

  // Tolerate a trailing slash in config so paths can always start with "/".
  return configured.replace(/\/+$/, '');
}

/**
 * Error thrown by every failed request, so callers branch on one type.
 *
 * `message` is written to be shown to a user as-is. `cause` keeps the original
 * error for console diagnostics only — it is never rendered.
 */
export class ApiRequestError extends Error {
  constructor(message, { status = null, errorCode = null, cause = null } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.errorCode = errorCode;
    this.cause = cause;
  }
}

/** Reads a JSON body, returning null when the response isn't JSON at all. */
async function readJsonBody(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Performs a request against the Nexora API.
 *
 * @param {string} path Path beginning with "/", e.g. "/api/health".
 * @param {RequestInit} [options]
 * @returns {Promise<unknown>} The parsed JSON body.
 * @throws {ApiRequestError} On network failure, timeout, or a non-2xx status.
 */
export async function request(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new ApiRequestError(
      'The backend address is not configured. Copy client/.env.example to client/.env, set VITE_API_URL, then restart the dev server.',
    );
  }

  const { signal, ...rest } = options;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  // Combine the caller's cancellation (e.g. unmount) with our own timeout.
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      // Express sends an ETag, so the browser would happily revalidate and
      // replay a cached body. For a liveness check that is actively wrong:
      // a stale 200 would report "connected" while the server is down.
      cache: 'no-store',
      headers: { Accept: 'application/json', ...rest.headers },
      ...rest,
      signal: abortSignal,
    });
  } catch (error) {
    // Re-throw caller-initiated cancellation untouched: it is not a failure.
    if (signal?.aborted) throw error;

    if (error.name === 'TimeoutError') {
      throw new ApiRequestError(
        `The request to ${baseUrl} timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
        { cause: error },
      );
    }

    // fetch() rejects with the same opaque TypeError for a refused connection,
    // a DNS failure and a blocked CORS response, so the three causes cannot be
    // told apart here. The message lists them rather than asserting one.
    throw new ApiRequestError(
      `Could not reach the Nexora backend at ${baseUrl}. Check that the server is running, that VITE_API_URL is correct, and that this origin is allowed by the server's CLIENT_URL setting.`,
      { cause: error },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    // The backend's error middleware returns { success, message, errorCode }.
    // Fall back to the status text when the response came from elsewhere.
    throw new ApiRequestError(body?.message ?? `Request failed with status ${response.status}.`, {
      status: response.status,
      errorCode: body?.errorCode ?? null,
    });
  }

  if (body === null) {
    throw new ApiRequestError('The backend returned a response that was not valid JSON.', {
      status: response.status,
    });
  }

  return body;
}
