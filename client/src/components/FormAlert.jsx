/**
 * Form-level failure message — the one a field-level error cannot express
 * (wrong credentials, backend unreachable).
 *
 * role="alert" so it is announced the moment it appears, without moving focus.
 */
export function FormAlert({ message }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="animate-rise mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
    >
      <span aria-hidden="true" className="font-bold">
        ✕
      </span>
      <p className="font-medium">{message}</p>
    </div>
  );
}
