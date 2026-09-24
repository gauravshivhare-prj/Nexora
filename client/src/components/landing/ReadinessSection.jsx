import { Reveal } from './animation/Reveal.jsx';
import { Section, SectionHeading } from './Section.jsx';

/**
 * Readiness.
 *
 * The section most likely to be a lie on a page like this, so it is written
 * as a refusal: Nexora does not publish a readiness score, and this says so
 * plainly rather than showing a ring at 72% and hoping nobody signs up to
 * check. Readiness here is the composition of your evidence — which is both
 * what the product actually computes and the more useful answer.
 *
 * The visual is five contributing inputs whose bars fill on reveal, feeding
 * one panel. Bars are `scaleX`, so nothing reflows.
 */
const CONTRIBUTIONS = [
  {
    label: 'Skills with project evidence',
    state: 'Supported',
    fill: 0.62,
    available: true,
  },
  { label: 'Skills you have only claimed', state: 'Claimed', fill: 0.38, available: true },
  { label: 'Projects and certifications on file', state: 'Sources', fill: 0.55, available: true },
  { label: 'Assessments passed', state: 'Verified', fill: 0.12, available: false },
  { label: 'Interviews passed by a human', state: 'Verified', fill: 0.08, available: false },
];

export function ReadinessSection() {
  return (
    <Section tone="surface" labelledBy="readiness-heading">
      <SectionHeading
        id="readiness-heading"
        eyebrow="Career readiness"
        title="Readiness is the state of your evidence, not a number we made up."
        lead="There is no single Nexora score. What you get instead is the composition — how much
          of what a role asks for you can evidence, how much you have only claimed, and what
          would change either."
        align="center"
      />

      <div className="mt-14 grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-14">
        <Reveal>
          <ul className="flex flex-col gap-4">
            {CONTRIBUTIONS.map((item, index) => (
              <li key={item.label}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{item.label}</span>
                  <span
                    className={`text-xs font-semibold ${
                      item.available ? 'text-ink-muted' : 'text-warning-text'
                    }`}
                  >
                    {item.available ? item.state : `${item.state} · in development`}
                  </span>
                </div>

                <span
                  aria-hidden="true"
                  className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-orange-100"
                >
                  <span
                    className={`nx-bar block h-full w-full rounded-full ${
                      item.available ? 'bg-brand' : 'bg-ink-muted/35'
                    }`}
                    style={{ '--nx-fill': item.fill, '--nx-delay': `${index * 90}ms` }}
                  />
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs text-ink-muted">
            <span aria-hidden="true" className="mr-1.5">
              ⓘ
            </span>
            Illustrative proportions for one example CareerTwin. The bottom two routes are the
            only ones that can produce Verified, and the screens that collect them are in
            development.
          </p>
        </Reveal>

        <Reveal delay={150}>
          <div className="rounded-2xl border border-orange-200 bg-canvas p-6 shadow-lg shadow-orange-900/10 sm:p-8">
            <p className="text-xs font-semibold tracking-[0.18em] text-brand-text uppercase">
              What you can say in an interview
            </p>

            <ul className="mt-5 flex flex-col gap-3 text-sm">
              {[
                'Nine of my skills are backed by something I built.',
                'Seven are still only claimed — and I know which seven.',
                'For the role I am targeting, one required skill is missing.',
                'Here is the plan that closes the gaps, and how each one gets evidenced.',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-ink">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                  {line}
                </li>
              ))}
            </ul>

            <p className="mt-6 border-t border-orange-100 pt-4 text-sm text-ink-muted">
              That is what readiness is for. A percentage cannot be said out loud to anyone.
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
