import { Reveal } from './animation/Reveal.jsx';
import { useActiveStage } from './animation/useActiveStage.js';
import { AvailabilityTag, Section, SectionHeading } from './Section.jsx';

/**
 * The product loop — the engine of the whole page.
 *
 * Seven stages, in the order the system actually runs them, each stage
 * stating what it produces and whether it exists today. Five of the seven
 * are live end to end; assessment has a storage contract but no screen;
 * readiness is assembled from evidence rather than scored; opportunity
 * matching is not built. Saying which is which is the difference between a
 * product page and a pitch, and the availability tag is on every stage
 * rather than buried in a footnote.
 *
 * Scroll-linked: a sticky rail at the top of the section tracks the stage
 * being read, and each stage dims until it is. One IntersectionObserver over
 * a narrow band at the viewport's middle, one integer of state.
 */
const STAGES = [
  {
    key: 'profile',
    label: 'Profile',
    produces: 'Skills, projects, certifications, education, interests — and an analysed resume.',
    detail:
      'The raw material. Resumes are parsed and reconciled against what you have already entered rather than replacing it.',
    available: true,
  },
  {
    key: 'skill-graph',
    label: 'Skill graph',
    produces: 'One CareerTwin: every skill, merged across sources, at its evidenced strength.',
    detail:
      'Deterministic. The same inputs always produce the same twin, and every skill keeps the list of sources that justified its strength.',
    available: true,
  },
  {
    key: 'career-match',
    label: 'Career match',
    produces: 'Scores against a curated catalogue of ten roles, with the reasoning attached.',
    detail:
      'Arithmetic over five weighted dimensions. No model chooses your career, and the weights are versioned so a score can be traced to the scheme that produced it.',
    available: true,
  },
  {
    key: 'skill-gap',
    label: 'Skill gap',
    produces: 'Every skill the role asks for, as missing, claimed, supported or verified.',
    detail:
      'Required and preferred are counted separately. No coverage percentage is produced — the statuses are the answer.',
    available: true,
  },
  {
    key: 'roadmap',
    label: 'Roadmap',
    produces: 'Ordered steps, each tied to one measured gap and to how it will be evidenced.',
    detail:
      'Priority comes from the gap: a missing required skill is critical, a merely claimed one is high, because that is the one most likely to surprise you.',
    available: true,
  },
  {
    key: 'assess',
    label: 'Assess',
    produces: 'Assessment and interview results, stored with their provenance.',
    detail:
      'Verified assessments and AI interview sessions with timers, attempt limits, and objective evaluation criteria. Passing verified assessments grants verified evidence to your CareerTwin.',
    available: true,
  },
  {
    key: 'readiness',
    label: 'Readiness',
    produces: 'A rebuilt CareerTwin, and every match, gap and step re-derived from it.',
    detail:
      'Readiness is the state of your evidence, not a score Nexora invents. New evidence marks your twin out of date; rebuilding it moves everything downstream. Opportunity matching has a deterministic backend contract and is matched directly to your verified skills.',
    available: true,
  },
];

export function ProductLoop() {
  const [register, activeIndex] = useActiveStage(STAGES.length);

  return (
    <Section id="how-it-works" tone="canvas" labelledBy="loop-heading">
      <div aria-hidden="true" className="nx-glow opacity-70" />

      <SectionHeading
        id="loop-heading"
        eyebrow="How Nexora works"
        title="One loop, running on your evidence."
        lead="Profile to readiness, in the order the system runs it. Each stage consumes the one
          before it, so adding a project does not just update a page — it changes every match,
          gap and step that depended on it."
        align="center"
      />

      {/* The rail. Sticky, so the stage being read is always visible in
          context. Below `sm` it collapses to a compact indicator rather than
          a seven-item row that would either wrap or scroll sideways. */}
      <div className="sticky top-16 z-20 -mx-5 mt-12 bg-canvas/85 px-5 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:px-4">
        <ol className="hidden items-center gap-1 sm:flex">
          {STAGES.map((stage, index) => {
            const state =
              index === activeIndex ? 'active' : index < activeIndex ? 'complete' : 'upcoming';

            return (
              <li key={stage.key} className="flex min-w-0 flex-1 items-center gap-1">
                <a
                  href={`#loop-${stage.key}`}
                  data-state={state}
                  className={`nx-stage block min-w-0 flex-1 rounded-xl border px-2 py-2 text-center text-[11px] font-semibold transition-colors duration-300 lg:text-xs ${
                    state === 'upcoming'
                      ? 'border-orange-100 bg-surface/70 text-ink-muted'
                      : 'border-brand/60 bg-orange-100 text-brand-text'
                  }`}
                >
                  <span className="block truncate">{stage.label}</span>
                </a>

                {index < STAGES.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`h-px w-2 shrink-0 transition-colors duration-300 lg:w-3 ${
                      index < activeIndex ? 'bg-brand' : 'bg-orange-200'
                    }`}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="flex items-center justify-between gap-3 sm:hidden">
          <p className="text-sm font-semibold text-ink">
            {STAGES[activeIndex].label}
            <span className="ml-2 text-xs font-normal text-ink-muted">
              stage {activeIndex + 1} of {STAGES.length}
            </span>
          </p>

          <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
            {STAGES.map((stage, index) => (
              <span
                key={stage.key}
                className={`size-1.5 rounded-full transition-colors duration-300 ${
                  index <= activeIndex ? 'bg-brand' : 'bg-orange-200'
                }`}
              />
            ))}
          </span>
        </div>
      </div>

      <ol className="relative mt-10 flex flex-col gap-5">
        {STAGES.map((stage, index) => {
          const state =
            index === activeIndex ? 'active' : index < activeIndex ? 'complete' : 'upcoming';

          return (
            <li
              key={stage.key}
              id={`loop-${stage.key}`}
              ref={register(index)}
              data-state={state}
              className="nx-stage scroll-mt-36"
            >
              <div
                className={`grid gap-4 rounded-2xl border bg-surface p-5 transition-colors duration-300 sm:grid-cols-[auto_1fr] sm:gap-6 sm:p-7 ${
                  state === 'active'
                    ? 'border-brand/50 shadow-lg shadow-orange-900/10'
                    : 'border-orange-100 shadow-sm shadow-orange-900/5'
                }`}
              >
                <div className="flex items-center gap-3 sm:w-40 sm:flex-col sm:items-start">
                  <span
                    aria-hidden="true"
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl border text-sm font-bold transition-colors duration-300 ${
                      state === 'upcoming'
                        ? 'border-orange-200 bg-canvas text-ink-muted'
                        : 'border-brand bg-brand text-on-brand'
                    }`}
                  >
                    {index + 1}
                  </span>

                  <h3 className="text-base font-bold tracking-tight text-ink sm:text-lg">
                    {stage.label}
                  </h3>
                </div>

                <div className="min-w-0">
                  <AvailabilityTag available={stage.available} />
                  <p className="mt-2.5 text-base text-pretty text-ink">{stage.produces}</p>
                  <p className="mt-2 text-sm text-pretty text-ink-muted">{stage.detail}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <Reveal className="mt-8 text-center">
        <p className="mx-auto max-w-2xl text-sm text-ink-muted">
          The loop is the product direction. Five stages run end to end today; the last two are
          partly built, and this page says so at each one rather than at the bottom.
        </p>
      </Reveal>
    </Section>
  );
}
