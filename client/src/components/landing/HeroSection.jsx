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
const HEADLINE = [
  'Know where you are.',
  'Know where you want to go.',
  'Know exactly what to do next.',
];

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden px-5 pt-10 pb-20 sm:px-6 sm:pt-16 sm:pb-28"
    >
      <div aria-hidden="true" className="nx-glow" />
      <div aria-hidden="true" className="nx-grid-lines" />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
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

          <h1
            id="hero-heading"
            className="mt-6 text-4xl leading-[1.08] font-bold tracking-tight text-balance text-ink sm:text-5xl lg:text-6xl"
          >
            {HEADLINE.map((line, index) => (
              <span
                key={line}
                className="nx-line"
                style={{ '--nx-delay': `${120 + index * 130}ms` }}
              >
                {line}
              </span>
            ))}
          </h1>

          <p
            className="nx-line mt-6 max-w-xl text-lg text-pretty text-ink-muted"
            style={{ '--nx-delay': '560ms' }}
          >
            Nexora turns your profile, projects and resume into a{' '}
            <strong className="font-semibold text-ink">CareerTwin</strong> — one model of what
            you can actually evidence. It scores you against real roles, shows exactly which
            skills are missing or merely claimed, and turns that gap into a roadmap you can work
            through.
          </p>

          <div
            className="nx-line mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ '--nx-delay': '680ms' }}
          >
            <Link
              to="/register"
              className="nx-cta inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-900/15 hover:bg-brand-soft"
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
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-surface/80 px-6 py-3.5 text-sm font-semibold text-ink transition-colors duration-200 hover:border-brand hover:text-brand-text"
            >
              See how Nexora works
              <span aria-hidden="true">↓</span>
            </a>
          </div>

          <p
            className="nx-line mt-6 text-sm text-ink-muted"
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
