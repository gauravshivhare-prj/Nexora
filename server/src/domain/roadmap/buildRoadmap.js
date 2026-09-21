import { GAP_IMPORTANCE, GAP_STATUS } from '../skillGap/computeSkillGap.js';
import { resourcesFor, verificationFor } from './resourceReferences.js';
import { skillKey } from '../skills/skillKey.js';

/**
 * Turning a skill gap into a plan.
 *
 * Every item comes from a gap that was actually measured. Nothing is added
 * because it seemed like a good idea, and nothing generic appears at all —
 * there is no "learn the fundamentals" step, because that is advice for
 * nobody in particular and a student can tell.
 *
 * The chain each item carries:
 *
 * ```text
 * goal (the role)
 *   → skill      (from the gap)
 *   → objective  (what "done" means, given where they are now)
 *   → actions    (what to do)
 *   → resources  (where to look — placeholders, never invented links)
 *   → verification (how Nexora will know, and what status it reaches)
 * ```
 *
 * The verification step is what makes this a roadmap rather than a reading
 * list. Finishing a course proves nothing Nexora can record; shipping a
 * project and listing its technologies moves a skill from `claimed` to
 * `supported`, which the student can then see in their own gap analysis.
 *
 * Pure: no database, no clock, no AI. Same gap, same plan.
 */

/**
 * Effort bands.
 *
 * Deliberately bands rather than hour counts. "12 hours to learn Docker" is
 * a number nobody can justify — it depends on the student, on what they
 * already know, and on how deep they go — and printing it would make the
 * roadmap look precise in exactly the place it cannot be. A band sets an
 * expectation without pretending to a measurement.
 */
export const EFFORT = {
  /** Add something that already exists to the profile. */
  QUICK: 'quick',
  /** Learn enough to be useful and build with it. */
  MODERATE: 'moderate',
  /** A skill that takes real time to become competent in. */
  SUBSTANTIAL: 'substantial',
};

/** Priority bands, mirroring the gap ordering. */
export const PRIORITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

/**
 * Priority for a gap.
 *
 * A missing *required* skill is critical because it is what stops someone
 * being considered. A required skill that is only claimed is high rather
 * than medium: the student thinks that box is ticked, so it is the item most
 * likely to be a surprise, and the work needed is usually small — one
 * project rather than learning from nothing.
 */
function priorityFor(gapSkill) {
  const { importance, status } = gapSkill;

  if (importance === GAP_IMPORTANCE.REQUIRED) {
    if (status === GAP_STATUS.MISSING) return PRIORITY.CRITICAL;
    if (status === GAP_STATUS.CLAIMED) return PRIORITY.HIGH;
    return PRIORITY.LOW;
  }

  if (status === GAP_STATUS.MISSING) return PRIORITY.MEDIUM;
  if (status === GAP_STATUS.CLAIMED) return PRIORITY.MEDIUM;
  return PRIORITY.LOW;
}

/**
 * Effort for a gap.
 *
 * Learning something from nothing is substantial. Demonstrating something
 * already known is moderate — the learning is done, the building is not.
 */
function effortFor(gapSkill) {
  if (gapSkill.status === GAP_STATUS.MISSING) return EFFORT.SUBSTANTIAL;
  if (gapSkill.status === GAP_STATUS.CLAIMED) return EFFORT.MODERATE;
  return EFFORT.QUICK;
}

const PRIORITY_ORDER = [PRIORITY.CRITICAL, PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW];

/**
 * Builds a roadmap from a computed skill gap.
 *
 * @param {object} gap Output of computeSkillGap.
 * @param {{ maxItems?: number }} [options]
 * @returns {object}
 */
export function buildRoadmap(gap, { maxItems = 10 } = {}) {
  /**
   * A skill belongs on the plan only if there is something the student can
   * actually do about it today.
   *
   * Tested on the suggestions rather than on the status, which matters for
   * `supported` skills: their only remaining step is passing an assessment,
   * and assessments do not exist yet. Listing "pass a Docker assessment" as
   * a roadmap item would be asking a student to use a feature that is not
   * there — the plan would look longer while getting no shorter.
   *
   * Written this way rather than as `status !== VERIFIED` so that when
   * assessments ship, those skills rejoin the plan automatically instead of
   * waiting for someone to remember this line.
   */
  const actionable = gap.skills.filter((skill) =>
    skill.suggestedEvidence.some((suggestion) => suggestion.available),
  );

  const items = actionable
    .map((skill) => buildItem(skill, gap))
    .sort(byPriorityThenName)
    .slice(0, maxItems)
    .map((item, index) => ({ ...item, order: index + 1 }));

  return {
    goal: {
      roleId: gap.roleId,
      roleTitle: gap.roleTitle,
      description: `Become a credible candidate for ${gap.roleTitle}.`,
    },
    items,
    summary: {
      totalItems: items.length,
      /**
       * How many actionable gaps existed before `maxItems` truncated the
       * list. Reported so a student is not left thinking a ten-item plan is
       * the whole of it.
       */
      actionableGaps: actionable.length,
      critical: items.filter((item) => item.priority === PRIORITY.CRITICAL).length,
      high: items.filter((item) => item.priority === PRIORITY.HIGH).length,
    },
    /**
     * Stated in the payload. A roadmap is the part of the product most
     * likely to be mistaken for curated advice, so it says plainly that its
     * resources are not.
     */
    method: {
      deterministic: true,
      usesAi: false,
      generatedFrom: 'skill-gap',
      resourcesVerified: false,
      resourceNote:
        'Resource references are structured placeholders with search hints, not curated links. Nexora has no verified course catalogue, and inventing links would be worse than offering none.',
    },
  };
}

