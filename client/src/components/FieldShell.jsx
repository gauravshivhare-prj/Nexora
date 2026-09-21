import { useId } from 'react';

/**
 * The label, error and hint around a form control.
 *
 * Extracted when the profile form added selects and textareas: every control
 * needs the same label/input association, the same aria-invalid and the same
 * aria-describedby, and three copies of that wiring is three chances to get
 * one of them wrong.
 *
 * Children is a function so the control receives the generated id and aria
 * attributes rather than having to invent them.
 *
 * @param {(props: { id: string, describedBy?: string, invalid: boolean }) => JSX.Element} children
 */
export function FieldShell({ label, error, hint, required = true, children }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  // Point at the error when there is one, otherwise the hint. Both would make
  // a screen reader read the hint before the problem.
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {!required ? <span className="ml-1 font-normal text-ink-muted">(optional)</span> : null}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {error ? (
        // The leading glyph means the failure is not signalled by colour
        // alone, which matters for colour-blind and monochrome displays.
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger-text">
          <span aria-hidden="true">✕</span>
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Border and background shared by every control, so a select sits flush with
 * the text input above it.
 */
export function controlClassName(invalid) {
  // Placeholders are at full ink-muted rather than a fade of it: a hint the
  // student cannot read is not a hint.
  return `w-full rounded-xl border bg-surface px-4 py-2.5 text-ink transition-colors duration-200 placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-orange-50/60 ${
    invalid
      ? 'border-danger focus-visible:outline-danger'
      : 'border-orange-200 hover:border-orange-300'
  }`;
}
