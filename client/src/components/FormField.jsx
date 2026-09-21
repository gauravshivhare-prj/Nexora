import { FieldShell, controlClassName } from './FieldShell.jsx';

/**
 * A labelled text input with an accessible error message.
 *
 * Every association a screen reader needs is wired by FieldShell — label and
 * input, aria-invalid, aria-describedby — so no page can forget one.
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
  return (
    <FieldShell label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={describedBy}
          className={controlClassName(invalid)}
          {...inputProps}
        />
      )}
    </FieldShell>
  );
}
