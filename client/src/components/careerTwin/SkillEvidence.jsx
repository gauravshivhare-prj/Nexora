import { useState } from 'react';

import { EVIDENCE_SOURCE_LABELS, EVIDENCE_STRENGTH } from '../../services/careerTwin.service.js';

/**
 * One skill, at the strength its evidence justifies.
 *
 * The whole point of the CareerTwin is that "I know React" and "I passed a
 * React assessment" are different things, so the strength is never presented
 * without the reason for it. The evidence is one press away rather than
 * always open — six skills' worth of detail at once is unreadable — but it is
 * always reachable, and the badge alone never has to be taken on trust.
 */

/**
 * How each strength is shown.
 *
 * The wording is deliberately flat about what has and has not been checked.
 * "Verified" is the only one that means an independent check passed, and
 * nothing in Nexora produces it yet — so a student seeing "Supported" must
 * not read it as "confirmed".
 */
const STRENGTH_PRESENTATION = {
  [EVIDENCE_STRENGTH.CLAIMED]: {
    label: 'Claimed',
    glyph: '○',
    explanation: 'You said so. Nothing has been checked.',
    className: 'border-orange-200 bg-orange-50 text-ink-muted',
  },
  [EVIDENCE_STRENGTH.SUPPORTED]: {
    label: 'Supported',
    glyph: '◐',
    explanation: 'You pointed at something concrete. Still self-reported.',
    className: 'border-orange-300 bg-orange-100 text-brand-text',
  },
  [EVIDENCE_STRENGTH.VERIFIED]: {
    label: 'Verified',
    glyph: '✓',
    explanation: 'An independent check passed.',
    className: 'border-green-200 bg-green-50 text-green-700',
  },
};

export function StrengthBadge({ strength }) {
  const presentation = STRENGTH_PRESENTATION[strength];
  if (!presentation) return null;

  return (
    <span
      // The glyph carries the distinction as well as the colour, so the badge
      // survives a monochrome display.
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${presentation.className}`}
    >
      <span aria-hidden="true">{presentation.glyph}</span>
      {presentation.label}
    </span>
  );
}

/** The one-line meaning of a strength, for the legend. */
export function strengthExplanation(strength) {
  return STRENGTH_PRESENTATION[strength]?.explanation ?? '';
}

export function SkillRow({ skill }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = `evidence-${skill.key}`;

  return (
    <li className="rounded-xl border border-orange-100 bg-orange-50/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{skill.name}</span>
          <StrengthBadge strength={skill.strength} />
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-brand-text transition-colors duration-200 hover:bg-orange-100"
        >
          {/*
            The count is in the button, so a student can see how much is
            behind a skill without opening anything.
          */}
          {isOpen ? 'Hide' : 'Show'} {skill.sourceCount} source
          {skill.sourceCount === 1 ? '' : 's'}
        </button>
      </div>

      {skill.selfDeclaredLevel ? (
        <p className="mt-1 text-xs text-ink-muted">
          You rated yourself <span className="font-medium">{skill.selfDeclaredLevel}</span>. That is
          your own rating — it does not change the strength above.
        </p>
      ) : null}

      <div id={panelId} hidden={!isOpen}>
        <ul className="mt-3 flex flex-col gap-2 border-t border-orange-100 pt-3">
          {skill.evidence.map((item, index) => (
            <li key={index} className="text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink">
                  {EVIDENCE_SOURCE_LABELS[item.source] ?? item.source}
                </span>
                <StrengthBadge strength={item.strength} />
              </div>

              {/*
                The detail is the server's own explanation — "used in your
                project Nexora" — and is what makes the strength arguable
                rather than an unexplained score.
              */}
              <p className="mt-0.5 text-ink-muted">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
