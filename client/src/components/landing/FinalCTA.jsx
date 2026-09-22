import { Link } from 'react-router-dom';

import { Reveal } from './animation/Reveal.jsx';

/**
 * The closing call to action.
 *
 * Visually echoes the hero — same headline rhythm, same two actions, the
 * same three-node motif — on the page's one dark surface, so the narrative
 * has an ending rather than just running out.
 *
 * The motif is a static SVG with three drawn connections. No loop runs here:
 * this is the last thing on the page and an indefinite animation at the
 * bottom of a document is a timer nobody is watching.
 */
export function FinalCTA() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="nx-ink-surface relative overflow-hidden px-5 py-24 sm:px-6 sm:py-32"
    >
      <div className="relative mx-auto w-full max-w-3xl text-center">
        <Reveal>
          <Motif />

          <h2
            id="final-cta-heading"
            className="mt-8 text-3xl font-bold tracking-tight text-balance text-white sm:text-5xl"
          >
            Stop guessing.
            <br />
            Start building toward your career.
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-base text-pretty text-orange-100/80 sm:text-lg">
            Build your CareerTwin, see where you stand against real roles, and get a plan whose
            every step ends in evidence you can point at.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-10 flex flex-col items-center gap-4">
          <Link
            to="/register"
            className="nx-cta inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-7 py-4 text-base font-semibold text-white shadow-xl shadow-black/25 hover:bg-brand-soft"
          >
            Build Your CareerTwin
            <span aria-hidden="true">→</span>
          </Link>

          <p className="text-sm text-orange-100/70">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-white underline decoration-brand-soft decoration-2 underline-offset-4 transition-colors duration-200 hover:text-orange-200"
            >
              Sign in
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/** Three sources resolving into one point. The hero's idea, in miniature. */
function Motif() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 60"
      className="mx-auto h-14 w-auto"
      fill="none"
      stroke="#FB923C"
      strokeWidth="1.5"
    >
      <path d="M14 14 C 54 14 54 30 80 30" opacity="0.6" />
      <path d="M14 30 H 80" opacity="0.6" />
      <path d="M14 46 C 54 46 54 30 80 30" opacity="0.6" />
      <path d="M80 30 H 146" opacity="0.9" />
      <circle cx="14" cy="14" r="3.5" fill="#FB923C" stroke="none" opacity="0.7" />
      <circle cx="14" cy="30" r="3.5" fill="#FB923C" stroke="none" opacity="0.7" />
      <circle cx="14" cy="46" r="3.5" fill="#FB923C" stroke="none" opacity="0.7" />
      <circle cx="80" cy="30" r="7" fill="#EA580C" stroke="none" />
      <circle cx="146" cy="30" r="5" fill="#FFF7ED" stroke="none" />
    </svg>
  );
}
