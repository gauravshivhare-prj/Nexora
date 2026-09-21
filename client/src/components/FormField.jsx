import { useId } from 'react';

/**
 * A labelled text input with an accessible error message.
 *
 * Every association a screen reader needs is wired here — label/input,
 * aria-invalid, aria-describedby — so no page can forget one.
 */
export function FormField({
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  hint,
  autoComplete,
  required = true,
  disabled = false,
  ...inputProps
}) {
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

      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded-xl border bg-surface px-4 py-2.5 text-ink transition-colors duration-200 placeholder:text-ink-muted/70 disabled:cursor-not-allowed disabled:bg-orange-50/60 ${
          error
            ? 'border-danger focus-visible:outline-danger'
            : 'border-orange-200 hover:border-orange-300'
        }`}
        {...inputProps}
      />

      {error ? (
        // The leading glyph means the failure is not signalled by colour
        // alone, which matters for colour-blind and monochrome displays.
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger">
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
