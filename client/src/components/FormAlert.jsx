/**
 * Form-level message — the kind a field-level error cannot express (wrong
 * credentials, backend unreachable, "profile saved").
 *
 * `role` differs by tone on purpose. A failure is announced immediately
 * because the user cannot proceed without knowing; a success is announced
 * politely, because interrupting someone mid-sentence to say "saved" is worse
 * than telling them a moment later.
 */
const TONES = {
  error: {
    role: 'alert',
    glyph: '✕',
    className: 'border-red-200 bg-red-50 text-danger-text',
  },
  success: {
    role: 'status',
    glyph: '✓',
    className: 'border-green-200 bg-green-50 text-green-700',
  },
};

/**
 * @param {object} props
 * @param {{ label: string, onClick: () => void }} [props.action] A recovery
 *   action offered inside the alert. Failures that the student can simply
 *   retry should carry one: the control that caused the failure is often
 *   several sections further down a long form.
 */
export function FormAlert({ message, tone = 'error', action }) {
  if (!message) return null;

  const { role, glyph, className } = TONES[tone];

  return (
    <div
      role={role}
      className={`animate-rise mb-5 flex flex-wrap items-start gap-x-2 gap-y-3 rounded-xl border px-4 py-3 text-sm ${className}`}
    >
      <span aria-hidden="true" className="font-bold">
        {glyph}
      </span>
      <p className="min-w-0 flex-1 font-medium">{message}</p>

      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-lg border border-current px-3 py-1 font-semibold transition-colors duration-200 hover:bg-surface/70"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
