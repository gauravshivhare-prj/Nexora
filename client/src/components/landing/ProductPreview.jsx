import { Reveal } from './animation/Reveal.jsx';
import { ExampleLabel, Section, SectionHeading, StateChip } from './Section.jsx';

/**
 * A look at the actual product.
 *
 * Built from the real dashboard's vocabulary and layout — the same tiles, the
 * same counts, the same "next step" line the backend produces — because the
 * point of a preview is that the inside matches the outside.
 *
 * Every figure here is example data and is labelled as such, twice: once in
 * the frame's own header and once underneath. A landing page that renders
 * plausible numbers in a browser chrome without saying whose they are is
 * inviting a visitor to think they are looking at themselves.
 */
const MATCHES = [
  ['Frontend Developer', 'strong', '78'],
  ['Full Stack Developer', 'developing', '71'],
  ['Backend Developer', 'developing', '64'],
];

export function ProductPreview() {
  return (
    <Section tone="canvas" labelledBy="preview-heading">
      <SectionHeading
        id="preview-heading"
        eyebrow="Inside Nexora"
        title="Everything is one screen away from the evidence behind it."
        lead="The dashboard's job is orientation: what is set up, what is out of date, and what is
          worth doing next. It does not compute an opinion of its own — every figure is one the
          backend produced, next to the page that explains it."
        align="center"
      />

      <Reveal className="mt-14">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-orange-200 bg-surface shadow-2xl shadow-orange-900/10">
          {/* A product frame, not a browser mock: a fake URL bar would be
              claiming this is a screenshot. */}
          <div className="flex items-center justify-between gap-3 border-b border-orange-100 bg-canvas px-5 py-3">
            <p className="text-xs font-bold tracking-[0.18em] text-brand-text uppercase">Nexora</p>
            <p className="rounded-full border border-orange-200 bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted">
              Example student · not your data
            </p>
          </div>

          <div className="p-5 sm:p-7">
            <p className="text-lg font-bold tracking-tight text-ink">Welcome, Aarav</p>
            <p className="mt-1.5 text-sm text-ink-muted">
              Your CareerTwin is out of date — a project was added since it was built. Rebuild it
              to refresh your matches.
            </p>

            <div className="mt-6 flex flex-col gap-4">
              <Tile
                title="CareerTwin"
                description="What Nexora has actually observed about you."
                badge={
                  <span className="rounded-full border border-orange-300 bg-orange-100/70 px-2 py-0.5 text-[11px] font-semibold text-warning-text">
                    Out of date
                  </span>
                }
              >
                <Stats
                  items={[
                    ['Skills', '18'],
                    ['Claimed only', '7'],
                    ['Supported', '9'],
                    ['Verified', '2'],
                  ]}
                />
              </Tile>

              {/* `items-start`, so the shorter tile keeps its own height
                  rather than stretching to leave a block of empty card. */}
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <Tile title="Top career matches" description="Scored from your CareerTwin.">
                  <ul className="flex flex-col gap-2">
                    {MATCHES.map(([title, band, score]) => (
                      <li
                        key={title}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-100 bg-orange-50/30 p-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">
                            {title}
                          </span>
                          <span className="block text-xs text-ink-muted">{band}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-brand-text">
                          {score}
                          <span className="text-xs font-normal text-ink-muted">/100</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Tile>

                <Tile title="Skill gap" description="Against Frontend Developer.">
                  <Stats
                    items={[
                      ['Required missing', '2'],
                      ['Required claimed', '1'],
                      ['Required supported', '4'],
                      ['Preferred missing', '3'],
                    ]}
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <StateChip state="missing" />
                    <StateChip state="claimed" label="Claimed only" />
                    <StateChip state="supported" />
                  </div>
                </Tile>
              </div>

              <Tile title="Roadmap" description="The plan towards Frontend Developer.">
                <Stats
                  items={[
                    ['Steps shown', '6'],
                    ['Gaps to close', '6'],
                    ['Critical', '2'],
                    ['High', '1'],
                  ]}
                />
                <p className="mt-3 text-xs text-ink-muted">
                  Steps close when the evidence for them appears — there is nothing here to tick
                  off.
                </p>
              </Tile>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl">
          <ExampleLabel>
            A representation of the signed-in dashboard using example figures. Your own dashboard
            starts empty and fills in as you add evidence.
          </ExampleLabel>
        </div>
      </Reveal>
    </Section>
  );
}

function Tile({ title, description, badge, children }) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-surface p-4 shadow-sm shadow-orange-900/5 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-ink">{title}</p>
          {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
        </div>
        {badge}
      </div>

      {children}
    </div>
  );
}

function Stats({ items }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-orange-100 bg-orange-50/30 p-2.5">
          <dt className="text-[11px] text-ink-muted">{label}</dt>
          <dd className="mt-0.5 text-xl font-bold tracking-tight text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
