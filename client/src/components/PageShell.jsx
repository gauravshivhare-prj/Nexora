import { Link } from 'react-router-dom';

/**
 * Frame shared by the full-width authenticated pages.
 *
 * Exists so every state of a page — loading, error, empty, loaded — lines up
 * at the same width and padding. A skeleton that sits at a different width
 * from the content it stands in for makes the page jump when data arrives.
 */
export function PageShell({ children, width = 'max-w-3xl' }) {
  return <main className={`mx-auto w-full ${width} px-5 py-10 sm:px-6 sm:py-14`}>{children}</main>;
}

/**
 * The heading block: a way back, the brand, a title and one line of context.
 *
 * The back link is a real <Link> rather than history.back(), so it behaves
 * the same whether the page was reached by navigation or opened directly.
 */
export function PageHeader({ backTo = '/app', backLabel = 'Back', title, children, actions }) {
  return (
    <header className="animate-rise mb-6">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors duration-200 hover:text-brand-text"
      >
        <span aria-hidden="true">←</span>
        {backLabel}
      </Link>

      <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-brand-text uppercase">
        Nexora
      </p>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance text-ink sm:text-3xl">
            {title}
          </h1>
          {children ? <p className="mt-2 text-sm text-ink-muted">{children}</p> : null}
        </div>

        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** A titled panel. Matches ProfileCard so the two pages read as one product. */
export function Card({ title, description, children, actions }) {
  return (
    <section className="animate-rise rounded-2xl border border-orange-100 bg-surface p-5 shadow-sm shadow-orange-900/5 sm:p-7">
      {title ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
            {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
        </div>
      ) : null}

      {children}
    </section>
  );
}

/**
 * The state a page shows when it could not load.
 *
 * Always carries a retry: a failed load with no way to try again leaves
 * reloading the whole browser tab as the only recovery, which loses
 * everything else the student had on screen.
 */
export function ErrorState({ title, message, onRetry, retryLabel = 'Try again' }) {
  return (
    <div
      role="alert"
      className="animate-rise rounded-2xl border border-red-200 bg-surface p-6 text-center sm:p-8"
    >
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="mt-2 text-sm text-ink-muted">{message}</p>

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Placeholder for a section with nothing in it yet. */
export function EmptyState({ children }) {
  return (
    <p className="rounded-xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-6 text-center text-sm text-ink-muted">
      {children}
    </p>
  );
}

/**
 * Skeleton loading blocks.
 *
 * `role="status"` with an sr-only line, because a screen reader gets nothing
 * at all from a pulsing grey rectangle.
 */
export function LoadingState({ label, rows = 3 }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <p role="status" className="sr-only">
        {label}
      </p>

      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="rounded-2xl border border-orange-100 bg-surface p-6">
          <div className="h-5 w-32 animate-pulse rounded bg-orange-100" />
          <div className="mt-5 h-11 animate-pulse rounded-xl bg-orange-50" />
        </div>
      ))}
    </div>
  );
}
