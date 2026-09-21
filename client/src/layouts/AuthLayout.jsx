import { Link } from 'react-router-dom';

/**
 * Shared frame for the login and register screens.
 *
 * Keeps the brand header, card and footer identical across both, so the two
 * pages hold only their form.
 */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 sm:px-6">
      <header className="animate-rise mb-6 text-center">
        <Link
          to="/"
          className="inline-block rounded-md text-2xl font-bold tracking-tight text-ink transition-colors duration-200 hover:text-brand"
        >
          Nexora
        </Link>
        <p className="mt-1 text-sm text-ink-muted">Career Readiness &amp; Employability</p>
      </header>

      <section
        aria-labelledby="auth-heading"
        className="animate-rise rounded-2xl border border-orange-100 bg-surface p-6 shadow-sm shadow-orange-900/5 sm:p-8"
      >
        <h1 id="auth-heading" className="text-xl font-semibold text-ink">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}

        <div className="mt-6">{children}</div>
      </section>

      {footer ? <p className="mt-5 text-center text-sm text-ink-muted">{footer}</p> : null}
    </main>
  );
}
