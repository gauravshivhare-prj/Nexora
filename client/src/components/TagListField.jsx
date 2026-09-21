import { useId, useState } from 'react';

import { controlClassName } from './FieldShell.jsx';

/**
 * A list of short free-text values, entered one at a time and shown as chips.
 *
 * Used for career interests and a project's technologies — both lists where
 * the set of valid answers is open, so a fixed dropdown would be wrong.
 *
 * Enter adds the current entry. The keydown handler calls preventDefault
 * because this control lives inside a form, where Enter would otherwise
 * submit the whole profile instead.
 */
export function TagListField({
  label,
  values,
  onChange,
  maxItems,
  maxLength,
  placeholder,
  hint,
  disabled = false,
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [draft, setDraft] = useState('');

  const isFull = values.length >= maxItems;

  function add() {
    const entry = draft.trim();
    if (entry === '' || isFull) return;

    // Case-insensitive, so "React" and "react" do not both appear. The
    // backend applies the same rule; doing it here too means the student sees
    // the result immediately rather than after a save.
    const isDuplicate = values.some((value) => value.toLowerCase() === entry.toLowerCase());
    if (!isDuplicate) onChange([...values, entry]);

    setDraft('');
  }

  function remove(index) {
    onChange(values.filter((_, position) => position !== index));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        <span className="ml-1 font-normal text-ink-muted">(optional)</span>
      </label>

      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
          maxLength={maxLength}
          disabled={disabled || isFull}
          placeholder={isFull ? `Limit of ${maxItems} reached` : placeholder}
          aria-describedby={hintId}
          className={controlClassName(false)}
        />

        <button
          type="button"
          onClick={add}
          disabled={disabled || isFull || draft.trim() === ''}
          className="shrink-0 rounded-xl border border-orange-200 px-4 text-sm font-semibold text-brand transition-colors duration-200 hover:border-brand hover:bg-orange-50 disabled:cursor-not-allowed disabled:border-orange-100 disabled:text-ink-muted"
        >
          Add
        </button>
      </div>

      <p id={hintId} className="text-xs text-ink-muted">
        {hint ?? `Press Enter or choose Add. Up to ${maxItems}.`}
      </p>

      {values.length > 0 ? (
        <ul className="mt-1 flex flex-wrap gap-2">
          {values.map((value, index) => (
            <li
              key={value}
              className="animate-rise flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 py-1 pr-1 pl-3 text-sm text-ink"
            >
              {value}
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={disabled}
                // The visible ✕ is decoration; the accessible name names the
                // entry, so a screen-reader user knows which chip they remove.
                aria-label={`Remove ${value}`}
                className="flex size-5 items-center justify-center rounded-full text-ink-muted transition-colors duration-200 hover:bg-orange-200 hover:text-ink"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
