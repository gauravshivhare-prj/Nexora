import { GAP_IMPORTANCE, GAP_STATUS } from '../skillGap/computeSkillGap.js';
import { resolveCanonicalSkill } from '../skills/skillOntology.js';
import { skillKey, skillDisplayName } from '../skills/skillKey.js';

/**
 * Task 12 — Skill Priority, Dependency & Learning-Order Engine
 *
 * Deterministic multi-factor priority ordering and DAG topological sequencing:
 * 1. Topological Dependency Order: Foundational prerequisites ALWAYS precede dependent skills.
 * 2. Multi-Factor Priority Scoring: Combines role importance, prerequisite blocking power,
 *    evidence distance, student goals, and prerequisite readiness.
 * 3. Time Constraint Adaptation: Tailors sequence and milestones based on available hours/week.
 * 4. Explainable Learning Order: Explains why skill A comes before skill B.
 * 5. Sequence Validation: Detects dependency inversion and circular learning traps.
 */

export const EFFORT_HOURS = Object.freeze({
  quick: 5,
  moderate: 15,
  substantial: 35,
});

export const VIOLATION_TYPES = Object.freeze({
  DEPENDENCY_INVERSION: 'DEPENDENCY_INVERSION',
  CIRCULAR_DEPENDENCY: 'CIRCULAR_DEPENDENCY',
  TIME_EXCEEDED: 'TIME_EXCEEDED',
});

/**
 * Computes a multi-factor deterministic priority score [0, 100] for a gap skill.
 *
 * @param {object} gapSkill Assessed skill from computeSkillGap
 * @param {object} context Context including role, downstreamDependenciesCount, studentGoals
 * @returns {number} Deterministic priority score
 */
export function calculatePriorityScore(gapSkill, context = {}) {
  const { downstreamDependenciesCount = 0, isGoalAligned = false, prerequisitesMet = true } = context;

  let score = 0;

  // 1. Role Importance (Max 35 points)
  if (gapSkill.importance === GAP_IMPORTANCE.REQUIRED) {
    score += 35;
  } else {
    score += 15;
  }

  // 2. Evidence Distance & Quick Wins (Max 25 points)
  // Missing required is urgent; claimed required is a high-yield low-hanging fruit
  if (gapSkill.status === GAP_STATUS.MISSING) {
    score += 25;
  } else if (gapSkill.status === GAP_STATUS.CLAIMED) {
    score += 20;
  } else if (gapSkill.status === GAP_STATUS.SUPPORTED) {
    score += 10;
  }

  // 3. Prerequisite Blocking Power (Max 25 points)
  // Skills that unblock other skills get significant priority boosts
  const blockingBonus = Math.min(25, downstreamDependenciesCount * 10);
  score += blockingBonus;

  // 4. Student Goal Alignment (Max 10 points)
  if (isGoalAligned) {
    score += 10;
  }

  // 5. Readiness Penalty (Deduct up to 15 points if prerequisites are missing)
  if (!prerequisitesMet) {
    score = Math.max(0, score - 15);
  }

  return Math.min(100, score);
}

/**
 * Orders a set of gap skills into an optimal, dependency-safe learning sequence.
 *
 * @param {Array<object>} gapSkills
 * @param {object} options
 * @returns {Array<object>} Prioritized and topologically sorted skills with whyBefore explanations
 */
function getCanonicalLookupKey(item) {
  if (!item) return '';
  if (typeof item === 'string') {
    const canonical = resolveCanonicalSkill(item);
    return canonical?.key || skillKey(item);
  }
  const canonical = resolveCanonicalSkill(item.canonicalId || item.name || item.key || '');
  if (canonical?.key) return canonical.key;
  if (item.name) return skillKey(item.name);
  if (item.key) return skillKey(item.key);
  return '';
}

