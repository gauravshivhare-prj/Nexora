import { FieldShell, controlClassName } from './FieldShell.jsx';

/**
 * A labelled dropdown.
 *
 * A native <select> rather than a custom listbox: it is keyboard accessible,
 * screen-reader correct and touch-friendly without a line of code, and the
 * profile form has nothing a custom widget would do better.
 *
 * @param {{ value: string, label: string }[]} options
 * @param {string} [placeholder] Shown as a disabled-value first option, for an
 *   optional field that has not been answered yet.
 */
export function FormSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  hint,
  required = true,
  disabled = false,
}) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          disabled={disabled}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={describedBy}
          className={controlClassName(invalid)}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}
