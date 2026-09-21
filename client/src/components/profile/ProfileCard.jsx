/**
 * One titled section of the profile form.
 *
 * A <section> with an <h2> rather than a styled <div>, so the page has a real
 * heading outline a screen-reader user can navigate by.
 */
export function ProfileCard({ title, description, children }) {
  return (
    <section className="animate-rise rounded-2xl border border-orange-100 bg-surface p-5 shadow-sm shadow-orange-900/5 sm:p-7">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}

      <div className="mt-5">{children}</div>
    </section>
  );
}
