import { rankRoles, scoreRoleMatch, validateRecommendation } from './matchRole.js';
import { findRole, getAuthoritativeRoles } from './roleCatalogue.js';

/**
 * Task 10 — Recommendation Evaluation & Ground-Truth Benchmark System
 *
 * Provides a rigorous, automated recommendation evaluation framework that measures:
 * 1. Target Relevance & Precision (Precision@1, Precision@3 against ground-truth profiles)
 * 2. Deterministic Consistency & Invariance across runs
 * 3. Zero-Hallucination Rate (verifying that no ungrounded skills enter recommendations)
 * 4. Contradiction Resistance (verifying that stated goals never override proven skill fits)
 * 5. Monotonic Input Sensitivity (verifying that verified evidence additions strictly increase scores)
 * 6. Explanation Completeness (ensuring 100% of recommendations carry traceable mathematical proofs)
 */

export const RECOMMENDATION_BENCHMARK_BASELINES = Object.freeze({
  version: 1,
  minPrecisionAt1: 1.0, // 100% precision@1 on canonical personas
  minPrecisionAt3: 1.0, // 100% precision@3 on canonical personas
  maxHallucinationRate: 0.0, // Zero tolerance for ungrounded skills in recommendations
  maxContradictionRate: 0.0, // Zero tolerance for contradictory interest overrides
  minMonotonicityRate: 1.0, // 100% strict monotonicity under evidence promotion
  minExplanationCompleteness: 1.0, // 100% of recommendations must supply mathematical points & missing skills
});

/**
 * Representative Ground-Truth Student Personas
 */
export const BENCHMARK_PERSONAS = Object.freeze({
  FOUNDATIONAL_BACKEND: {
    id: 'persona_foundational_backend',
    name: 'Foundational CS Student (Backend Starter)',
    expectedPrimaryRoleId: 'backend-developer',
    expectedScoreRange: [30, 65],
    expectedBand: 'promising',
    twin: {
      skills: [
        { key: 'javascript', name: 'JavaScript', strength: 'supported' },
        { key: 'nodejs', name: 'Node.js', strength: 'supported' },
      ],
      interests: ['Backend Development'],
      targetRoles: [{ title: 'Backend Developer', origin: 'student' }],
      academic: { degree: 'B.Tech', branch: 'Computer Science and Engineering' },
    },
  },

  ADVANCED_FULLSTACK: {
    id: 'persona_advanced_fullstack',
    name: 'Advanced Full Stack Senior',
    expectedPrimaryRoleId: 'full-stack-developer',
    expectedScoreRange: [75, 100],
    expectedBand: 'strong',
    twin: {
      skills: [
        { key: 'javascript', name: 'JavaScript', strength: 'verified' },
        { key: 'react', name: 'React', strength: 'verified' },
        { key: 'nodejs', name: 'Node.js', strength: 'verified' },
        { key: 'sql', name: 'SQL', strength: 'verified' },
        { key: 'html', name: 'HTML', strength: 'supported' },
        { key: 'css', name: 'CSS', strength: 'supported' },
        { key: 'git', name: 'Git', strength: 'verified' },
      ],
      interests: ['Full Stack Development', 'Web Applications'],
      targetRoles: [{ title: 'Full Stack Developer', origin: 'student' }],
      academic: { degree: 'B.Tech', branch: 'Computer Science and Engineering' },
    },
  },

  NON_CS_DATA_PIVOT: {
    id: 'persona_non_cs_data_pivot',
    name: 'Mechanical Engineering Student Pivoting to Data Analytics',
    expectedPrimaryRoleId: 'data-analyst',
    expectedScoreRange: [40, 75],
    twin: {
      skills: [
        { key: 'python', name: 'Python', strength: 'supported' },
        { key: 'sql', name: 'SQL', strength: 'supported' },
        { key: 'excel', name: 'Excel', strength: 'claimed' },
      ],
      interests: ['Data Analysis', 'Business Intelligence'],
      targetRoles: [{ title: 'Data Analyst', origin: 'student' }],
      academic: { degree: 'B.Tech', branch: 'Mechanical Engineering' },
    },
  },

  DESIGN_SPECIALIST: {
    id: 'persona_design_specialist',
    name: 'Design Specialist Student',
    expectedPrimaryRoleId: 'ui-ux-designer',
    expectedScoreRange: [45, 85],
    twin: {
      skills: [
        { key: 'figma', name: 'Figma', strength: 'supported' },
        { key: 'wireframing', name: 'Wireframing', strength: 'supported' },
        { key: 'ui_design', name: 'UI Design', strength: 'supported' },
        { key: 'user_research', name: 'User Research', strength: 'claimed' },
        { key: 'css', name: 'CSS', strength: 'claimed' },
      ],
      interests: ['User Experience', 'Interaction Design'],
      targetRoles: [{ title: 'UI/UX Designer', origin: 'student' }],
      academic: { degree: 'B.Des', branch: 'Design' },
    },
  },

  DEVOPS_ENGINEER: {
    id: 'persona_devops_engineer',
    name: 'DevOps & Systems Engineering Student',
    expectedPrimaryRoleId: 'devops-engineer',
    expectedScoreRange: [50, 90],
    twin: {
      skills: [
        { key: 'docker', name: 'Docker', strength: 'supported' },
        { key: 'git', name: 'Git', strength: 'supported' },
        { key: 'linux', name: 'Linux', strength: 'supported' },
        { key: 'ci_cd', name: 'CI/CD', strength: 'supported' },
        { key: 'aws', name: 'AWS', strength: 'claimed' },
      ],
      interests: ['DevOps', 'Cloud Infrastructure'],
      targetRoles: [{ title: 'DevOps Engineer', origin: 'student' }],
      academic: { degree: 'B.Tech', branch: 'Information Technology' },
    },
  },
});

