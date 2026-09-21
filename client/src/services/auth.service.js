import { post, request } from './apiClient.js';

/**
 * Authentication calls against the Nexora API.
 *
 * Every response is unwrapped and shape-checked here, so components receive
 * `{ user, token }` rather than the raw envelope and never reach into
 * `body.data.user` themselves.
 */

/** Throws if the backend answered 2xx with something unusable. */
function requireUser(body) {
  const user = body?.data?.user;
  if (!user?.id) {
    throw new Error('The backend returned an unexpected response shape.');
  }
  return user;
}

function requireSession(body) {
  const user = requireUser(body);
  const { token } = body.data;

  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('The backend did not return an access token.');
  }
  return { user, token };
}

/**
 * POST /api/auth/register
 *
 * @param {{ name: string, email: string, password: string }} credentials
 * @returns {Promise<{ user: object }>} Registration does not issue a token.
 */
export async function registerRequest({ name, email, password }) {
  const body = await post('/api/auth/register', { name, email, password }, { auth: false });
  return { user: requireUser(body) };
}

/**
 * POST /api/auth/login
 *
 * @returns {Promise<{ user: object, token: string }>}
 */
export async function loginRequest({ email, password }) {
  const body = await post('/api/auth/login', { email, password }, { auth: false });
  return requireSession(body);
}

/**
 * POST /api/auth/logout
 *
 * The backend is stateless and does not revoke the token; this call exists so
 * the server can log the event and so the contract stays honest. The client
 * discarding its token is what actually ends the session.
 */
export function logoutRequest() {
  return post('/api/auth/logout', {});
}

/**
 * GET /api/auth/me — used to restore a session on page load.
 *
 * @returns {Promise<object>} The current user.
 */
export async function fetchCurrentUser({ signal } = {}) {
  const body = await request('/api/auth/me', { signal });
  return requireUser(body);
}
