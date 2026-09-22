/**
 * Primary form action.
 *
 * Disabled while submitting, which is what actually prevents the duplicate
 * submissions the UX rules call out; aria-busy tells assistive tech the same.
 */
export function SubmitButton({ isSubmitting, busyLabel, children }) {
  return (
    <button
      type="submit"
      disabled={isSubmitting}
      aria-busy={isSubmitting}
      className="w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-colors duration-200 hover:bg-brand-soft disabled:cursor-not-allowed disabled:bg-ink-muted"
    >
      {isSubmitting ? busyLabel : children}
    </button>
  );
}