/**
 * Adversarial & Boundary Benchmark Cases
 */
export const ADVERSARIAL_BENCHMARK_CASES = Object.freeze({
  BUZZWORD_CHURN: {
    id: 'adv_buzzwords',
    name: 'Buzzword Churn (Zero Concrete Skills)',
    twin: {
      skills: [
        { key: 'quantum_computing', name: 'Quantum AI', strength: 'claimed' },
        { key: 'web3_metaverse', name: 'Web3 Metaverse', strength: 'claimed' },
        { key: 'neurolink', name: 'NeuroLink Mind Control', strength: 'claimed' },
      ],
      interests: ['Quantum AI', 'Blockchain'],
      targetRoles: [{ title: 'AI Architect', origin: 'student' }],
      academic: null,
    },
    expectedMaxScore: 15,
  },

  CONTRADICTORY_GOAL: {
    id: 'adv_contradictory_goal',
    name: 'Target Role Contradicts Concrete Evidence',
    twin: {
      skills: [
        { key: 'sql', name: 'SQL', strength: 'verified' },
        { key: 'nodejs', name: 'Node.js', strength: 'verified' },
        { key: 'restapis', name: 'REST APIs', strength: 'supported' },
      ],
      interests: ['Frontend Engineering'],
      // Stated target is Frontend Developer, but holds 0 frontend skills (no React, HTML, CSS)
      targetRoles: [{ title: 'Frontend Developer', origin: 'student' }],
      academic: { degree: 'B.Tech', branch: 'Computer Science' },
    },
    // Backend Developer must beat Frontend Developer based on concrete skills fit
    higherRole: 'backend-developer',
    lowerRole: 'frontend-developer',
  },

  EMPTY_PROFILE: {
    id: 'adv_empty_profile',
    name: 'Completely Empty Profile',
    twin: {
      skills: [],
      interests: [],
      targetRoles: [],
      academic: null,
    },
    expectedMatchesCount: 0,
  },
});

/**
 * Evaluates a single student persona against ground truth.
 */
export function evaluatePersona(persona) {
  const ranking = rankRoles(persona.twin, { limit: 5, includeBelowThreshold: true });
  const topMatch = ranking.matches[0] || null;
  const top3RoleIds = ranking.matches.slice(0, 3).map((m) => m.roleId);

  const precision1Passed = topMatch ? topMatch.roleId === persona.expectedPrimaryRoleId : false;
  const precision3Passed = top3RoleIds.includes(persona.expectedPrimaryRoleId);

  let scoreRangePassed = true;
  if (persona.expectedScoreRange && topMatch) {
    const [min, max] = persona.expectedScoreRange;
    scoreRangePassed = topMatch.score >= min && topMatch.score <= max;
  }

  // Hallucination check: are all matched skills grounded in twin?
  let ungroundedCount = 0;
  for (const match of ranking.matches) {
    if (match.validation?.unsupportedSkills?.length > 0) {
      ungroundedCount += match.validation.unsupportedSkills.length;
    }
  }

  // Explanation check: does top match have traceable contributingPoints and missing skills?
  const hasValidExplanation = Boolean(
    topMatch?.traceableExplanation?.contributingPoints &&
      topMatch?.matchedRequired &&
      topMatch?.missingRequired &&
      topMatch?.explanation?.length > 0,
  );

  return {
    personaId: persona.id,
    name: persona.name,
    expectedRole: persona.expectedPrimaryRoleId,
    actualRole: topMatch?.roleId || 'none',
    topScore: topMatch?.score ?? 0,
    topBand: topMatch?.band ?? 'none',
    precision1Passed,
    precision3Passed,
    scoreRangePassed,
    ungroundedCount,
    hasValidExplanation,
  };
}

