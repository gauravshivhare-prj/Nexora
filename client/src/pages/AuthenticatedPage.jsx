import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.js';

/**
 * Temporary landing page for a signed-in user.
 *
 * This is NOT the dashboard. It exists to prove the session works end to end
 * and to reach the pages that do exist, and will be replaced once the
 * Dashboard phase has the full picture to show.
 */
export function AuthenticatedPage() {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    // logout() clears the session even if the request fails, and the route
    // guard then redirects — so there is no failure branch to handle here.
    await logout();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-12 sm:px-6">
      <section className="animate-rise rounded-2xl border border-orange-100 bg-surface p-6 shadow-sm shadow-orange-900/5 sm:p-8">
        <p className="text-xs font-semibold tracking-[0.2em] text-brand uppercase">Nexora</p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance text-ink">
          Welcome, {user.name}
        </h1>

        <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-success">
          <span aria-hidden="true">✓</span>
          Authentication successful.
        </p>

        <dl className="mt-6 divide-y divide-orange-100 border-t border-orange-100 text-sm">
          <div className="grid grid-cols-[auto_1fr] gap-x-4 py-3">
            <dt className="font-medium text-ink">Email</dt>
            <dd className="text-right break-all text-ink-muted">{user.email}</dd>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 py-3">
            <dt className="font-medium text-ink">Role</dt>
            <dd className="text-right text-ink-muted capitalize">{user.role}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/profile"
            className="rounded-xl bg-brand px-5 py-3 text-center text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-soft"
          >
            Your profile
          </Link>

          <Link
            to="/resume"
            className="rounded-xl border border-orange-200 bg-surface px-5 py-3 text-center text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text"
          >
            Your resume
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
            className="rounded-xl border border-orange-200 bg-surface px-5 py-3 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:text-ink-muted"
          >
            {isLoggingOut ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-ink-muted">
        Your CareerTwin and roadmap arrive in the next phases.
      </p>
    </main>
  );
}
