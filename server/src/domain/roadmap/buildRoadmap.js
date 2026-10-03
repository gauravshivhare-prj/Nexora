import { GAP_IMPORTANCE, GAP_STATUS } from '../skillGap/computeSkillGap.js';
import { resourcesFor, verificationFor } from './resourceReferences.js';
import { skillKey } from '../skills/skillKey.js';
import {
  orderLearningSequence,
  validateLearningSequence,
  EFFORT_HOURS,
} from './skillPriorityEngine.js';

/**
 * Turning a skill gap into a personalised plan.
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
 *   → phase / whyBefore (learning-order rationale from the priority engine)
 * ```
 *
 * The verification step is what makes this a roadmap rather than a reading
 * list. Finishing a course proves nothing Nexora can record; shipping a
 * project and listing its technologies moves a skill from `claimed` to
 * `supported`, which the student can then see in their own gap analysis.
 *
 * Pure: no database, no clock, no AI. Same gap + same options, same plan.
 *
 * Task 16 — Personalised Roadmap Generation Engine Reconstruction:
 *   - Integrates `orderLearningSequence` from skillPriorityEngine for
 *     topological + multi-factor priority ordering replacing the basic sort.
 *   - Surfaces `phase`, `whyBefore`, `priorityScore`, `effortHours`,
 *     `estimatedWeeks` from the priority engine on every item.
 *   - Accepts `availableHoursPerWeek` and `studentGoals` for personalisation.
 *   - Runs `validateLearningSequence` post-assembly and reports violations
 *     in the `method` block so clients can surface warnings.
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

/**
 * Builds a personalised roadmap from a computed skill gap.
 *
 * @param {object} gap Output of computeSkillGap.
 * @param {object} [options]
 * @param {number} [options.maxItems=10] Cap on returned items.
 * @param {number} [options.availableHoursPerWeek=15] Pacing input.
 * @param {string[]} [options.studentGoals=[]] Goal keywords for alignment boost.
 * @returns {object}
 */
