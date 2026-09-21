import { EVIDENCE_STRENGTH } from '../evidence/evidence.js';

/**
 * How a student is scored against a career role.
 *
 * Every number in this file is a deliberate choice that can be argued with,
 * and all of them are collected here rather than scattered through the
 * matcher. A weight nobody can find is a weight nobody can challenge.
 *
 * ## These weights are a judgement, not a measurement
 *
 * They are not fitted to hiring data, because Nexora has none. They encode
 * three opinions:
 *
 *  1. **A required skill matters more than a preferred one.** A backend role
 *     needs a server-side language; Redis is nice to have. 70/30 rather than
 *     50/50 because treating them equally would let a student with every
 *     optional extra and no fundamentals outrank one with the reverse.
 *
 *  2. **Evidence matters more than assertion.** A skill someone has used in
 *     a project counts for more than one they typed into a form. This is the
 *     product's whole premise, so it is a scored dimension rather than a
 *     footnote — but it is weighted below skill coverage, because having the
 *     skill at all is still the larger question.
 *
 *  3. **Interest and background are weak signals.** They are worth
 *     something — a student who says they want this and studied near it is
 *     better placed than one who did neither — but a motivated student from
 *     an unrelated degree must not be scored out of a career. Together they
 *     are capped well below the skill dimensions.
 *
 * Changing these is expected. Bump WEIGHTS_VERSION when it happens, so a
 * stored recommendation can be recognised as computed under an older scheme
 * rather than silently compared against a newer one.
 */

/** Increment whenever any weight below changes. */
export const WEIGHTS_VERSION = 1;

/**
 * Dimension weights. Must sum to 1.
 *
 * The sum is asserted at import time rather than trusted: a typo here would
 * silently rescale every recommendation in the product, and it would not
 * look like a bug from the outside.
 */
export const DIMENSION_WEIGHTS = {
  /** How many of the role's required skills the student has, at all. */
  requiredSkills: 0.45,
  /** How many preferred skills they have. */
  preferredSkills: 0.2,
  /** How well-evidenced the matched skills are. */
  evidenceStrength: 0.2,
  /** Whether their stated interests and target role point this way. */
  interestAlignment: 0.1,
  /** Whether their academic background is one this role commonly draws from. */
  backgroundAlignment: 0.05,
};

const weightTotal = Object.values(DIMENSION_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
if (Math.abs(weightTotal - 1) > 1e-9) {
  throw new Error(`Career match weights must sum to 1, but sum to ${weightTotal}.`);
}

/**
 * What each evidence strength contributes to the evidence dimension.
 *
 * `claimed` is deliberately non-zero: a student who says they know something
 * usually does, and scoring assertion at zero would make the dimension a
 * proxy for "has used Nexora for a while" rather than for competence.
 *
 * It is equally deliberately well below `supported`. The gap between saying
 * and showing is the distinction the product exists to make, and a narrow
 * gap would make it cosmetic.
 */
export const STRENGTH_CREDIT = {
  [EVIDENCE_STRENGTH.CLAIMED]: 0.4,
  [EVIDENCE_STRENGTH.SUPPORTED]: 0.8,
  [EVIDENCE_STRENGTH.VERIFIED]: 1,
};

/**
 * Bands used to describe a score in words.
 *
 * Boundaries are round numbers chosen for legibility, not derived from
 * anything. They exist because "62" means nothing to a student on its own,
 * and the label is always shown beside the reasons that produced it.
 */
export const MATCH_BANDS = [
  { min: 75, label: 'strong', description: 'You have most of what this role asks for.' },
  { min: 50, label: 'developing', description: 'You have a real foundation, with clear gaps.' },
  { min: 25, label: 'early', description: 'A few pieces are in place; most are not yet.' },
  { min: 0, label: 'exploratory', description: 'This is a direction to consider, not a near fit.' },
];

/** The band a score falls in. */
export function bandFor(score) {
  return MATCH_BANDS.find((band) => score >= band.min) ?? MATCH_BANDS[MATCH_BANDS.length - 1];
}

/**
 * Minimum score worth showing.
 *
 * Below this the match is driven by one or two incidental overlaps, and
 * presenting it as a recommendation would be noise dressed as advice.
 */
export const MINIMUM_RECOMMENDABLE_SCORE = 20;
