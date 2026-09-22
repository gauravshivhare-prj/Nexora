import { Reveal } from './animation/Reveal.jsx';
import { useInView } from './animation/useInView.js';
import { ExampleLabel, Section, SectionHeading, StateChip } from './Section.jsx';

/**
 * What a CareerTwin is.
 *
 * The section a visitor has to understand for the rest of the page to mean
 * anything: everything downstream — matches, gaps, roadmap — is computed
 * against this one model, never against a form.
 *
 * Six inputs on the left, the twin on the right, and a set of connectors
 * drawn between them as the section arrives. The connectors are SVG paths
 * whose stroke draws in; the panels are plain layout, so the diagram
 * reflows at any width without the drawing needing to know.
 */
const INPUTS = [
  { label: 'Profile', detail: 'Skills, education, interests, target roles' },
  { label: 'Projects', detail: 'What you built, and with what' },
  { label: 'Certifications', detail: 'What they actually cover' },
  { label: 'Resume', detail: 'Analysed, then reconciled with the rest' },
  { label: 'Assessments', detail: 'Passing results only', planned: true },
  { label: 'AI interviews', detail: 'Advisory — a human pass is required', planned: true },
];

/** The four indicators the CareerTwin endpoint actually returns. */
const INDICATORS = [
  ['Skills', '18'],
  ['Claimed only', '7'],
  ['Supported', '9'],
  ['Verified', '2'],
];

export function CareerTwinSection() {
  return (
    <Section id="career-twin" tone="warm" labelledBy="career-twin-heading">
      <SectionHeading
        id="career-twin-heading"
        eyebrow="CareerTwin"
        title="Your career is more than a resume."
        lead="A CareerTwin is one canonical model of you: every skill Nexora can find, merged
          across sources, each carried at the strength its evidence justifies. It is not a
          profile you fill in — it is built from what you have already done."
      />

      <div className="relative mt-14 grid gap-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-4">
        <Reveal>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {INPUTS.map((input, index) => (
              <li
                key={input.label}
                style={{ '--nx-delay': `${index * 60}ms` }}
                className={`nx-scatter nx-lift flex items-start gap-3 rounded-xl border bg-surface p-3.5 shadow-sm shadow-orange-900/5 ${
                  input.planned
                    ? 'border-dashed border-ink-muted/30'
                    : 'border-orange-100 hover:border-brand/40'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1 size-2 shrink-0 rounded-full ${
                    input.planned ? 'bg-ink-muted/40' : 'bg-brand'
                  }`}
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{input.label}</span>
                    {input.planned ? (
                      <span className="rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-warning-text">
                        In development
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{input.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Converge />

        <Reveal delay={220}>
          <div className="rounded-2xl border border-orange-200 bg-surface p-6 shadow-lg shadow-orange-900/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-brand-text uppercase">
                  CareerTwin
                </p>
                <p className="mt-1 text-lg font-bold tracking-tight text-ink">
                  One model, four strengths
                </p>
              </div>
              {/* The twin as a mark: sources resolving to one centre. An
                  empty tinted square here read as a missing image. */}
              <svg
                aria-hidden="true"
                viewBox="0 0 40 40"
                className="size-10 shrink-0"
                fill="none"
                stroke="#EA580C"
                strokeWidth="1.5"
              >
                <circle cx="20" cy="20" r="18" strokeOpacity="0.2" />
                <circle cx="20" cy="20" r="11" strokeOpacity="0.35" />
                <circle cx="20" cy="20" r="4.5" fill="#EA580C" stroke="none" />
                <circle cx="20" cy="2" r="2.5" fill="#F97316" stroke="none" />
                <circle cx="35.6" cy="29" r="2.5" fill="#F97316" stroke="none" opacity="0.7" />
                <circle cx="4.4" cy="29" r="2.5" fill="#F97316" stroke="none" opacity="0.5" />
              </svg>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3">
              {INDICATORS.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-orange-100 bg-orange-50/40 p-3">
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex flex-wrap gap-2">
              <StateChip state="claimed" />
              <StateChip state="supported" />
              <StateChip state="verified" />
            </div>

            <p className="mt-5 border-t border-orange-100 pt-4 text-sm text-ink-muted">
              Add a project or a certificate and your twin is marked out of date, with the reason
              why. Rebuilding it re-derives every match, gap and roadmap step from the new
              evidence — nothing downstream is a stored opinion.
            </p>

            <ExampleLabel>Example indicators — not real student data.</ExampleLabel>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/**
 * The connectors between the inputs and the twin.
 *
 * Six curves converging on a point. Hidden below `lg`, where the layout
 * stacks and a horizontal connector would be pointing at nothing — a diagram
 * that lies about the layout is worse than no diagram.
 */
function Converge() {
  const paths = [8, 25, 42, 58, 75, 92];
  const [ref, isInView] = useInView({ threshold: 0.2 });

  return (
    <div
      ref={ref}
      aria-hidden="true"
      // The same attribute the hero graph uses, so one CSS rule draws every
      // connector on the page.
      data-graph-drawn={isInView ? 'true' : 'false'}
      className="hidden w-24 self-stretch lg:block"
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full">
        {paths.map((y, index) => (
          <path
            key={y}
            d={`M 0 ${y} C 45 ${y} 55 50 100 50`}
            fill="none"
            stroke="#EA580C"
            strokeOpacity="0.35"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
            className="nx-edge"
            style={{ '--nx-length': 200, '--nx-delay': `${180 + index * 80}ms` }}
          />
        ))}
      </svg>
    </div>
  );
}
