/**
 * One line in the technical-status panel.
 *
 * Every tone pairs a colour with a distinct glyph and a written state, so the
 * status is never carried by colour alone.
 */

const TONES = {
  ready: { glyph: '✓', dot: 'bg-success', text: 'text-green-700' },
  unknown: { glyph: '?', dot: 'bg-ink-muted', text: 'text-ink-muted' },
  pending: { glyph: '…', dot: 'bg-warning', text: 'text-warning-text' },
  failed: { glyph: '✕', dot: 'bg-danger', text: 'text-danger-text' },
};

export function StatusRow({ label, state, tone = 'unknown', note }) {
  const { glyph, dot, text } = TONES[tone] ?? TONES.unknown;

  return (
    // dt and dd must be direct children of this wrapper for the <dl> content
    // model to hold, so the two-line layout comes from grid placement rather
    // than from nesting them in extra elements.
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 py-3">
      <dt className="col-start-1 row-start-1 text-sm font-medium text-ink">{label}</dt>

      <dd
        className={`col-start-2 row-start-1 flex shrink-0 items-center gap-2 text-sm font-semibold ${text}`}
      >
        <span
          aria-hidden="true"
          className={`flex size-4 items-center justify-center rounded-full text-[10px] leading-none font-bold text-white ${dot}`}
        >
          {glyph}
        </span>
        <span>{state}</span>
      </dd>

      {note ? (
        <dd className="col-start-1 row-start-2 mt-0.5 text-xs leading-relaxed text-ink-muted">
          {note}
        </dd>
      ) : null}
    </div>
  );
}
