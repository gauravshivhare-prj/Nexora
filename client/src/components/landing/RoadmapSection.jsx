import { Reveal } from './animation/Reveal.jsx';
import { useActiveStage } from './animation/useActiveStage.js';
import { ExampleLabel, Section, SectionHeading } from './Section.jsx';

/**
 * The roadmap.
 *
 * Every step comes from a gap that was measured, and carries the chain the
 * backend actually builds: the skill, what "done" means given where the
 * student is now, what to do, and how Nexora will know it happened. The last
 * link is what separates this from a reading list — finishing a course proves
 * nothing the system can record, whereas shipping a project and listing its
 * technologies moves a skill from claimed to supported.
 *
 * Scroll-linked: a step lights up as it reaches the middle of the viewport
 * and the spine beside it fills to match. Driven by one IntersectionObserver
 * with a narrow centre band — no scroll handler, and one integer of state for
 * the whole section.
 */
const STEPS = [
  {
    skill: 'Testing',
    priority: 'critical',
    effort: 'substantial',
    objective: 'Learn it well enough to use, then use it in something real.',
    actions: ['Write tests for an existing project', 'Cover the parts you already understand'],
    verification: 'Ship it, list it on the project → Supported',
  },
  {
    skill: 'Accessibility',
    priority: 'critical',
    effort: 'substantial',
    objective: 'Required for this role and currently absent from your evidence.',
    actions: ['Fix keyboard and contrast issues in a project you own'],
    verification: 'List the project’s technologies → Supported',
  },
  {
    skill: 'Git',
    priority: 'high',
    effort: 'moderate',
    objective: 'You have claimed this. Show it.',
    actions: ['Point an existing project at the repository that proves it'],
    verification: 'Evidence on a project → Claimed becomes Supported',
  },
  {
    skill: 'TypeScript',
    priority: 'medium',
    effort: 'moderate',
    objective: 'Preferred rather than required — worth having, not blocking.',
    actions: ['Convert one small project'],
    verification: 'Project evidence → Supported',
  },
];

const PRIORITY_STYLES = {
  critical: 'border-red-200 bg-red-50 text-danger-text',
  high: 'border-orange-300 bg-orange-100 text-warning-text',
  medium: 'border-orange-200 bg-orange-50 text-brand-text',
  low: 'border-orange-100 bg-orange-50/60 text-ink-muted',
};

export function RoadmapSection() {
  const [register, activeIndex] = useActiveStage(STEPS.length);

  return (
    <Section id="roadmap" tone="warm" labelledBy="roadmap-heading">
      <SectionHeading
        id="roadmap-heading"
        eyebrow="Personalized roadmap"
        title="The gap becomes a plan. The plan becomes evidence."
        lead="Each step exists because a specific gap was measured, ordered by what is actually
          stopping you. There is no “learn the fundamentals” step, because that is advice for
          nobody in particular."
      />

      <div className="relative mt-14 grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-sm font-semibold text-ink">Towards Frontend Developer</p>

          <ol className="mt-5 flex flex-col gap-3">
            {['Skill gap', 'Learning action', 'Project', 'Evidence', 'Readiness'].map(
              (label, index) => (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-surface text-[11px] font-semibold text-brand-text"
                  >
                    {index + 1}
                  </span>
                  <span className="font-medium text-ink">{label}</span>
                </li>
              ),
            )}
          </ol>

          <p className="mt-6 text-sm text-ink-muted">
            Nothing here is ticked off by hand. A step closes when the evidence that closes the
            gap appears — at which point it leaves the plan, and you can see the change in your
            own gap analysis.
          </p>

          <p className="mt-4 text-sm text-ink-muted">
            Resources are named as the kind of thing to look for, never as invented links.
          </p>
        </Reveal>

        <div className="relative">
          {/* The spine. A fixed track with a transform-filled overlay, so
              the fill can never reflow the steps beside it. */}
          <div
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-3 w-px bg-orange-200 sm:left-4"
          >
            <div
              className="nx-spine-fill h-full w-full bg-brand"
              style={{ '--nx-progress': (activeIndex + 1) / STEPS.length }}
            />
          </div>

          <ol className="flex flex-col gap-6">
            {STEPS.map((step, index) => {
              const state =
                index === activeIndex ? 'active' : index < activeIndex ? 'complete' : 'upcoming';

              return (
                <li
                  key={step.skill}
                  ref={register(index)}
                  data-state={state}
                  className="nx-stage relative pl-10 sm:pl-12"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute top-3 left-0 flex size-6 items-center justify-center rounded-full border text-[11px] font-bold transition-colors duration-300 sm:left-1 ${
                      state === 'upcoming'
                        ? 'border-orange-200 bg-surface text-ink-muted'
                        : 'border-brand bg-brand text-on-brand'
                    }`}
                  >
                    {index + 1}
                  </span>

                  <div
                    className={`rounded-2xl border bg-surface p-5 transition-shadow duration-300 sm:p-6 ${
                      state === 'active'
                        ? 'border-brand/50 shadow-lg shadow-orange-900/10'
                        : 'border-orange-100 shadow-sm shadow-orange-900/5'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-ink">{step.skill}</h3>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_STYLES[step.priority]}`}
                      >
                        {step.priority}
                      </span>
                      <span className="rounded-full border border-orange-100 bg-orange-50/60 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
                        {step.effort}
                      </span>
                    </div>

                    <p className="mt-2.5 text-sm text-ink">{step.objective}</p>

                    <ul className="mt-3 flex flex-col gap-1.5">
                      {step.actions.map((action) => (
                        <li
                          key={action}
                          className="flex items-start gap-2 text-sm text-ink-muted"
                        >
                          <span aria-hidden="true" className="mt-1.5 size-1.5 rounded-full bg-brand" />
                          {action}
                        </li>
                      ))}
                    </ul>

                    <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-orange-100 pt-3 text-xs font-semibold text-brand-text">
                      <span aria-hidden="true">✓</span>
                      {step.verification}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <ExampleLabel>
            Example plan for one CareerTwin. Priority and effort bands are the product’s own.
          </ExampleLabel>
        </div>
      </div>
    </Section>
  );
}