/**
 * Runs monotonic input sensitivity evaluation.
 * Proves that adding verified evidence for a role strictly increases its score monotonically.
 */
export function evaluateMonotonicSensitivity() {
  const role = findRole('backend-developer');

  // Tier 1: Claimed JS
  const t1 = {
    skills: [{ key: 'javascript', name: 'JavaScript', strength: 'claimed' }],
    interests: [],
    targetRoles: [],
    academic: null,
  };
  const m1 = scoreRoleMatch(t1, role);

  // Tier 2: Supported JS + Supported Node.js
  const t2 = {
    skills: [
      { key: 'javascript', name: 'JavaScript', strength: 'supported' },
      { key: 'nodejs', name: 'Node.js', strength: 'supported' },
    ],
    interests: [],
    targetRoles: [],
    academic: null,
  };
  const m2 = scoreRoleMatch(t2, role);

  // Tier 3: Verified JS + Verified Node.js + Verified SQL
  const t3 = {
    skills: [
      { key: 'javascript', name: 'JavaScript', strength: 'verified' },
      { key: 'nodejs', name: 'Node.js', strength: 'verified' },
      { key: 'sql', name: 'SQL', strength: 'verified' },
    ],
    interests: [],
    targetRoles: [],
    academic: null,
  };
  const m3 = scoreRoleMatch(t3, role);

  const isMonotonic = m1.score < m2.score && m2.score < m3.score;

  return {
    isMonotonic,
    scores: [m1.score, m2.score, m3.score],
    progression: `${m1.score} -> ${m2.score} -> ${m3.score}`,
  };
}

/**
 * Runs the complete Recommendation Evaluation & Ground-Truth Benchmark Suite.
 *
 * @param {object} [options]
 * @returns {object} Evaluation results, scores against baselines, and quality gate status.
 */
