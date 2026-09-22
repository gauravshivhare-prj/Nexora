import { Reveal } from './animation/Reveal.jsx';

/**
 * The furniture every landing section shares.
 *
 * Collected here so that spacing, width and heading rhythm are decided once.
 * Fourteen sections each choosing their own vertical padding is how a page
 * stops feeling designed.
 */

/**
 * One section of the narrative.
 *
 * `id` is required on the sections the navigation and the hero's secondary
 * CTA scroll to; `scroll-mt` keeps the sticky navbar from covering the
 * heading when it is jumped to.
 */
export function Section({ id, className = '', children, labelledBy, tone = 'canvas' }) {
  const tones = {
    canvas: 'bg-canvas',
    surface: 'bg-surface',
    warm: 'bg-gradient-to-b from-canvas via-orange-50/70 to-canvas',
  };

  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`relative scroll-mt-20 overflow-hidden px-5 py-20 sm:px-6 sm:py-28 ${tones[tone]} ${className}`}
    >
      <div className="relative mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

/** The small capitalised label that names the stage of the story. */
export function Eyebrow({ children, className = '' }) {
  return (
    <p
      className={`text-xs font-semibold tracking-[0.22em] text-brand-text uppercase ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * A section's heading block.
 *
 * The heading level is passed in rather than hardcoded, because the document
 * outline is the page's structure for a screen reader and every section here
 * is a sibling of the others at level 2.
 */
export function SectionHeading({ id, eyebrow, title, lead, align = 'left', children }) {
  const alignment = align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl';

  return (
    <Reveal className={alignment}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}

      <h2
        id={id}
        className="mt-3 text-3xl font-bold tracking-tight text-balance text-ink sm:text-4xl"
      >
        {title}
      </h2>

      {lead ? <p className="mt-4 text-lg text-pretty text-ink-muted">{lead}</p> : null}

      {children}
    </Reveal>
  );
}

/**
 * A chip for one of the product's four skill states.
 *
 * The glyphs and wording match SkillEvidence and GapStatus in the signed-in
 * product exactly. A visitor who signs up should meet the same vocabulary on
 * the inside — and, more importantly, the landing page must not soften
 * "claimed" into something that sounds checked.
 */
const STATE_PRESENTATION = {
  missing: { label: 'Missing', glyph: '✕', className: 'border-red-200 bg-red-50 text-danger-text' },
  claimed: {
    label: 'Claimed',
    glyph: '○',
    className: 'border-orange-200 bg-orange-50 text-ink-muted',
  },
  supported: {
    label: 'Supported',
    glyph: '◐',
    className: 'border-orange-300 bg-orange-100 text-brand-text',
  },
  verified: {
    label: 'Verified',
    glyph: '✓',
    className: 'border-green-200 bg-green-50 text-green-700',
  },
};

export function StateChip({ state, label, className = '' }) {
  const presentation = STATE_PRESENTATION[state];
  if (!presentation) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${presentation.className} ${className}`}
    >
      <span aria-hidden="true">{presentation.glyph}</span>
      {label ?? presentation.label}
    </span>
  );
}

export const STATE_LABELS = STATE_PRESENTATION;

/**
 * "Available now" / "In development".
 *
 * Used wherever the page describes a stage of the career-readiness loop that
 * the backend does not yet serve. Assessments and AI interviews have a
 * storage contract but no UI and no question generation; opportunity
 * matching has neither. Saying so is not a caveat bolted on at the end — it
 * is the difference between a product page and a pitch.
 */
export function AvailabilityTag({ available, className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        available
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-orange-200 bg-orange-50 text-warning-text'
      } ${className}`}
    >
      <span aria-hidden="true" className="text-[9px]">
        {available ? '●' : '◔'}
      </span>
      {available ? 'Available now' : 'In development'}
    </span>
  );
}

/** A caption marking example data as an illustration, never as the visitor's. */
export function ExampleLabel({ children = 'Illustrative example — not your data' }) {
  return (
    <p className="mt-3 text-xs text-ink-muted">
      <span aria-hidden="true" className="mr-1.5">
        ⓘ
      </span>
      {children}
    </p>
  );
}