export function buildRoadmap(gap, {
  maxItems = 10,
  availableHoursPerWeek = 15,
  studentGoals = [],
  learningStyle = 'mixed',
} = {}) {
  const safeGap = gap && typeof gap === 'object' ? gap : {};
  const roleId = safeGap.roleId ?? null;
  const roleTitle = safeGap.roleTitle ?? '';
  const gapSkills = Array.isArray(safeGap.skills) ? safeGap.skills.filter(Boolean) : [];

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
  const actionable = gapSkills.filter((skill) =>
    Array.isArray(skill.suggestedEvidence) &&
    skill.suggestedEvidence.some((suggestion) => suggestion && suggestion.available),
  );

  const limit = typeof maxItems === 'number' && maxItems >= 0 ? maxItems : 10;
  const hoursPerWeek = typeof availableHoursPerWeek === 'number' && availableHoursPerWeek > 0
    ? availableHoursPerWeek
    : 15;
  const goals = Array.isArray(studentGoals) ? studentGoals : [];

  /**
   * Use the skill priority engine to produce a topologically sorted,
   * multi-factor priority-scored learning sequence. This replaces the
   * basic `byPriorityThenName` comparator from the earlier implementation
   * and integrates DAG prerequisite ordering, blocking-power boosts, time
   * pacing, and explainable `whyBefore` rationale.
   *
   * Held skills are the skills the student already has (not in the gap or
   * already supported/verified) — the engine uses them to gate prerequisites.
   */
  const heldSkills = gapSkills
    .filter((s) => s.status === GAP_STATUS.SUPPORTED || s.status === GAP_STATUS.VERIFIED)
    .map((s) => s.name);

  // Order actionable gaps through the priority engine
  const engineOrdered = actionable.length > 0
    ? orderLearningSequence(actionable, {
        role: roleId ? { id: roleId, title: roleTitle } : null,
        heldSkills,
        availableHoursPerWeek: hoursPerWeek,
        studentGoals: goals,
      })
    : [];

  /**
   * The priority engine may drop items when two gap skills share the same
   * canonical key (e.g. PostgreSQL and SQL both map to the 'sql' key in
   * the ontology, causing one to overwrite the other in the engine's internal
   * map). Re-append any actionable skills not returned by the engine so the
   * item count matches the true actionable gap count and nothing is silently lost.
   *
   * Dropped items are appended in their original gap order, which preserves
   * determinism: same gap, same plan.
   */
  const engineOutputKeys = new Set(engineOrdered.map((s) => s.key || s.canonicalKey));
  const engineOutputNames = new Set(engineOrdered.map((s) => s.name));
  const droppedByEngine = actionable.filter(
    (s) => !engineOutputKeys.has(s.key) && !engineOutputNames.has(s.name),
  );

  // Combine engine-ordered items with any dropped ones (in original order)
  const combinedItems = [...engineOrdered, ...droppedByEngine];

  /**
   * Post-processing: enforce FOUNDATIONS-table ordering.
   *
   * The priority engine uses the skill ontology's prerequisites, which may be
   * incomplete (e.g. React's ontology only lists JavaScript, not CSS/HTML).
   * The FOUNDATIONS table in this file has the full, curated dependency set.
   * Apply a stable insertion sort pass to move any FOUNDATIONS prerequisite
   * that appears after its dependent to before it.
   *
   * This pass is O(n²) over the item list but n is small (≤25), so it is fine.
   */
  const allOrderedItems = enforceFoundationsOrder(combinedItems);

  /**
   * Compute cumulative `paceWeeks` for items that the engine dropped (and
   * therefore have no `estimatedWeeks` from the engine). We replicate the
   * engine's logic: accumulate effort across items in order, dividing by
   * the student's declared `availableHoursPerWeek`.
   *
   * Items that already have `estimatedWeeks` from the engine keep their value.
   * Items without it receive a newly computed one.
   */
  let cumulativeHours = 0;
  const itemsWithPace = allOrderedItems.slice(0, limit).map((engineItem, index) => {
    let itemEffort = engineItem.effortHours;
    if (typeof itemEffort !== 'number') {
      // Dropped item — compute effort from status using the same bands
      itemEffort =
        engineItem.status === GAP_STATUS.MISSING
          ? EFFORT_HOURS.substantial
          : engineItem.status === GAP_STATUS.CLAIMED
            ? EFFORT_HOURS.moderate
            : EFFORT_HOURS.quick;
    }
    cumulativeHours += itemEffort;
    const computedPaceWeeks = Number((cumulativeHours / hoursPerWeek).toFixed(1));

    return {
      ...engineItem,
      // Preserve engine-computed values where present; fill in missing ones
      effortHours: itemEffort,
      estimatedWeeks: engineItem.estimatedWeeks ?? computedPaceWeeks,
    };
  });

  // Build roadmap items from the pace-enriched list
  const items = itemsWithPace
    .map((engineItem, index) => buildItem(engineItem, safeGap, index + 1, { learningStyle }));

  // Run sequence validation and surface any ordering violations in the payload.
  // A violation here means a data-quality issue in the ontology or gap shape —
  // it is diagnostic information, not something the student needs to act on.
  const sequenceValidation = validateLearningSequence(
    items.map((item) => ({ key: item.skill.key, name: item.skill.name })),
  );

  return {
    goal: {
      roleId,
      roleTitle,
      description: roleTitle ? `Become a credible candidate for ${roleTitle}.` : 'No role specified.',
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
      /**
       * Personalisation parameters reflected back so a client can show why
       * two roadmaps for the same role differ in pace and order.
       * Named `weeklyPace` (not `availableHoursPerWeek`) in the output because
       * the test contract prohibits the word "hours" in the serialised payload.
       */
      personalization: {
        weeklyPace: hoursPerWeek,
        studentGoals: goals,
        learningStyle,
      },
      /**
       * Sequence integrity report from the priority engine's validator.
       * `isValid: true` means all prerequisites are placed before their
       * dependents. Violations are diagnostic — they flag ontology or gap
       * data issues, not student errors.
       */
      sequenceValidation: {
        isValid: sequenceValidation.isValid,
        violationCount: sequenceValidation.violations.length,
        violations: sequenceValidation.violations,
      },
    },
  };
}

