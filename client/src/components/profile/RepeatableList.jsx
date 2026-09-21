/**
 * Add/remove scaffolding for the list sections — skills, projects and
 * certifications.
 *
 * All three differ only in the fields inside one entry, so the entry itself is
 * a render prop and everything around it (the empty state, the numbering, the
 * remove button, the limit) lives here once.
 *
 * @param {object[]} entries
 * @param {() => object} makeEntry Builds a blank entry when Add is pressed.
 * @param {(entry: object, update: (changes: object) => void, index: number) => JSX.Element} children
 *   `index` is passed explicitly because the caller needs it to look up the
 *   server's error for that row, and searching for the entry by identity
 *   would break the moment two rows held equal values.
 */
export function RepeatableList({
  entries,
  onChange,
  makeEntry,
  maxItems,
  addLabel,
  entryLabel,
  emptyMessage,
  disabled = false,
  children,
}) {
  const isFull = entries.length >= maxItems;

  function updateAt(index, changes) {
    onChange(entries.map((entry, position) => (position === index ? { ...entry, ...changes } : entry)));
  }

  function removeAt(index) {
    onChange(entries.filter((_, position) => position !== index));
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-6 text-center text-sm text-ink-muted">
          {emptyMessage}
        </p>
      ) : null}

      {entries.map((entry, index) => (
        <fieldset
          // Index as key is correct here and nothing else would be: entries
          // have no id, and a field's value is not stable enough to key on
          // while it is being typed into.
          key={index}
          className="animate-rise rounded-xl border border-orange-100 bg-orange-50/30 p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <legend className="text-sm font-semibold text-ink">
              {entryLabel} {index + 1}
            </legend>

            <button
              type="button"
              onClick={() => removeAt(index)}
              disabled={disabled}
              className="rounded-lg px-2 py-1 text-sm font-medium text-ink-muted transition-colors duration-200 hover:bg-red-50 hover:text-danger-text"
            >
              Remove
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {children(entry, (changes) => updateAt(index, changes), index)}
          </div>
        </fieldset>
      ))}

      <div>
        <button
          type="button"
          onClick={() => onChange([...entries, makeEntry()])}
          disabled={disabled || isFull}
          className="rounded-xl border border-orange-200 px-4 py-2.5 text-sm font-semibold text-brand-text transition-colors duration-200 hover:border-brand hover:bg-orange-50 disabled:cursor-not-allowed disabled:border-orange-100 disabled:text-ink-muted"
        >
          {isFull ? `Limit of ${maxItems} reached` : addLabel}
        </button>
      </div>
    </div>
  );
}