/** One roadmap item, for one skill. */
function buildItem(gapSkill, gap) {
  const priority = priorityFor(gapSkill);
  const isMissing = gapSkill.status === GAP_STATUS.MISSING;

  return {
    /** Stable within a role, so a client can track completion against it. */
    id: `${gap.roleId}:${gapSkill.key}`,

    skill: { key: gapSkill.key, name: gapSkill.name },

    title: isMissing ? `Learn ${gapSkill.name}` : `Demonstrate ${gapSkill.name}`,

    /**
     * What "done" means, stated in terms of the evidence status it reaches
     * rather than as an amount of study. "Understand Docker" has no finish
     * line; "have a project Nexora can see" does.
     */
    objective: isMissing
      ? `Learn enough ${gapSkill.name} to build something with it, and add that project to your profile.`
      : `Turn your ${gapSkill.name} claim into something Nexora can see — a project that uses it, or a certification covering it.`,

    description: gapSkill.reason,

    priority,
    estimatedEffort: effortFor(gapSkill),

    /** Why this is on the plan at all, traced back to the role. */
    because: {
      roleTitle: gap.roleTitle,
      importance: gapSkill.importance,
      currentStatus: gapSkill.status,
    },

    /**
     * Skills to have first.
     *
     * Only ever drawn from this same roadmap, so a prerequisite always
     * points at an item the student can actually see. Inventing a dependency
     * graph across all of technology is not something this can do honestly.
     */
    prerequisites: prerequisitesFor(gapSkill, gap),

    resources: resourcesFor(gapSkill.name),

    verification: verificationFor(gapSkill.name),

    /**
     * Completion is not stored here.
     *
     * A roadmap is derived from a gap, and the gap is derived from evidence.
     * A student "marks Docker done" by adding a Docker project — at which
     * point the gap closes and the item disappears on its own. A separate
     * completion flag would let the plan disagree with the evidence, which
     * is the one thing this architecture is built to prevent.
     */
    completion: {
      status: gapSkill.status,
      isComplete: false,
      completesWhen: `This item closes when ${gapSkill.name} reaches "supported" — see verification.`,
    },
  };
}

/**
 * Prerequisites, restricted to skills on the same roadmap.
 *
 * A language is a prerequisite for its own frameworks — there is no point
 * planning Express.js before JavaScript. That relationship is expressed as
 * a small table rather than inferred, because a wrong inference here would
 * reorder a student's plan for no reason.
 */
const FOUNDATIONS = new Map([
  ['expressjs', ['JavaScript', 'Node.js']],
  ['nodejs', ['JavaScript']],
  ['react', ['JavaScript', 'HTML', 'CSS']],
  ['nextjs', ['React']],
  ['typescript', ['JavaScript']],
  ['reactnative', ['React']],
  ['kubernetes', ['Docker']],
  ['terraform', ['Cloud Computing']],
  ['scikitlearn', ['Python']],
  ['pandas', ['Python']],
  ['deeplearning', ['Machine Learning']],
  ['machinelearning', ['Python', 'Statistics']],
]);

function prerequisitesFor(gapSkill, gap) {
  const foundations = FOUNDATIONS.get(gapSkill.key);
  if (!foundations) return [];

  // Only list a prerequisite the student does not already have, and only
  // one that is itself on this roadmap — otherwise it is a dead reference.
  const planned = new Set(
    gap.skills
      .filter((skill) => skill.status === GAP_STATUS.MISSING || skill.status === GAP_STATUS.CLAIMED)
      .map((skill) => skill.key),
  );

  return foundations
    .map((name) => ({ key: skillKey(name), name }))
    .filter((prerequisite) => planned.has(prerequisite.key))
    .map((prerequisite) => ({ ...prerequisite, itemId: `${gap.roleId}:${prerequisite.key}` }));
}

function byPriorityThenName(left, right) {
  const byPriority =
    PRIORITY_ORDER.indexOf(left.priority) - PRIORITY_ORDER.indexOf(right.priority);
  if (byPriority !== 0) return byPriority;

  // A prerequisite should come before the thing that needs it, where both
  // sit at the same priority.
  const leftNeedsRight = left.prerequisites.some((pre) => pre.key === right.skill.key);
  const rightNeedsLeft = right.prerequisites.some((pre) => pre.key === left.skill.key);
  if (leftNeedsRight) return 1;
  if (rightNeedsLeft) return -1;

  return left.skill.name.localeCompare(right.skill.name);
}
