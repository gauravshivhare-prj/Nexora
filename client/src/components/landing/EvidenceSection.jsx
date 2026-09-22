import { Reveal } from './animation/Reveal.jsx';
import { useStepCycle } from './animation/useStepCycle.js';
import { ExampleLabel, Section, SectionHeading, StateChip } from './Section.jsx';

/**
 * Evidence-based skills — the product's central distinction.
 *
 * "I know React" and "I passed a React assessment" are different claims, and
 * Nexora refuses to render them the same way. Three strengths, with the same
 * wording the signed-in product uses, because a visitor must not arrive
 * inside and find that "supported" meant something softer on the way in.
 *
 * The right-hand panel plays the progression once when scrolled to, rather
 * than showing three static cards: the point is the transition. It stops at
 * the last step, pauses when off screen, and a visitor who clicks a step
 * takes control of it for good.
 *
 * Verified is shown as what it is — reachable only through a passing
 * assessment or a human-passed interview, which Nexora stores but does not
 * yet collect through any screen.
 */
const STRENGTHS = [
  {
    state: 'claimed',
    title: 'Claimed',
    meaning: 'You said so. Nothing has been checked.',
    example: 'React appears in your profile’s skill list.',
  },
  {
    state: 'supported',
    title: 'Supported',
    meaning: 'You pointed at something concrete. Still self-reported.',
    example: 'React is listed among the technologies of a project you built.',
  },
  {
    state: 'verified',
    title: 'Verified',
    meaning: 'An independent check passed.',
    example: 'A passing assessment result, or an interview a human marked as a pass.',
  },
];

/** The sequence the panel plays: each step adds the evidence that moved it. */
const STEPS = [
  {
    state: 'claimed',
    trigger: 'You add React to your profile',
    evidence: [{ source: 'Listed on your profile', detail: 'Self-rated: intermediate' }],
    note: 'Nexora records this, and records that nothing supports it.',
  },
  {
    state: 'supported',
    trigger: 'You add a project that uses React',
    evidence: [
      { source: 'Listed on your profile', detail: 'Self-rated: intermediate' },
      { source: 'Used in a project', detail: 'Campus Events app — React, Node.js' },
    ],
    note: 'Two sources now agree. Still your own account of it — which is why this is not Verified.',
  },
  {
    state: 'verified',
    trigger: 'A passing assessment or interview result arrives',
    evidence: [
      { source: 'Listed on your profile', detail: 'Self-rated: intermediate' },
      { source: 'Used in a project', detail: 'Campus Events app — React, Node.js' },
      { source: 'Passed an assessment', detail: 'Only a pass can produce this' },
    ],
    note: 'The only route to Verified. Nexora stores these results today; the screens that collect them are in development.',
  },
];

export function EvidenceSection() {
  const { ref, step, select } = useStepCycle(STEPS.length, { intervalMs: 2000 });
  const current = STEPS[step];

  return (
    <Section id="evidence" tone="surface" labelledBy="evidence-heading">
      <SectionHeading
        id="evidence-heading"
        eyebrow="Evidence"
        title="A skill you listed and a skill you can prove are not the same skill."
        lead="Every skill in your CareerTwin carries the strength its evidence justifies, and the
          reason for it is always one press away. Nothing is ever upgraded because it sounded
          confident."
      />

      <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
        <ul className="flex flex-col gap-4">
          {STRENGTHS.map((strength, index) => (
            <Reveal
              as="li"
              key={strength.state}
              delay={index * 100}
              className="nx-lift rounded-2xl border border-orange-100 bg-canvas p-5 hover:border-brand/40"
            >
              <div className="flex flex-wrap items-center gap-3">
                <StateChip state={strength.state} />
                <h3 className="text-base font-semibold text-ink">{strength.title}</h3>
              </div>
              <p className="mt-2 text-sm text-ink">{strength.meaning}</p>
              <p className="mt-1.5 text-sm text-ink-muted">{strength.example}</p>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={150}>
          <div
            ref={ref}
            className="rounded-2xl border border-orange-200 bg-canvas p-5 shadow-lg shadow-orange-900/10 sm:p-7"
          >
            <p className="text-xs font-semibold tracking-[0.18em] text-brand-text uppercase">
              How one skill changes state
            </p>

            {/*
              The sequence's controls. Real buttons, so the animation is
              never the only way to reach any of the three states — which is
              also what makes this readable under reduced motion, where the
              panel simply starts at the end.
            */}
            <div className="mt-4 flex flex-wrap gap-2">
              {STEPS.map((candidate, index) => (
                <button
                  key={candidate.state}
                  type="button"
                  onClick={() => select(index)}
                  aria-pressed={index === step}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-200 ${
                    index === step
                      ? 'border-brand bg-brand text-on-brand'
                      : 'border-orange-200 bg-surface text-ink-muted hover:border-brand hover:text-brand-text'
                  }`}
                >
                  {index + 1}. {candidate.state}
                </button>
              ))}
            </div>

            {/*
              `aria-live="polite"` because the panel changes on its own. A
              screen-reader user who cannot see it advance is otherwise
              reading a card that silently contradicts itself.
            */}
            <div aria-live="polite" className="mt-6">
              <p className="text-sm font-medium text-ink-muted">{current.trigger}</p>

              <div className="mt-3 rounded-xl border border-orange-100 bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-base font-semibold text-ink">React</span>
                  {/* Keyed so the chip re-animates when the state changes. */}
                  <StateChip key={current.state} state={current.state} className="nx-pop" />
                </div>

                <ul className="mt-4 flex flex-col gap-2 border-t border-orange-100 pt-3">
                  {current.evidence.map((item) => (
                    <li key={item.source} className="nx-pop text-sm">
                      <p className="font-medium text-ink">{item.source}</p>
                      <p className="text-ink-muted">{item.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-3 text-sm text-ink-muted">{current.note}</p>
            </div>

            <ExampleLabel>
              Illustrative sequence. The states and their meanings are the product’s own.
            </ExampleLabel>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
