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
    className: 'border-red-200 bg-red-50 text-danger',
  },
  success: {
    role: 'status',
    glyph: '✓',
    className: 'border-green-200 bg-green-50 text-green-700',
  },
};

export function FormAlert({ message, tone = 'error' }) {
  if (!message) return null;

  const { role, glyph, className } = TONES[tone];

  return (
    <div
      role={role}
      className={`animate-rise mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${className}`}
    >
      <span aria-hidden="true" className="font-bold">
        {glyph}
      </span>
      <p className="font-medium">{message}</p>
    </div>
  );
}