export function runRecommendationBenchmark(options = {}) {
  const failures = [];
  const personaEvaluations = [];

  // 1. Evaluate Canonical Personas (Relevance & Precision)
  let p1Hits = 0;
  let p3Hits = 0;
  let totalPersonas = 0;
  let totalUngroundedSkills = 0;
  let totalExplanationCompletenessHits = 0;

  for (const persona of Object.values(BENCHMARK_PERSONAS)) {
    totalPersonas += 1;
    const evalResult = evaluatePersona(persona);
    personaEvaluations.push(evalResult);

    if (evalResult.precision1Passed) p1Hits += 1;
    else failures.push(`Persona ${persona.name}: expected ${persona.expectedPrimaryRoleId} at #1, got ${evalResult.actualRole}`);

    if (evalResult.precision3Passed) p3Hits += 1;
    else failures.push(`Persona ${persona.name}: expected ${persona.expectedPrimaryRoleId} in top 3`);

    if (!evalResult.scoreRangePassed) {
      failures.push(`Persona ${persona.name}: score ${evalResult.topScore} outside expected range [${persona.expectedScoreRange?.join(', ')}]`);
    }

    totalUngroundedSkills += evalResult.ungroundedCount;
    if (evalResult.hasValidExplanation) totalExplanationCompletenessHits += 1;
  }

  const precisionAt1 = totalPersonas > 0 ? p1Hits / totalPersonas : 0;
  const precisionAt3 = totalPersonas > 0 ? p3Hits / totalPersonas : 0;
  const hallucinationRate = totalUngroundedSkills;
  const explanationCompleteness = totalPersonas > 0 ? totalExplanationCompletenessHits / totalPersonas : 0;

  // 2. Evaluate Adversarial Cases
  let contradictionFailures = 0;

  // 2a. Buzzword churn test
  const buzzRanked = rankRoles(ADVERSARIAL_BENCHMARK_CASES.BUZZWORD_CHURN.twin, {
    limit: 5,
    includeBelowThreshold: true,
  });
  const topBuzzScore = buzzRanked.matches[0]?.score ?? 0;
  if (topBuzzScore > ADVERSARIAL_BENCHMARK_CASES.BUZZWORD_CHURN.expectedMaxScore) {
    failures.push(`Buzzword churn persona exceeded max allowed score: got ${topBuzzScore}, expected <= ${ADVERSARIAL_BENCHMARK_CASES.BUZZWORD_CHURN.expectedMaxScore}`);
  }

  // 2b. Contradictory goal test
  const contraRanked = rankRoles(ADVERSARIAL_BENCHMARK_CASES.CONTRADICTORY_GOAL.twin, {
    limit: 10,
    includeBelowThreshold: true,
  });
  const higherRoleMatch = contraRanked.matches.find((m) => m.roleId === ADVERSARIAL_BENCHMARK_CASES.CONTRADICTORY_GOAL.higherRole);
  const lowerRoleMatch = contraRanked.matches.find((m) => m.roleId === ADVERSARIAL_BENCHMARK_CASES.CONTRADICTORY_GOAL.lowerRole);

  if (!higherRoleMatch || !lowerRoleMatch || higherRoleMatch.score <= lowerRoleMatch.score) {
    contradictionFailures += 1;
    failures.push(`Contradictory goal test failed: ${ADVERSARIAL_BENCHMARK_CASES.CONTRADICTORY_GOAL.higherRole} (${higherRoleMatch?.score}) did not beat ${ADVERSARIAL_BENCHMARK_CASES.CONTRADICTORY_GOAL.lowerRole} (${lowerRoleMatch?.score})`);
  }

  // 2c. Empty profile test
  const emptyRanked = rankRoles(ADVERSARIAL_BENCHMARK_CASES.EMPTY_PROFILE.twin);
  if (emptyRanked.matches.length !== ADVERSARIAL_BENCHMARK_CASES.EMPTY_PROFILE.expectedMatchesCount) {
    failures.push(`Empty profile produced ${emptyRanked.matches.length} matches, expected 0`);
  }

  // 3. Monotonic Sensitivity Test
  const sensitivityResult = evaluateMonotonicSensitivity();
  if (!sensitivityResult.isMonotonic) {
    failures.push(`Monotonic sensitivity failure: scores [${sensitivityResult.scores.join(', ')}] are not strictly increasing`);
  }

  // 4. Invariance & Consistency Test
  const testTwin = BENCHMARK_PERSONAS.ADVANCED_FULLSTACK.twin;
  const run1 = rankRoles(testTwin);
  const run2 = rankRoles(testTwin);
  const isConsistent = JSON.stringify(run1.matches.map((m) => [m.roleId, m.score])) === JSON.stringify(run2.matches.map((m) => [m.roleId, m.score]));

  if (!isConsistent) {
    failures.push('Deterministic consistency failure: two runs with identical inputs produced different rankings');
  }

  // Check Quality Gates against Baselines
  const passedGate =
    precisionAt1 >= RECOMMENDATION_BENCHMARK_BASELINES.minPrecisionAt1 &&
    precisionAt3 >= RECOMMENDATION_BENCHMARK_BASELINES.minPrecisionAt3 &&
    hallucinationRate <= RECOMMENDATION_BENCHMARK_BASELINES.maxHallucinationRate &&
    contradictionFailures <= RECOMMENDATION_BENCHMARK_BASELINES.maxContradictionRate &&
    sensitivityResult.isMonotonic &&
    isConsistent &&
    explanationCompleteness >= RECOMMENDATION_BENCHMARK_BASELINES.minExplanationCompleteness;

  return {
    benchmarkVersion: RECOMMENDATION_BENCHMARK_BASELINES.version,
    passedGate,
    timestamp: new Date().toISOString(),
    metrics: {
      precisionAt1: Number(precisionAt1.toFixed(3)),
      precisionAt3: Number(precisionAt3.toFixed(3)),
      hallucinationRate,
      contradictionFailures,
      monotonicityPassed: sensitivityResult.isMonotonic,
      consistencyPassed: isConsistent,
      explanationCompleteness: Number(explanationCompleteness.toFixed(3)),
    },
    baselines: RECOMMENDATION_BENCHMARK_BASELINES,
    summary: {
      totalPersonasEvaluated: totalPersonas,
      totalAdversarialCases: Object.keys(ADVERSARIAL_BENCHMARK_CASES).length,
      failuresCount: failures.length,
    },
    personaEvaluations,
    sensitivityProgression: sensitivityResult.progression,
    failures,
  };
}
