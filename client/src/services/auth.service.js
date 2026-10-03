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

/**
 * POST /api/auth/refresh
 *
 * @returns {Promise<{ user: object, token: string, meta: object }>}
 */
export async function refreshSessionRequest() {
  const body = await post('/api/auth/refresh', {});
  return requireSession(body);
}

/**
 * POST /api/auth/change-password
 *
 * @param {{ currentPassword: string, newPassword: string }} payload
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function changePasswordRequest({ currentPassword, newPassword }) {
  const body = await post('/api/auth/change-password', { currentPassword, newPassword });
  return body?.data ?? body;
}

/**
 * Decodes JWT claims (iat, exp) safely without libraries.
 *
 * @param {string} token
 * @returns {{ sub?: string, iat?: number, exp?: number } | null}
 */
export function parseTokenClaims(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}
