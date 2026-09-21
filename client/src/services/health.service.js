import { ApiRequestError, request } from './apiClient.js';

/** Backend health endpoint. Matches server/src/routes/health.routes.js. */
const HEALTH_PATH = '/api/health';

/**
 * Calls GET /api/health and validates the response before returning it.
 *
 * The backend answers with `{ success, message, environment }`. A 200 alone is
 * not proof of health — anything could be listening on that port — so the body
 * is checked rather than assumed.
 *
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ message: string, environment: string | null }>}
 * @throws {ApiRequestError}
 */
export async function fetchApiHealth({ signal } = {}) {
  const body = await request(HEALTH_PATH, { signal });

  if (body?.success !== true) {
    throw new ApiRequestError(
      'The backend responded, but did not report itself as healthy.',
      { errorCode: body?.errorCode ?? null },
    );
  }

  return {
    message: typeof body.message === 'string' ? body.message : 'Nexora API is healthy',
    environment: typeof body.environment === 'string' ? body.environment : null,
  };
}
