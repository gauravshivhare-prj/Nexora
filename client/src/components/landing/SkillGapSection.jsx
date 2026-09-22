import { Reveal } from './animation/Reveal.jsx';
import { useStepCycle } from './animation/useStepCycle.js';
import { ExampleLabel, Section, SectionHeading, StateChip } from './Section.jsx';

/**
 * The skill gap.
 *
 * A role's requirements measured against the CareerTwin, skill by skill, in
 * the product's four statuses. The section's job is to land one idea: the
 * dangerous status is not `missing` but `claimed`, because that is the one
 * the student thinks is already ticked off.
 *
 * The animation is a single two-step sequence. First the requirements are
 * simply listed; then the ones that are not yet evidenced pull away from the
 * ones that are, which is the same separation the roadmap is built from.
 * Two state changes for the whole section, and it plays only while visible.
 */
const REQUIRED = [
  { skill: 'HTML', status: 'supported' },
  { skill: 'CSS', status: 'supported' },
  { skill: 'JavaScript', status: 'supported' },
  { skill: 'React', status: 'supported' },
  { skill: 'Git', status: 'claimed' },
  { skill: 'Testing', status: 'missing' },
  { skill: 'Accessibility', status: 'missing' },
];

const isGap = (status) => status === 'missing' || status === 'claimed';

const SUMMARY = [
  ['Required missing', '2'],
  ['Required claimed', '1'],
  ['Required supported', '4'],
  ['Preferred missing', '3'],
];

export function SkillGapSection() {
  const { ref, step } = useStepCycle(2, { intervalMs: 1400, startDelayMs: 500 });
  const isSplit = step === 1;

  return (
    <Section tone="surface" labelledBy="gap-heading">
      <SectionHeading
        id="gap-heading"
        eyebrow="Skill gap"
        title="Exactly what is missing — and what only looks covered."
        lead="Pick a role and Nexora measures every skill it asks for against your evidence.
          Four statuses, kept deliberately distinct, because a skill you have merely claimed
          behaves like a gap in an interview."
      />

      <div ref={ref} className="mt-14 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <Reveal>
          <div className="rounded-2xl border border-orange-200 bg-canvas p-5 shadow-lg shadow-orange-900/10 sm:p-7">
            <p className="text-xs font-semibold tracking-[0.18em] text-brand-text uppercase">
              Target role · Frontend Developer
            </p>
            <p className="mt-1 text-sm text-ink-muted">Required skills, against your evidence</p>

            <ul className="mt-5 flex flex-col gap-2">
              {REQUIRED.map((item, index) => {
                const pulled = isSplit && isGap(item.status);

                return (
                  <li
                    key={item.skill}
                    style={{
                      '--nx-delay': `${index * 55}ms`,
                      // The standalone `translate` property, not a transform:
                      // `.nx-scatter` owns `transform` for the entrance, and
                      // two rules fighting over one property is how an
                      // animation ends up silently not happening.
                      translate: pulled ? '10px 0' : '0 0',
                    }}
                    className={`nx-scatter flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 transition-[translate,border-color,background-color] duration-500 ${
                      pulled ? 'border-orange-300 bg-orange-100/70' : 'border-orange-100 bg-surface'
                    }`}
                  >
                    <span className="text-sm font-semibold text-ink">{item.skill}</span>

                    <span className="flex items-center gap-2">
                      <StateChip
                        state={item.status}
                        label={item.status === 'claimed' ? 'Claimed only' : undefined}
                      />
                      {/*
                        Appears with the separation and says what it means.
                        The animation is never the only carrier: the status
                        chip beside it already states the fact.
                      */}
                      <span
                        aria-hidden="true"
                        className={`text-xs font-semibold text-brand-text transition-opacity duration-500 ${
                          pulled ? 'opacity-100' : 'opacity-0'
                        }`}
                      >
                        → roadmap
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <p aria-live="polite" className="mt-5 text-sm text-ink-muted">
              {isSplit
                ? 'Three of the seven are not evidenced yet. Those are the ones the roadmap is built from.'
                : 'Every required skill, at the strength your evidence supports.'}
            </p>
          </div>
        </Reveal>

        <div className="flex flex-col gap-6">
          <Reveal delay={120}>
            <div className="rounded-2xl border border-orange-100 bg-canvas p-5 sm:p-7">
              <p className="text-sm font-semibold text-ink">What that leaves</p>

              <dl className="mt-4 grid grid-cols-2 gap-3">
                {SUMMARY.map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-orange-100 bg-orange-50/40 p-3"
                  >
                    <dt className="text-xs text-ink-muted">{label}</dt>
                    <dd className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{value}</dd>
                  </div>
                ))}
              </dl>

              <ExampleLabel>
                Example figures for one CareerTwin against one role.
              </ExampleLabel>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5 sm:p-7">
              <p className="text-sm font-semibold text-ink">Counts, not a readiness percentage.</p>
              <p className="mt-2 text-sm text-ink-muted">
                Nexora deliberately does not reduce a gap to “you are 60% ready”. One number
                invites you to read it and stop, when the whole value is in knowing which part of
                that 60% is only claimed. Every status carries the evidence behind it, and the
                definitions come from the same place that computed them.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