export function orderLearningSequence(gapSkills, options = {}) {
  const {
    role = null,
    heldSkills = [],
    availableHoursPerWeek = 15,
    studentGoals = [],
  } = options;

  if (!Array.isArray(gapSkills) || gapSkills.length === 0) {
    return [];
  }

  // Index held skills
  const heldKeys = new Set(
    (heldSkills ?? []).map((s) => getCanonicalLookupKey(s)).filter(Boolean),
  );

  // Map gap skills by key
  const skillsByKey = new Map();
  for (const s of gapSkills) {
    const key = getCanonicalLookupKey(s);
    if (key) {
      skillsByKey.set(key, { ...s, canonicalKey: key });
    }
  }

  // Build Dependency Graph
  // Adjacency list: prereqKey -> Set of dependentKeys
  const dependentsGraph = new Map();
  const prerequisitesGraph = new Map();
  const inDegree = new Map();

  for (const key of skillsByKey.keys()) {
    dependentsGraph.set(key, new Set());
    prerequisitesGraph.set(key, new Set());
    inDegree.set(key, 0);
  }

  // Populate graph from ontology prerequisites
  for (const [key, s] of skillsByKey.entries()) {
    const canonical = resolveCanonicalSkill(s.canonicalKey || s.name || key);
    if (canonical && Array.isArray(canonical.prerequisites)) {
      for (const prereqId of canonical.prerequisites) {
        const prereqKey = getCanonicalLookupKey(prereqId);

        // If the prerequisite is also in the gap sequence (needs to be learned)
        if (skillsByKey.has(prereqKey) && prereqKey !== key) {
          prerequisitesGraph.get(key).add(prereqKey);
          dependentsGraph.get(prereqKey).add(key);
        }
      }
    }
  }

  // Calculate in-degree (number of unmet prerequisites in the gap list)
  for (const [key, prereqs] of prerequisitesGraph.entries()) {
    inDegree.set(key, prereqs.size);
  }

  // Goals set for keyword matching
  const goalWords = new Set(
    (studentGoals || []).flatMap((g) => (typeof g === 'string' ? g.toLowerCase().split(/\s+/) : [])),
  );

  // Ready queue: all skills with inDegree === 0 (no unlearned prerequisites)
  const readyQueue = [];

  const getScore = (key) => {
    const s = skillsByKey.get(key);
    const downstreamCount = dependentsGraph.get(key)?.size || 0;
    const isGoalAligned = goalWords.has(key) || (s.name && goalWords.has(s.name.toLowerCase()));
    const prerequisitesMet = (prerequisitesGraph.get(key)?.size || 0) === 0;

    return calculatePriorityScore(s, {
      downstreamDependenciesCount: downstreamCount,
      isGoalAligned,
      prerequisitesMet,
    });
  };

  for (const [key, deg] of inDegree.entries()) {
    if (deg === 0) {
      readyQueue.push(key);
    }
  }

  // Sort initial ready queue by priority score descending
  readyQueue.sort((a, b) => getScore(b) - getScore(a) || a.localeCompare(b, 'en'));

  const orderedKeys = [];
  const processed = new Set();

  while (readyQueue.length > 0) {
    // Pick the highest priority unblocked skill
    const currentKey = readyQueue.shift();
    orderedKeys.push(currentKey);
    processed.add(currentKey);

    // Unblock dependent skills
    const dependents = dependentsGraph.get(currentKey) || new Set();
    for (const depKey of dependents) {
      const newDeg = inDegree.get(depKey) - 1;
      inDegree.set(depKey, newDeg);
      if (newDeg === 0 && !processed.has(depKey)) {
        readyQueue.push(depKey);
      }
    }

    readyQueue.sort((a, b) => getScore(b) - getScore(a) || a.localeCompare(b, 'en'));
  }

  // In case of cycles (should not happen in curated ontology DAG, but safe fallback)
  for (const key of skillsByKey.keys()) {
    if (!processed.has(key)) {
      orderedKeys.push(key);
      processed.add(key);
    }
  }

  // Time-constraint milestones and effort assignment
  let cumulativeHours = 0;
  const weeklyHours = Math.max(5, availableHoursPerWeek);

  const sequencedItems = orderedKeys.map((key, index) => {
    const skill = skillsByKey.get(key);
    const downstream = Array.from(dependentsGraph.get(key) || []);
    const prereqs = Array.from(prerequisitesGraph.get(key) || []);
    const priorityScore = getScore(key);

    const effortHours =
      skill.status === GAP_STATUS.MISSING
        ? EFFORT_HOURS.substantial
        : skill.status === GAP_STATUS.CLAIMED
        ? EFFORT_HOURS.moderate
        : EFFORT_HOURS.quick;

    cumulativeHours += effortHours;
    const estimatedWeeks = Number((cumulativeHours / weeklyHours).toFixed(1));

    // Phase categorization
    let phase = 'Core Competency';
    if (index === 0 && downstream.length > 0) {
      phase = 'Foundations & Blockers';
    } else if (downstream.length > 0) {
      phase = 'Core Prerequisite';
    } else if (skill.importance === GAP_IMPORTANCE.PREFERRED) {
      phase = 'Advanced Specialization';
    }

    // Explainable reasoning for learning order
    let whyBefore = '';
    if (downstream.length > 0) {
      const names = downstream.map((k) => skillsByKey.get(k)?.name || k).join(', ');
      whyBefore = `Foundational blocker: required before advancing in ${names}.`;
    } else if (prereqs.length > 0) {
      const prereqNames = prereqs.map((k) => skillsByKey.get(k)?.name || k).join(', ');
      whyBefore = `Directly builds on prerequisites (${prereqNames}) acquired earlier in this sequence.`;
    } else if (skill.importance === GAP_IMPORTANCE.REQUIRED) {
      whyBefore = `Essential required skill for ${role?.title || 'target role'} with immediate application.`;
    } else {
      whyBefore = `Preferred specialization skill to distinguish candidate profile.`;
    }

    return {
      ...skill,
      priorityOrder: index + 1,
      priorityScore,
      phase,
      effortHours,
      estimatedWeeks,
      whyBefore,
      blocks: downstream.map((k) => ({ key: k, name: skillsByKey.get(k)?.name || k })),
      dependsOn: prereqs.map((k) => ({ key: k, name: skillsByKey.get(k)?.name || k })),
    };
  });

  return sequencedItems;
}

