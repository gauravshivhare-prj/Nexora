import { useState } from 'react';

import { Reveal } from './animation/Reveal.jsx';
import { ExampleLabel, Section, SectionHeading } from './Section.jsx';

/**
 * Career matching, with the scoring shown rather than asserted.
 *
 * The weights on the right are the real ones — `DIMENSION_WEIGHTS` in
 * server/src/domain/careers/scoring.js — because "explainable matching" is a
 * claim a landing page can either demonstrate or merely make. They are
 * described as a stated judgement, which is what the server's own comment
 * says they are: they are not fitted to hiring data, and pretending
 * otherwise here would be the exact overclaim the product avoids.
 *
 * Roles are the real catalogue. Scores are an example, labelled as one.
 *
 * Interaction: selecting a role swaps the panel. One piece of state, changed
 * by a click — no animation loop, and the bars re-run their fill because the
 * panel is keyed on the role.
 */
const ROLES = [
  { id: 'frontend-developer', title: 'Frontend Developer', score: 78 },
  { id: 'full-stack-developer', title: 'Full Stack Developer', score: 71 },
  { id: 'backend-developer', title: 'Backend Developer', score: 64 },
  { id: 'mobile-developer', title: 'Mobile Application Developer', score: 52 },
  { id: 'data-analyst', title: 'Data Analyst', score: 41 },
];

/**
 * The catalogue's own bands and wording — `MATCH_BANDS` in scoring.js.
 *
 * Kept as the server states them, including the fact that a mid score is
 * described as a foundation with clear gaps rather than as a near miss.
 */
const BANDS = [
  { min: 75, label: 'strong', description: 'You have most of what this role asks for.' },
  { min: 50, label: 'developing', description: 'You have a real foundation, with clear gaps.' },
  { min: 25, label: 'early', description: 'A few pieces are in place; most are not yet.' },
  { min: 0, label: 'exploratory', description: 'A direction to consider, not a near fit.' },
];

const bandFor = (score) => BANDS.find((band) => score >= band.min);

/** Weight, and what the dimension is actually measuring. */
const DIMENSIONS = [
  {
    label: 'Required skills',
    weight: 45,
    detail: 'How many of the role’s required skills you have at all.',
  },
  { label: 'Preferred skills', weight: 20, detail: 'The nice-to-haves.' },
  {
    label: 'Evidence strength',
    weight: 20,
    detail: 'How well-evidenced the matched skills are — claimed counts for less.',
  },
  {
    label: 'Interest alignment',
    weight: 10,
    detail: 'Whether your stated interests and target role point this way.',
  },
  {
    label: 'Background alignment',
    weight: 5,
    detail: 'Whether the role commonly draws from your field of study.',
  },
];

export function CareerMatchSection() {
  const [selected, setSelected] = useState(ROLES[0].id);
  const role = ROLES.find((candidate) => candidate.id === selected) ?? ROLES[0];

  return (
    <Section tone="canvas" labelledBy="match-heading">
      <div aria-hidden="true" className="nx-grid-lines opacity-60" />

      <SectionHeading
        id="match-heading"
        eyebrow="Career direction"
        title="Which direction fits you — and why it fits."
        lead="Your CareerTwin is scored against a curated catalogue of ten roles. The score is
          arithmetic over five named dimensions, not a model’s opinion, so every match can be
          taken apart and argued with."
      />

      <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
        <Reveal>
          <p className="text-sm font-semibold text-ink">Example matches for one CareerTwin</p>

          <ul className="mt-4 flex flex-col gap-2">
            {ROLES.map((candidate, index) => {
              const isSelected = candidate.id === role.id;

              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(candidate.id)}
                    aria-pressed={isSelected}
                    className={`nx-lift w-full rounded-xl border p-3.5 text-left ${
                      isSelected
                        ? 'border-brand bg-surface shadow-md shadow-orange-900/10'
                        : 'border-orange-100 bg-surface/70 hover:border-brand/50'
                    }`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">
                          {candidate.title}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {bandFor(candidate.score).label}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-brand-text">
                        {candidate.score}
                        <span className="text-xs font-normal text-ink-muted">/100</span>
                      </span>
                    </span>

                    <span
                      aria-hidden="true"
                      className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-orange-100"
                    >
                      <span
                        className="nx-bar block h-full w-full rounded-full bg-brand"
                        style={{
                          '--nx-fill': candidate.score / 100,
                          '--nx-delay': `${index * 90}ms`,
                        }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <ExampleLabel>
            Ten real roles are in the catalogue. These five scores are illustrative.
          </ExampleLabel>
        </Reveal>

        <Reveal delay={150}>
          <div className="rounded-2xl border border-orange-200 bg-surface p-6 shadow-lg shadow-orange-900/10 sm:p-8">
            <p className="text-xs font-semibold tracking-[0.18em] text-brand-text uppercase">
              How {role.title} scored {role.score}
            </p>

            <p className="mt-2 text-sm text-ink">{bandFor(role.score).description}</p>

            <ul className="mt-5 flex flex-col gap-4">
              {DIMENSIONS.map((dimension, index) => (
                <li key={dimension.label}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{dimension.label}</span>
                    <span className="text-xs font-semibold text-ink-muted">
                      weight {dimension.weight}%
                    </span>
                  </div>

                  <span
                    aria-hidden="true"
                    className="mt-1.5 block h-2 overflow-hidden rounded-full bg-orange-100"
                  >
                    <span
                      className="nx-bar block h-full w-full rounded-full bg-brand-soft"
                      style={{
                        '--nx-fill': dimension.weight / 45,
                        '--nx-delay': `${index * 80}ms`,
                      }}
                    />
                  </span>

                  <p className="mt-1.5 text-xs text-ink-muted">{dimension.detail}</p>
                </li>
              ))}
            </ul>

            <p className="mt-6 border-t border-orange-100 pt-4 text-sm text-ink-muted">
              The same five dimensions score every role in the catalogue. These weights are a
              stated judgement, not a measurement — they are versioned, so a
              recommendation can always be traced to the scheme that produced it. They are
              deliberately set so that a motivated student from an unrelated degree cannot be
              scored out of a career.
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