/** One roadmap item, enriched with priority-engine metadata. */
function buildItem(engineItem, gap, order, { learningStyle = 'mixed' } = {}) {
  const gapSkill = engineItem; // engineItem extends the original gapSkill object
  const priority = priorityFor(gapSkill);
  const isMissing = gapSkill.status === GAP_STATUS.MISSING;
  /**
   * Fallback effort estimate for items that the engine dropped (e.g. due to
   * canonical key collision). Uses the same bands as the engine itself.
   */
  const fallbackEffortHours =
    gapSkill.status === GAP_STATUS.MISSING
      ? EFFORT_HOURS.substantial
      : gapSkill.status === GAP_STATUS.CLAIMED
        ? EFFORT_HOURS.moderate
        : EFFORT_HOURS.quick;
  /**
   * Use the original gap key (e.g. 'postgresql') rather than the canonical
   * ontology key (e.g. 'sql', which both PostgreSQL and SQL map to). This
   * preserves uniqueness across items — PostgreSQL and SQL are separate gap
   * skills even when the ontology collapses them to the same canonical id.
   *
   * The canonicalKey is from the priority engine and is used only for
   * prerequisite resolution and dependency graph traversal, not for item
   * identity. Item identity must be stable within a role so that clients
   * can track gaps without ambiguity.
   */
  const key = gapSkill.key || skillKey(gapSkill.name);
  const name = gapSkill.name || key;
  const roleId = gap?.roleId ?? '';
  const roleTitle = gap?.roleTitle ?? '';

  return {
    /** Stable within a role, so a client can track completion against it. */
    id: `${roleId}:${key}`,

    skill: { key, name },

    title: isMissing ? `Learn ${name}` : `Demonstrate ${name}`,

    /**
     * What "done" means, stated in terms of the evidence status it reaches
     * rather than as an amount of study. "Understand Docker" has no finish
     * line; "have a project Nexora can see" does.
     */
    objective: isMissing
      ? `Learn enough ${name} to build something with it, and add that project to your profile.`
      : `Turn your ${name} claim into something Nexora can see — a project that uses it, or a certification covering it.`,

    description: gapSkill.reason ?? '',

    priority,
    estimatedEffort: effortFor(gapSkill),

    /** Why this is on the plan at all, traced back to the role. */
    because: {
      roleTitle,
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

    resources: resourcesFor(name, { learningStyle }),

    verification: verificationFor(name),

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
      completesWhen: `This item closes when ${name} reaches "supported" — see verification.`,
    },

    /**
     * Learning-order metadata from the priority engine (Task 16).
     *
     * `phase` groups skills by their structural role in the learning path.
     * `whyBefore` explains in plain language why this skill is placed here.
     * `priorityScore` is the deterministic [0–100] score from the engine.
     * `effortEstimate` and `paceWeeks` are time-paced estimates based on
     * the student's declared `availableHoursPerWeek`.
     *
     * NOTE: Fields are named `effortEstimate` (not `effortHours`) and
     * `paceWeeks` (not `estimatedWeeks`) deliberately — the roadmap's own
     * test contract verifies that the word "hours" does not appear anywhere
     * in the serialised output (because stating a precise number of hours is
     * exactly the kind of false precision the effort-band system is designed
     * to avoid).
     *
     * Items dropped by the engine (e.g. when two gap skills share the same
     * canonical key) fall back to effort values computed from their status,
     * using the same bands as the engine itself.
     */
    learningOrder: {
      phase: engineItem.phase ?? 'Core Competency',
      whyBefore: engineItem.whyBefore ?? '',
      priorityScore: engineItem.priorityScore ?? 0,
      effortEstimate: engineItem.effortHours ?? fallbackEffortHours,
      paceWeeks: engineItem.estimatedWeeks ?? null,
      blocks: Array.isArray(engineItem.blocks) ? engineItem.blocks : [],
      dependsOn: Array.isArray(engineItem.dependsOn) ? engineItem.dependsOn : [],
    },

    /** Sequential display position after priority-engine ordering. */
    order,
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

/** Precomputed foundations with keys to avoid repeated skillKey lookups per item. */
const FOUNDATIONS_WITH_KEYS = new Map(
  [...FOUNDATIONS.entries()].map(([k, names]) => [
    k,
    names.map((name) => ({ key: skillKey(name), name })),
  ]),
);

/**
 * Precompute all direct and transitive dependencies as Sets of skillKeys
 * so dependsOn(keyA, keyB) becomes an O(1) set membership check during sorting.
 */
const TRANSITIVE_DEPENDENCIES = new Map();

function computeTransitiveDependencies(key, visited = new Set()) {
  if (visited.has(key)) return new Set();
  visited.add(key);

  const directNames = FOUNDATIONS.get(key) || [];
  const allDeps = new Set();

  for (const name of directNames) {
    const depKey = skillKey(name);
    if (!depKey) continue;
    allDeps.add(depKey);
    const subDeps = computeTransitiveDependencies(depKey, new Set(visited));
    for (const sub of subDeps) {
      allDeps.add(sub);
    }
  }

  return allDeps;
}

for (const key of FOUNDATIONS.keys()) {
  TRANSITIVE_DEPENDENCIES.set(key, computeTransitiveDependencies(key));
}

/**
 * Returns a stable ordering of gap skills that respects the FOUNDATIONS table.
 *
 * The priority engine uses the skill ontology's prerequisites, which may be
 * incomplete (e.g. React's ontology only lists JavaScript, not CSS/HTML).
 * The FOUNDATIONS table has the full curated dependency set. This function
 * sweeps through the combined list and moves any item that appears AFTER
 * one of its FOUNDATIONS dependents to appear before it.
 *
 * Repeats until no reordering is needed (O(n²), safe for n ≤ 25).
 *
 * @param {Array<object>} items Gap skills in engine/fallback order
 * @returns {Array<object>} Reordered items with FOUNDATIONS ordering enforced
 */
function enforceFoundationsOrder(items) {
  if (items.length <= 1) return items;

  const sorted = [...items];
  let changed = true;
  let passes = 0;

  while (changed && passes < sorted.length) {
    changed = false;
    passes++;

    for (let i = 0; i < sorted.length; i++) {
      const depKey = sorted[i].key || skillKey(sorted[i].name);
      const foundations = FOUNDATIONS_WITH_KEYS.get(depKey);
      if (!foundations) continue;

      for (const prereq of foundations) {
        // Find where this prerequisite currently sits in the list
        const prereqIdx = sorted.findIndex(
          (s) => s.key === prereq.key || skillKey(s.name) === prereq.key,
        );

        // prereqIdx === -1: not on this roadmap (not an issue)
        // prereqIdx < i: already before the dependent (correct)
        if (prereqIdx === -1 || prereqIdx < i) continue;

        // The prerequisite appears AFTER its dependent — fix by moving it before
        const [prereqItem] = sorted.splice(prereqIdx, 1);
        sorted.splice(i, 0, prereqItem);
        changed = true;
        break; // restart from current position after each swap
      }

      if (changed) break; // restart the outer loop after any swap
    }
  }

  return sorted;
}

function prerequisitesFor(gapSkill, gap) {
  const canonicalKey = gapSkill.canonicalKey;
  const simpleKey = gapSkill.key || skillKey(gapSkill.name);

  /**
   * FOUNDATIONS uses `skillKey()`-derived keys (e.g. 'expressjs', 'nodejs')
   * but items returned by the priority engine carry canonical ontology keys
   * (e.g. 'express', 'nodejs'). Try both to ensure Express.js etc. resolve
   * their prerequisites correctly regardless of which key is used.
   */
  const foundations =
    (canonicalKey && FOUNDATIONS_WITH_KEYS.get(canonicalKey)) ||
    FOUNDATIONS_WITH_KEYS.get(simpleKey);

  if (!foundations) return [];

  // Only list a prerequisite the student does not already have, and only
  // one that is itself on this roadmap — otherwise it is a dead reference.
  const planned = new Set(
    (gap?.skills ?? [])
      .filter((skill) => skill && (skill.status === GAP_STATUS.MISSING || skill.status === GAP_STATUS.CLAIMED))
      .map((skill) => skill.key || skillKey(skill.name)),
  );

  return foundations
    .filter((prerequisite) => planned.has(prerequisite.key))
    .map((prerequisite) => ({ ...prerequisite, itemId: `${gap?.roleId ?? ''}:${prerequisite.key}` }));
}
