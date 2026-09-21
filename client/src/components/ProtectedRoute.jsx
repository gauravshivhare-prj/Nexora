import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.js';

/**
 * Gate for authenticated pages.
 *
 * Three states, deliberately distinct:
 *  - restoring    → a loading screen. Redirecting here would bounce a
 *                   logged-in user to /login on every refresh.
 *  - anonymous    → redirect to /login, remembering where they were headed.
 *  - authenticated→ render the page.
 *
 * Protected content is never rendered before verification finishes.
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, isRestoring } = useAuth();
  const location = useLocation();

  if (isRestoring) return <SessionLoading />;

  if (!isAuthenticated) {
    // `replace` keeps the protected URL out of history, so Back does not
    // return to a page the user cannot see. `state` lets /login send them
    // where they were going once they sign in.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function SessionLoading() {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5"
      aria-busy="true"
    >
      {/* aria-hidden: the spinner is decoration; the text below is the message. */}
      <span
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-2 border-orange-200 border-t-brand"
      />
      <p role="status" className="text-sm font-medium text-ink-muted">
        Restoring your session…
      </p>
    </main>
  );
}