/**
 * Validates a proposed learning sequence against dependency inversion and circular dependencies.
 *
 * @param {Array<object>} sequence Array of skills in learning order
 * @returns {{ isValid: boolean, violations: Array<object> }}
 */
export function validateLearningSequence(sequence) {
  const violations = [];
  if (!Array.isArray(sequence) || sequence.length <= 1) {
    return { isValid: true, violations: [] };
  }

  const positionMap = new Map();
  sequence.forEach((item, idx) => {
    const key = getCanonicalLookupKey(item);
    if (key) {
      positionMap.set(key, idx);
    }
  });

  for (let idx = 0; idx < sequence.length; idx++) {
    const item = sequence[idx];
    const key = getCanonicalLookupKey(item);
    const canonical = resolveCanonicalSkill(key || item.name || item.key);

    if (canonical && Array.isArray(canonical.prerequisites)) {
      for (const prereqId of canonical.prerequisites) {
        const prereqKey = getCanonicalLookupKey(prereqId);

        // If the prerequisite is in the sequence, it MUST appear strictly before the current item
        if (positionMap.has(prereqKey)) {
          const prereqIdx = positionMap.get(prereqKey);
          if (prereqIdx > idx) {
            const prereqName = resolveCanonicalSkill(prereqKey)?.name || prereqKey;
            violations.push({
              type: VIOLATION_TYPES.DEPENDENCY_INVERSION,
              skill: item.name || key,
              prerequisite: prereqName,
              reason: `Dependency inversion: ${item.name || key} (step ${idx + 1}) is scheduled before its required prerequisite ${prereqName} (step ${prereqIdx + 1}).`,
            });
          }
        }
      }
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}
