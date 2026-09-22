import { Link } from 'react-router-dom';

import { CareerTwinVisual } from './CareerTwinVisual.jsx';

/**
 * The hero.
 *
 * Three clauses, arriving as three clauses, because they are the product's
 * whole proposition: where you are, where you are going, what to do next.
 *
 * The entrance here is the one animation on the page that is not triggered by
 * scrolling into view — it is already in view. It is a plain CSS keyframe
 * with staggered delays, so there is no JavaScript between first paint and
 * the headline appearing.
 */

/**
 * The headline, as three clauses.
 *
 * The third carries the stress, because it is the one the other two build to
 * and the one the product is judged on: plenty of tools will tell a student
 * where they stand, and the promise here is the next action. The stress is
 * colour and a rule under one word rather than a larger type size — the
 * headline does not need to be bigger.
 */
const HEADLINE = [
  [{ text: 'Know where you are.' }],
  [{ text: 'Know where you want to go.' }],
  [
    { text: 'Know ' },
    { text: 'exactly', accent: true },
    { text: ' what to do next.' },
  ],
];

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden px-5 pt-10 pb-20 sm:px-6 sm:pt-16 sm:pb-28"
    >
      <div aria-hidden="true" className="nx-glow" />
      <div aria-hidden="true" className="nx-grid-lines" />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.08fr_1fr] lg:gap-14">
        <div>
          {/*
            Wrapped rather than animated directly: `.nx-line` sets
            `display: block`, which would stretch the pill to the column.
          */}
          <div className="nx-line" style={{ '--nx-delay': '0ms' }}>
            <p className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-surface/70 px-3 py-1 text-xs font-semibold text-brand-text">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
              AI-powered career readiness for students
            </p>
          </div>

          {/*
            A fluid size rather than three breakpoint steps. The headline is
            the one element whose wrapping decides the hero's composition,
            and stepping it at `sm` and `lg` meant a clause that fitted at
            one width broke awkwardly just below it.
          */}
          <h1
            id="hero-heading"
            className="mt-7 text-[clamp(2.05rem,4.1vw,3rem)] leading-[1.06] font-bold tracking-[-0.02em] text-ink"
          >
            {HEADLINE.map((line, index) => (
              <span
                key={line[0].text}
                // Balanced per clause: a two-line clause splits evenly
                // instead of leaving one word stranded on the second line.
                className="nx-line text-balance"
                style={{ '--nx-delay': `${120 + index * 130}ms` }}
              >
                {line.map((part) =>
                  part.accent ? (
                    /*
                      The stress: accent colour and a rule under the word.
                      `text-decoration` rather than a positioned element —
                      an inline SVG here added a box to the heading, and
                      Tailwind's preflight makes `svg` display:block, which
                      put a line break into the heading's text.
                    */
                    <em
                      key={part.text}
                      className="text-brand-text underline decoration-brand/45 decoration-[0.06em] underline-offset-[0.16em] not-italic"
                    >
                      {part.text}
                    </em>
                  ) : (
                    part.text
                  ),
                )}
              </span>
            ))}
          </h1>

          <p
            className="nx-line mt-7 max-w-xl text-lg leading-relaxed text-pretty text-ink-muted"
            style={{ '--nx-delay': '560ms' }}
          >
            Nexora turns your profile, projects and resume into a{' '}
            <strong className="font-semibold text-ink">CareerTwin</strong> — one model of what
            you can actually evidence. It scores you against real roles, shows exactly which
            skills are missing or merely claimed, and turns that gap into a roadmap you can work
            through.
          </p>

          <div
            className="nx-line mt-10 flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ '--nx-delay': '680ms' }}
          >
            <Link
              to="/register"
              className="nx-cta inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-4 text-[0.95rem] font-semibold text-on-brand shadow-lg shadow-orange-900/25 hover:bg-brand-soft"
            >
              Build Your CareerTwin
              <span aria-hidden="true">→</span>
            </Link>

            {/*
              A real anchor. The scroll is the browser's, smoothed in CSS and
              reset to an instant jump under reduced motion — no scroll
              library, no JavaScript, and it survives being opened in a new
              tab or copied as a link.
            */}
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 px-6 py-4 text-[0.95rem] font-semibold text-ink transition-colors duration-200 hover:border-brand hover:bg-orange-50 hover:text-brand-text"
            >
              See how Nexora works
              <span aria-hidden="true">↓</span>
            </a>
          </div>

          <p
            className="nx-line mt-7 text-xs font-medium tracking-[0.12em] text-ink-muted uppercase"
            style={{ '--nx-delay': '760ms' }}
          >
            From student profile to career-ready candidate.
          </p>
        </div>

        <div className="nx-line" style={{ '--nx-delay': '320ms' }}>
          <CareerTwinVisual />
        </div>
      </div>
    </section>
  );
}
