/**
 * What Nexora knows about a skill, and how well it knows it.
 *
 * This is the model the whole product turns on. Nexora's claim is that it can
 * tell a student what they can actually demonstrate — not what they typed
 * into a form. That claim is only worth anything if "I know React" and "I
 * passed a React assessment" are stored as different things.
 *
 * So no skill is ever recorded bare. Every one arrives attached to evidence
 * saying where it came from, and every piece of evidence carries a strength
 * that says how much weight it can bear.
 */

/**
 * Where a piece of evidence came from.
 *
 * ASSESSMENT and INTERVIEW are declared now and produced by nothing: they are
 * the sources that will make VERIFIED reachable, and the consumers of this
 * model are being written today. Declaring them means those consumers can
 * handle them from the start instead of being revisited.
 */
export const EVIDENCE_SOURCES = {
  /** A skill the student listed on their profile. */
  SELF_DECLARED: 'self_declared',
  /** A skill named in a resume, after grounding against the document. */
  RESUME: 'resume',
  /** A technology used by a project the student says they built. */
  PROJECT: 'project',
  /** A certification the student holds. */
  CERTIFICATION: 'certification',
  /** Not produced yet — Phase 8. */
  ASSESSMENT: 'assessment',
  /** Not produced yet — Phase 8. */
  INTERVIEW: 'interview',
};

export const EVIDENCE_SOURCE_VALUES = Object.values(EVIDENCE_SOURCES);

/**
 * How much weight a piece of evidence can bear.
 *
 * Three levels, because two would force a false choice. A student who has
 * shipped a React project has done more than tick a box, and less than pass
 * an examined test; collapsing that into "claimed or not" throws away the
 * distinction Nexora exists to make.
 *
 * The ordering is deliberate and depended on: a skill's overall strength is
 * the strongest evidence behind it.
 */
export const EVIDENCE_STRENGTH = {
  /**
   * The student said so. Nothing else.
   *
   * A resume counts as claimed, not supported — a resume is a document its
   * subject wrote about themselves. Grounding proves the resume says it, not
   * that it is true.
   */
  CLAIMED: 'claimed',

  /**
   * The student pointed at something concrete that involves the skill: a
   * project that uses it, a certification that covers it.
   *
   * Still self-reported — nobody has checked that the project exists. But
   * naming a specific artefact is a stronger statement than listing a word,
   * and it is checkable later.
   */
  SUPPORTED: 'supported',

  /**
   * An independent check has passed.
   *
   * **Nothing in Nexora produces this today.** Assessments and AI interviews
   * are Phase 8. It exists here so that every consumer is written against the
   * full scale, and so no later phase is tempted to overstate SUPPORTED to
   * fill the gap.
   */
  VERIFIED: 'verified',
};

/** Weakest to strongest. The index is the comparison. */
export const EVIDENCE_STRENGTH_ORDER = [
  EVIDENCE_STRENGTH.CLAIMED,
  EVIDENCE_STRENGTH.SUPPORTED,
  EVIDENCE_STRENGTH.VERIFIED,
];

export const EVIDENCE_STRENGTH_VALUES = EVIDENCE_STRENGTH_ORDER;

/**
 * The strength each source can justify.
 *
 * A table rather than a rule per call site, so the answer to "how much does a
 * certification prove?" is in one place and can be argued with.
 *
 * Certifications sit at SUPPORTED rather than VERIFIED on purpose. Nexora has
 * not checked the credential — a `credentialUrl` is a link the student typed,
 * not a verification. Treating an unfetched link as proof would be exactly
 * the overstatement this model is built to prevent. Fetching and validating
 * credentials would earn VERIFIED; until then it does not.
 */
export const SOURCE_STRENGTH = {
  [EVIDENCE_SOURCES.SELF_DECLARED]: EVIDENCE_STRENGTH.CLAIMED,
  [EVIDENCE_SOURCES.RESUME]: EVIDENCE_STRENGTH.CLAIMED,
  [EVIDENCE_SOURCES.PROJECT]: EVIDENCE_STRENGTH.SUPPORTED,
  [EVIDENCE_SOURCES.CERTIFICATION]: EVIDENCE_STRENGTH.SUPPORTED,
  [EVIDENCE_SOURCES.ASSESSMENT]: EVIDENCE_STRENGTH.VERIFIED,
  [EVIDENCE_SOURCES.INTERVIEW]: EVIDENCE_STRENGTH.VERIFIED,
};

/**
 * Builds one piece of evidence.
 *
 * `detail` is what makes a skill's status explainable to the student: not
 * "React — supported" but "React — used in your project Nexora". A status
 * without a reason is the unexplained score this architecture rules out, so
 * `detail` is required rather than optional.
 *
 * @param {object} args
 * @param {string} args.source One of EVIDENCE_SOURCES.
 * @param {string} args.detail Human-readable reason, shown to the student.
 * @param {string} [args.reference] Id or title of the originating record, so
 *   the evidence can be traced back to what produced it.
 * @returns {{ source: string, strength: string, detail: string, reference: string|null }}
 */
export function makeEvidence({ source, detail, reference = null }) {
  const strength = SOURCE_STRENGTH[source];

  if (!strength) {
    // A source with no declared strength is a programming error, not bad
    // input: silently defaulting it would invent a confidence level.
    throw new Error(`Unknown evidence source: ${source}`);
  }

  return { source, strength, detail, reference };
}

/**
 * The strongest of several evidence items.
 *
 * A skill is as strong as its best evidence, not the average: passing an
 * assessment is not diluted by also having typed the skill into a form.
 *
 * @param {{ strength: string }[]} items
 * @returns {string|null} null for an empty list — no evidence is not a
 *   strength, and returning CLAIMED for it would invent one.
 */
export function strongestStrength(items) {
  let best = null;
  let bestRank = -1;

  for (const item of items) {
    const rank = EVIDENCE_STRENGTH_ORDER.indexOf(item.strength);
    if (rank > bestRank) {
      bestRank = rank;
      best = item.strength;
    }
  }

  return best;
}

/** True when `strength` is at least `minimum` on the scale. */
export function meetsStrength(strength, minimum) {
  return (
    EVIDENCE_STRENGTH_ORDER.indexOf(strength) >= EVIDENCE_STRENGTH_ORDER.indexOf(minimum) &&
    EVIDENCE_STRENGTH_ORDER.includes(strength)
  );
}
