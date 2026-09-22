import { Reveal } from './animation/Reveal.jsx';
import { Section, SectionHeading } from './Section.jsx';

/**
 * Why Nexora, in five claims it can be held to.
 *
 * Each one names a mechanism rather than a benefit — "evidence-based skill
 * understanding" is only a differentiator if you can say what it does, so
 * each card says what it does. Nothing here is a claim the rest of the page
 * has not already demonstrated.
 *
 * The interaction is a lift and an accent that grows on hover or focus, and
 * no card hides its text behind an interaction — a differentiator that has
 * to be hovered to be read has not been communicated.
 */
const REASONS = [
  {
    title: 'Evidence-based skills',
    detail:
      'Every skill carries the sources that justified its strength. Claimed, supported and verified stay visibly distinct, because collapsing them is exactly the failure this product exists to prevent.',
  },
  {
    title: 'A CareerTwin, not a static profile',
    detail:
      'One canonical model, merged from your profile, projects, certifications and analysed resume. It is marked out of date the moment your data changes, with the reason why.',
  },
  {
    title: 'Explainable recommendations',
    detail:
      'Scores are arithmetic over five named, versioned dimensions against a curated role catalogue. No model picks your career, and every match can be taken apart.',
  },
  {
    title: 'A roadmap driven by measured gaps',
    detail:
      'Each step exists because a specific requirement was not met, ordered by what is actually blocking you, and tied to how the gap will be evidenced rather than to a course to sit through.',
  },
  {
    title: 'Readiness that keeps moving',
    detail:
      'New evidence re-derives everything downstream — the twin, the matches, the gap, the plan. Nothing is a stored opinion waiting to go stale.',
  },
];

export function WhyNexora() {
  return (
    <Section tone="warm" labelledBy="why-heading">
      <SectionHeading
        id="why-heading"
        eyebrow="Why Nexora"
        title="Five things that are structural, not marketing."
        align="center"
      />

      <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {REASONS.map((reason, index) => (
          <Reveal
            as="li"
            key={reason.title}
            delay={index * 80}
            className="nx-lift group relative overflow-hidden rounded-2xl border border-orange-100 bg-surface p-6 shadow-sm shadow-orange-900/5 hover:border-brand/40"
          >
            {/* The accent. `scaleX` from the left on hover or keyboard focus
                within — a transform, so it costs nothing to animate. */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-brand transition-transform duration-300 group-hover:scale-x-100 group-focus-within:scale-x-100"
            />

            <p className="text-2xl font-bold tracking-tight text-brand/35">
              {String(index + 1).padStart(2, '0')}
            </p>

            <h3 className="mt-3 text-base font-semibold text-balance text-ink">{reason.title}</h3>
            <p className="mt-2.5 text-sm text-pretty text-ink-muted">{reason.detail}</p>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
