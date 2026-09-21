import { PROCESSING_STATUS } from '../../services/resume.service.js';

/**
 * A badge for one processing step — extraction or analysis.
 *
 * The backend keeps the two statuses apart on purpose: a resume whose text
 * was read fine but whose analysis failed is a different problem from one
 * that could not be read at all. The UI keeps them apart too rather than
 * collapsing them into a single "status", which could not say which.
 *
 * Each state carries a glyph as well as a colour, so the badge still reads
 * on a monochrome display or to a colour-blind student.
 */
const PRESENTATION = {
  [PROCESSING_STATUS.PENDING]: {
    label: 'Not started',
    glyph: '•',
    className: 'border-orange-200 bg-orange-50 text-ink-muted',
  },
  [PROCESSING_STATUS.PROCESSING]: {
    label: 'In progress',
    glyph: '◐',
    className: 'border-orange-300 bg-orange-100 text-brand-text',
  },
  [PROCESSING_STATUS.COMPLETED]: {
    label: 'Done',
    glyph: '✓',
    className: 'border-green-200 bg-green-50 text-green-700',
  },
  [PROCESSING_STATUS.FAILED]: {
    label: 'Failed',
    glyph: '✕',
    className: 'border-red-200 bg-red-50 text-danger-text',
  },
};

export function ProcessingStatus({ step, name }) {
  const presentation = PRESENTATION[step.status] ?? PRESENTATION[PROCESSING_STATUS.PENDING];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${presentation.className}`}
    >
      <span aria-hidden="true">{presentation.glyph}</span>
      {name}: {presentation.label}
    </span>
  );
}

/**
 * The reason a step failed, when there is one.
 *
 * Only the server's own display-written messages reach this — it stores
 * nothing else on the document — so it is shown verbatim rather than
 * replaced with a generic line that would tell the student less.
 */
export function StepFailure({ step, children }) {
  if (step.status !== PROCESSING_STATUS.FAILED) return null;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger-text">
      <p className="font-semibold">{children}</p>
      {step.error ? <p className="mt-1 font-medium">{step.error}</p> : null}
    </div>
  );
}
