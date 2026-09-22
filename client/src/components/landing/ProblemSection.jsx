import { Reveal } from './animation/Reveal.jsx';
import { Section, SectionHeading } from './Section.jsx';

/**
 * The problem, stated as a composition rather than as a paragraph.
 *
 * Students are not short of information about themselves — they have skills,
 * projects, certificates and a resume. What they lack is a single structured
 * view of it and any idea which career it points at. So the fragments here
 * arrive displaced and rotated, and settle into a grid as the section comes
 * into view.
 *
 * The motion is one CSS transition per fragment, triggered by one
 * IntersectionObserver for the whole block.
 */
const FRAGMENTS = [
  { label: 'React', note: 'on a resume', dx: '-70px', dy: '34px', rot: '-7deg' },
  { label: 'A group project', note: 'never written down', dx: '54px', dy: '46px', rot: '6deg' },
  { label: 'Python', note: 'self-rated "intermediate"', dx: '-40px', dy: '-38px', rot: '5deg' },
  { label: 'A certificate', note: 'in a folder', dx: '66px', dy: '-30px', rot: '-5deg' },
  { label: '"Maybe data science?"', note: 'a hunch', dx: '-64px', dy: '18px', rot: '4deg' },
  { label: 'A hackathon', note: 'not on the profile', dx: '48px', dy: '-52px', rot: '-6deg' },
];

const UNANSWERED = [
  {
    question: 'Which career actually fits what I can do?',
    detail: 'Advice arrives as opinion, not as a comparison against what a role requires.',
  },
  {
    question: 'Which of my skills would survive a real interview?',
    detail: 'A skill listed on a profile and a skill you can demonstrate look identical.',
  },
  {
    question: 'What should I do this month?',
    detail: 'Generic roadmaps assume a student with no history. You have one.',
  },
];

export function ProblemSection() {
  return (
    <Section tone="surface" labelledBy="problem-heading">
      <SectionHeading
        id="problem-heading"
        eyebrow="The problem"
        title="You already have the information. It just isn't a picture of anything."
        lead="Skills in one place, projects in another, a resume that nobody has analysed, and no
          way to tell which of it a hiring team would take seriously."
      />

      <div className="mt-14 grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <Reveal className="relative">
          <ul className="grid grid-cols-2 gap-3 sm:gap-4">
            {FRAGMENTS.map((fragment, index) => (
              <li
                key={fragment.label}
                className="nx-scatter rounded-xl border border-orange-100 bg-canvas p-3.5 shadow-sm shadow-orange-900/5 sm:p-4"
                style={{
                  '--nx-dx': fragment.dx,
                  '--nx-dy': fragment.dy,
                  '--nx-rot': fragment.rot,
                  '--nx-delay': `${index * 70}ms`,
                }}
              >
                <p className="text-sm font-semibold text-ink">{fragment.label}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{fragment.note}</p>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-center text-xs text-ink-muted">
            Six fragments of one student. Individually true, collectively useless.
          </p>
        </Reveal>

        <div>
          <ul className="flex flex-col gap-4">
            {UNANSWERED.map((item, index) => (
              <Reveal
                as="li"
                key={item.question}
                delay={index * 90}
                className="nx-lift rounded-2xl border border-orange-100 bg-canvas p-5 hover:border-brand/40"
              >
                <p className="flex items-start gap-2.5 text-base font-semibold text-ink">
                  <span aria-hidden="true" className="mt-0.5 text-brand">
                    ?
                  </span>
                  {item.question}
                </p>
                <p className="mt-2 pl-6 text-sm text-ink-muted">{item.detail}</p>
              </Reveal>
            ))}
          </ul>

          <Reveal delay={300} className="mt-6">
            <p className="text-base font-semibold text-pretty text-ink">
              Nexora answers all three from the same model — and shows its working.
            </p>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
