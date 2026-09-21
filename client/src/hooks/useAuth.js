import { useContext } from 'react';

import { AuthContext } from '../context/AuthContext.jsx';

/**
 * Reads the session.
 *
 * Throws rather than returning null when used outside the provider: that is
 * a wiring mistake, and failing loudly beats every consumer defending against
 * an undefined session.
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return context;
}
