import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { ApiRequestError } from '../services/apiClient.js';
import {
  fetchCurrentUser,
  loginRequest,
  logoutRequest,
  registerRequest,
} from '../services/auth.service.js';
import { clearToken, readToken, writeToken } from '../services/tokenStorage.js';

/**
 * Session state for the whole application.
 *
 * One owner of `user` and `token`, so no page keeps its own copy that can
 * drift. Pages call login/register/logout and read isAuthenticated; they
 * never touch storage or the API client directly.
 */

export const AuthContext = createContext(null);

/** Session restore has not finished — protected content must not render yet. */
export const AUTH_STATUS = {
  RESTORING: 'restoring',
  AUTHENTICATED: 'authenticated',
  ANONYMOUS: 'anonymous',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Starts as RESTORING whenever a stored token exists, so the very first
  // render of a protected route shows a loading state instead of briefly
  // redirecting a logged-in user to /login.
  const [status, setStatus] = useState(() =>
    readToken() ? AUTH_STATUS.RESTORING : AUTH_STATUS.ANONYMOUS,
  );

  /** Drops the local session. The backend holds no state to clear. */
  const endSession = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus(AUTH_STATUS.ANONYMOUS);
  }, []);

  const beginSession = useCallback((sessionUser, token) => {
    writeToken(token);
    setUser(sessionUser);
    setStatus(AUTH_STATUS.AUTHENTICATED);
  }, []);

  /**
   * On load, a stored token is only a claim. Verify it against the server
   * before trusting it: it may have expired, or the account may have been
   * deleted or deactivated since it was issued.
   */
  useEffect(() => {
    if (!readToken()) return undefined;

    const controller = new AbortController();

    (async () => {
      try {
        const currentUser = await fetchCurrentUser({ signal: controller.signal });
        if (controller.signal.aborted) return;

        setUser(currentUser);
        setStatus(AUTH_STATUS.AUTHENTICATED);
      } catch (error) {
        if (controller.signal.aborted) return;

        if (error instanceof ApiRequestError && error.isAuthFailure) {
          // The token is genuinely no longer usable — discard it.
          endSession();
          return;
        }

        // A network failure or a 5xx says nothing about the token's validity.
        // Discarding it would log the user out every time the backend
        // hiccups, so treat this as "not authenticated right now" and leave
        // the token in place for the next attempt.
        console.error('Could not verify the stored session:', error);
        setUser(null);
        setStatus(AUTH_STATUS.ANONYMOUS);
      }
    })();

    return () => controller.abort();
  }, [endSession]);

  const login = useCallback(
    async (credentials) => {
      const { user: sessionUser, token } = await loginRequest(credentials);
      beginSession(sessionUser, token);
      return sessionUser;
    },
    [beginSession],
  );

  /**
   * Registers, then logs in with the same credentials.
   *
   * The register endpoint deliberately does not issue a token, so a second
   * call is what establishes the session. Done here rather than in the page
   * so both entry points produce identical session state.
   */
  const register = useCallback(
    async ({ name, email, password }) => {
      await registerRequest({ name, email, password });
      return login({ email, password });
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (error) {
      // The local session must end regardless. Failing to reach the server
      // is not a reason to keep someone logged in on this device.
      console.error('Logout request failed; clearing the local session anyway:', error);
    } finally {
      endSession();
    }
  }, [endSession]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === AUTH_STATUS.AUTHENTICATED,
      isRestoring: status === AUTH_STATUS.RESTORING,
      login,
      register,
      logout,
    }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
