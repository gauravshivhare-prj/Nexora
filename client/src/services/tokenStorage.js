/**
 * Where the access token lives on the client.
 *
 * Choice: localStorage.
 *
 * The honest trade-off — localStorage is readable by any JavaScript running
 * on this origin, so a successful XSS can steal the token. The alternative,
 * an httpOnly cookie, is immune to that but would require the backend to set
 * and read cookies plus CSRF protection, which is a change to the
 * authentication architecture rather than a frontend decision.
 *
 * It is acceptable here because the token is short-lived (1h by default),
 * there are no refresh tokens to steal, and the app renders no user-supplied
 * HTML. Revisit alongside refresh tokens.
 *
 * Isolated in this module so that migration touches one file.
 */

const TOKEN_KEY = 'nexora.auth.token';

/**
 * Storage can throw: Safari private mode and hardened browser settings both
 * reject writes. Auth should degrade to "not remembered across reloads"
 * rather than crashing the app, so every access is guarded.
 */
function safely(operation, fallback = null) {
  try {
    return operation();
  } catch {
    return fallback;
  }
}

/** @returns {string | null} */
export function readToken() {
  return safely(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    return token && token.length > 0 ? token : null;
  });
}

export function writeToken(token) {
  safely(() => window.localStorage.setItem(TOKEN_KEY, token));
}

export function clearToken() {
  safely(() => window.localStorage.removeItem(TOKEN_KEY));
}
