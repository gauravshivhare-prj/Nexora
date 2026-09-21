import { Link } from 'react-router-dom';

import { ApiConnectionPanel } from '../components/ApiConnectionPanel.jsx';

/**
 * Phase 0 foundation page.
 *
 * Deliberately not a dashboard: it states what Nexora is and proves the
 * frontend can reach the backend. No product data is shown, because none
 * exists yet.
 */
export function FoundationPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-5 py-12 sm:px-6 sm:py-16">
      <header className="animate-rise">
        <p className="text-xs font-semibold tracking-[0.2em] text-brand uppercase">
          Phase 0 · Foundation
        </p>

        <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance text-ink sm:text-5xl">
          Nexora
        </h1>

        <p className="mt-3 text-lg text-pretty text-ink-muted sm:text-xl">
          AI-Powered Career Readiness &amp; Employability Platform
        </p>

        <p className="mt-2 text-base text-pretty text-ink">
          From Student Profile to Career-Ready Candidate
        </p>

        <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-brand">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
          Foundation Ready
        </p>
      </header>

      <nav aria-label="Get started" className="animate-rise mt-8 flex flex-wrap gap-3">
        <Link
          to="/register"
          className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-soft"
        >
          Create an account
        </Link>
        <Link
          to="/login"
          className="rounded-xl border border-orange-200 bg-surface px-5 py-3 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand"
        >
          Sign in
        </Link>
      </nav>

      <div className="mt-10">
        <ApiConnectionPanel />
      </div>

      <footer className="mt-8 text-xs text-ink-muted">
        Product features are not implemented yet. This page verifies the application foundation
        only.
      </footer>
    </main>
  );
}
