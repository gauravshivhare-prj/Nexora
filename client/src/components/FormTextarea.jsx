import { FieldShell, controlClassName } from './FieldShell.jsx';

/**
 * A labelled multi-line input with a live character count.
 *
 * The counter is aria-live="polite" and only announces once the limit is
 * close, so a screen-reader user hears a warning in time to act instead of a
 * number after every keystroke.
 */
export function FormTextarea({
  label,
  value,
  onChange,
  error,
  hint,
  maxLength,
  rows = 4,
  required = false,
  disabled = false,
}) {
  const remaining = maxLength ? maxLength - value.length : null;
  // Roughly the last tenth of the allowance — enough warning to finish a
  // sentence, not so much that the counter is always shouting.
  const isNearLimit = remaining !== null && remaining <= maxLength / 10;

  return (
    <FieldShell label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <>
          <textarea
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={rows}
            maxLength={maxLength}
            required={required}
            disabled={disabled}
            aria-invalid={invalid ? 'true' : undefined}
            aria-describedby={describedBy}
            className={`${controlClassName(invalid)} resize-y`}
          />

          {maxLength ? (
            <p
              aria-live={isNearLimit ? 'polite' : 'off'}
              className={`text-right text-xs ${isNearLimit ? 'font-medium text-warning-text' : 'text-ink-muted'}`}
            >
              {remaining} characters left
            </p>
          ) : null}
        </>
      )}
    </FieldShell>
  );
}
