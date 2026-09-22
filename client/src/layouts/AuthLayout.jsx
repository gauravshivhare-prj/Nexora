import { Link } from 'react-router-dom';

import { ThemeToggle } from '../components/ThemeToggle.jsx';

/**
 * Shared frame for the login and register screens.
 *
 * Keeps the brand header, card and footer identical across both, so the two
 * pages hold only their form.
 *
 * Visually this is the landing page's vocabulary rather than a plain form
 * page: the same wordmark, the same warm atmospheric wash, the same card
 * treatment and the same theme control. Someone arriving here from the hero's
 * call to action should not feel they have left the product.
 *
 * Nothing structural changed with that: the heading, the labelled card, the
 * footer slot and the `auth-heading` association are the same contract the
 * pages and their tests already depend on.
 */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/*
        The same atmosphere as the hero, at the same cost: two radial
        gradients and a masked grid, no blur filter and nothing animated.
        `aria-hidden` because it is texture, not content.
      */}
      <div aria-hidden="true" className="nx-auth-glow" />

      {/* Top bar: a way back to the public page, and the theme. Both are
          things someone stuck on a sign-in screen reaches for. */}
      <div className="relative mx-auto flex w-full max-w-md items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-ink-muted transition-colors duration-200 hover:text-brand-text"
        >
          <span aria-hidden="true">←</span>
          Back to Nexora
        </Link>

        <ThemeToggle />
      </div>

      <main className="relative mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-md flex-col justify-center px-5 py-10 sm:px-6">
        <header className="animate-rise mb-7 text-center">
          <Link
            to="/"
            aria-label="Nexora — home"
            className="inline-flex items-center gap-2.5 rounded-lg"
          >
            <Wordmark />
          </Link>

          <p className="mt-2.5 text-sm text-ink-muted">
            From student profile to career-ready candidate
          </p>
        </header>

        <section
          aria-labelledby="auth-heading"
          className="animate-rise rounded-2xl border border-orange-200 bg-surface p-6 shadow-xl shadow-orange-900/10 sm:p-8"
        >
          <h1 id="auth-heading" className="text-xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          {subtitle ? <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p> : null}

          <div className="mt-6">{children}</div>
        </section>

        {footer ? <p className="mt-6 text-center text-sm text-ink-muted">{footer}</p> : null}

        {/*
          One line of product truth, so the sign-in screen is not the only
          page in the product that says nothing about what it is for. Wording
          matches the landing page's own claims.
        */}
        <p className="mt-8 text-center text-xs text-ink-muted">
          Evidence-backed skills · explainable career matching · gap-driven roadmap
        </p>
      </main>
    </div>
  );
}

/**
 * The wordmark, matching the landing navbar's: a node with evidence
 * gathering around it. Inline SVG, so it costs no request and inherits the
 * type scale.
 */
function Wordmark() {
  return (
    <>
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-8 shrink-0">
        <circle cx="16" cy="16" r="14" fill="#EA580C" />
        <circle cx="16" cy="16" r="4.4" fill="#FFF7ED" />
        <g stroke="#FFF7ED" strokeWidth="1.6" strokeLinecap="round" opacity="0.9">
          <path d="M16 11.6V6.4" />
          <path d="M19.8 18.2l4.5 2.6" />
          <path d="M12.2 18.2l-4.5 2.6" />
        </g>
        <circle cx="16" cy="6.4" r="2.4" fill="#FFF7ED" />
        <circle cx="24.3" cy="20.8" r="2.4" fill="#FFF7ED" opacity="0.75" />
        <circle cx="7.7" cy="20.8" r="2.4" fill="#FFF7ED" opacity="0.55" />
      </svg>

      <span className="text-xl font-bold tracking-[0.16em] text-ink uppercase">Nexora</span>
    </>
  );
}
