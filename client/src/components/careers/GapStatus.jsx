import { GAP_STATUS, GAP_STATUS_ORDER } from '../../services/career.service.js';

/**
 * Where a student stands on one skill a role asks for.
 *
 * The four statuses are kept visibly distinct because collapsing them is
 * exactly the failure this product exists to prevent: "claimed" looks like a
 * skill on a profile and behaves like a gap in an interview, and a UI that
 * renders it the same as "supported" has undone the analysis.
 */
const PRESENTATION = {
  [GAP_STATUS.MISSING]: {
    label: 'Missing',
    glyph: '✕',
    className: 'border-red-200 bg-red-50 text-danger-text',
  },
  [GAP_STATUS.CLAIMED]: {
    label: 'Claimed only',
    glyph: '○',
    className: 'border-orange-300 bg-orange-100 text-warning-text',
  },
  [GAP_STATUS.SUPPORTED]: {
    label: 'Supported',
    glyph: '◐',
    className: 'border-orange-300 bg-orange-100 text-brand-text',
  },
  [GAP_STATUS.VERIFIED]: {
    label: 'Verified',
    glyph: '✓',
    className: 'border-green-200 bg-green-50 text-green-700',
  },
};

export function GapStatusBadge({ status }) {
  const presentation = PRESENTATION[status];
  if (!presentation) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${presentation.className}`}
    >
      <span aria-hidden="true">{presentation.glyph}</span>
      {presentation.label}
    </span>
  );
}

export function gapStatusLabel(status) {
  return PRESENTATION[status]?.label ?? status;
}

/**
 * The legend, built from the server's own `statusMeanings`.
 *
 * The definitions are not written here. The skill-gap response ships them
 * precisely so a client cannot tell a student something different from what
 * the server meant, and rewording them locally would reintroduce that drift.
 */
export function GapStatusLegend({ statusMeanings }) {
  if (!statusMeanings) return null;

  return (
    <dl className="flex flex-col gap-1.5 rounded-xl border border-orange-100 bg-orange-50/40 p-3 text-xs">
      {GAP_STATUS_ORDER.filter((status) => statusMeanings[status]).map((status) => (
        <div key={status} className="flex flex-wrap items-center gap-2">
          <dt>
            <GapStatusBadge status={status} />
          </dt>
          <dd className="text-ink-muted">{statusMeanings[status]}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The required/preferred counts the backend computed.
 *
 * Rendered as counts. The backend deliberately returns no coverage
 * percentage — "you are 60% ready" invites a student to read one number and
 * stop, when the whole value is in which part of the 60% is merely claimed —
 * and deriving one here would reinstate exactly what it refused to ship.
 */
export function GapSummary({ summary }) {
  const groups = [
    ['Required', summary.required],
    ['Preferred', summary.preferred],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map(([label, counts]) => (
        <div key={label} className="rounded-xl border border-orange-100 bg-orange-50/30 p-4">
          <p className="text-sm font-semibold text-ink">
            {label} <span className="font-normal text-ink-muted">({counts.total})</span>
          </p>

          <dl className="mt-2 flex flex-col gap-1 text-sm">
            {GAP_STATUS_ORDER.map((status) => (
              <div key={status} className="flex items-center justify-between gap-2">
                <dt className="text-ink-muted">{gapStatusLabel(status)}</dt>
                <dd className="font-semibold text-ink">{counts[status]}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
