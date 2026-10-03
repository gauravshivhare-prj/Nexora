import { canonicalSkill } from '../skills/skillKey.js';
import { redactSensitiveSecrets, redactProviderErrors } from './interviewFeedbackSafety.js';

/**
 * Common generic evaluation phrases that lack technical specificity.
 */
export const GENERIC_FEEDBACK_PHRASES = Object.freeze([
  'good job',
  'great answer',
  'well done',
  'keep it up',
  'nice try',
  'you answered the question',
  'you answered well',
  'good explanation',
  'satisfactory answer',
  'needs more practice',
  'study more',
  'do better',
  'adequate response',
  'keep studying',
  'okay answer',
]);

/**
 * Actionable recommendation trigger verbs indicating constructive guidance.
 */
export const ACTIONABLE_VERBS = Object.freeze([
  'consider',
  'practice',
  'explore',
  'implement',
  'review',
  'benchmark',
  'optimize',
  'profile',
  'refactor',
  'examine',
  'investigate',
  'elaborate',
  'contrast',
  'mention',
  'remember',
  'ensure',
  'avoid',
  'test',
  'measure',
  'verify',
]);

/**
 * Canonical model drift canary baselines.
 * 5 standard scenarios tracking expected score ranges and dimensions.
 */
export const CANARY_BASELINES = Object.freeze([
  {
    id: 'canary-node-event-loop',
    skill: 'nodejs',
    difficulty: 'intermediate',
    expectedScore: 0.94,
    minScore: 0.85,
    maxScore: 1.0,
    expectedDimensions: { accuracy: 0.95, depth: 0.9, clarity: 0.95, relevance: 1.0 },
  },
  {
    id: 'canary-py-gil',
    skill: 'python',
    difficulty: 'intermediate',
    expectedScore: 0.94,
    minScore: 0.85,
    maxScore: 1.0,
    expectedDimensions: { accuracy: 0.95, depth: 0.9, clarity: 0.95, relevance: 1.0 },
  },
  {
    id: 'canary-react-useeffect',
    skill: 'react',
    difficulty: 'beginner',
    expectedScore: 0.82,
    minScore: 0.72,
    maxScore: 0.92,
    expectedDimensions: { accuracy: 0.85, depth: 0.75, clarity: 0.85, relevance: 0.9 },
  },
  {
    id: 'canary-sql-indexes',
    skill: 'sql',
    difficulty: 'advanced',
    expectedScore: 0.45,
    minScore: 0.35,
    maxScore: 0.55,
    expectedDimensions: { accuracy: 0.5, depth: 0.35, clarity: 0.6, relevance: 0.45 },
  },
  {
    id: 'canary-docker-cgroups',
    skill: 'docker',
    difficulty: 'advanced',
    expectedScore: 0.35,
    minScore: 0.2,
    maxScore: 0.45,
    expectedDimensions: { accuracy: 0.4, depth: 0.2, clarity: 0.5, relevance: 0.35 },
  },
]);

function stemWord(word) {
  return word.replace(/(?:ing|edly|tion|ment|ies|ed|es|s)$/g, '');
}

/**
 * Tokenizes text into normalized content terms (stripping short punctuation and stop words).
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function extractContentTerms(text) {
  if (typeof text !== 'string') return new Set();
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'were', 'which',
    'will', 'your', 'about', 'more', 'when', 'some', 'what', 'into', 'them', 'they',
    'also', 'each', 'make', 'like', 'then', 'than', 'only', 'such', 'very', 'been',
  ]);

  const result = new Set();
  for (const token of tokens) {
    if (!stopWords.has(token)) {
      result.add(token);
      const stemmed = stemWord(token);
      if (stemmed.length > 2) {
        result.add(stemmed);
      }
    }
  }
  return result;
}

/**
 * Checks whether skills claimed in groundedSkills are genuinely supported
 * by textual evidence in the candidate answer or question prompt.
 *
 * @param {string[]} groundedSkills
 * @param {object} context
 * @param {string} [context.answerText='']
 * @param {string} [context.questionPrompt='']
 * @param {string} [context.targetSkill='']
 * @returns {{ hallucinatedSkills: string[], validSkills: string[], hasHallucinations: boolean }}
 */
export function detectHallucinatedSkills(groundedSkills = [], {
  answerText = '',
  questionPrompt = '',
  targetSkill = '',
} = {}) {
  const safeSkills = Array.isArray(groundedSkills) ? groundedSkills : [];
  const normalizedAnswer = String(answerText || '').toLowerCase();
  const normalizedQuestion = String(questionPrompt || '').toLowerCase();
  const targetCanonical = canonicalSkill(targetSkill);
  const targetKey = targetCanonical?.key || targetSkill.toLowerCase();

  const validSkills = [];
  const hallucinatedSkills = [];

  for (const skill of safeSkills) {
    if (typeof skill !== 'string' || skill.trim() === '') continue;
    const canonical = canonicalSkill(skill.trim());
    const skillName = canonical?.name || skill.trim();
    const skillKey = canonical?.key || skillName.toLowerCase();

    // The target skill is always valid if asked in the question
    if (skillKey === targetKey) {
      validSkills.push(skillName);
      continue;
    }

    // Check if the skill name or key appears in answer or question text
    const searchTerms = [
      skillKey,
      skillName.toLowerCase(),
      skillName.toLowerCase().replace(/[^a-z0-9]/g, ''),
    ];

    const hasEvidence = searchTerms.some(
      (term) =>
        term.length >= 3 &&
        (normalizedAnswer.includes(term) || normalizedQuestion.includes(term)),
    );

    if (hasEvidence) {
      validSkills.push(skillName);
    } else {
      hallucinatedSkills.push(skillName);
    }
  }

  return {
    hallucinatedSkills,
    validSkills,
    hasHallucinations: hallucinatedSkills.length > 0,
  };
}

/**
 * Evaluates the quality, specificity, actionability, and hallucination risk
 * of an interview answer evaluation and feedback response.
 *
 * Pure deterministic function — no I/O, no DB access, no network.
 *
 * @param {object} evaluation Evaluator feedback object
 * @param {string} [evaluation.feedback]
 * @param {string[]} [evaluation.strengths]
 * @param {string[]} [evaluation.growthAreas]
 * @param {string[]} [evaluation.groundedSkills]
 * @param {object} [evaluation.dimensions]
 * @param {object} context
 * @param {object} [context.question]
 * @param {string} [context.answerText]
 * @returns {object} Quality assessment report
 */
export function scoreFeedbackQuality(evaluation = {}, context = {}) {
  const feedback = typeof evaluation === 'string'
    ? evaluation
    : String(evaluation?.feedback || '');
  const strengths = Array.isArray(evaluation?.strengths) ? evaluation.strengths : [];
  const growthAreas = Array.isArray(evaluation?.growthAreas) ? evaluation.growthAreas : [];
  const groundedSkills = Array.isArray(evaluation?.groundedSkills) ? evaluation.groundedSkills : [];

  const question = context.question || {};
  const questionPrompt = question.prompt || question.questionPrompt || '';
  const targetSkill = question.targetSkill || question.skill || '';
  const answerText = String(context.answerText || '');

  const reasons = [];

  // ─── 1. Specificity (0.0 to 1.0) ──────────────────────────────────────────
  const feedbackLower = feedback.toLowerCase();
  let genericPhraseMatches = 0;
  for (const phrase of GENERIC_FEEDBACK_PHRASES) {
    if (feedbackLower.includes(phrase)) {
      genericPhraseMatches++;
    }
  }

  const answerTerms = extractContentTerms(answerText);
  const questionTerms = extractContentTerms(questionPrompt);
  const allContextTerms = new Set([...answerTerms, ...questionTerms]);

  const combinedEvaluationText = `${feedback} ${strengths.join(' ')} ${growthAreas.join(' ')}`;
  const feedbackTerms = extractContentTerms(combinedEvaluationText);
  let technicalOverlaps = 0;
  for (const term of feedbackTerms) {
    if (allContextTerms.has(term)) {
      technicalOverlaps++;
    }
  }

  // Calculate specificity based on technical overlap and generic penalty
  let specificity = 0.5;
  if (technicalOverlaps >= 4) {
    specificity = 0.95;
  } else if (technicalOverlaps >= 2) {
    specificity = 0.80;
  } else if (technicalOverlaps === 1) {
    specificity = 0.60;
  } else {
    specificity = 0.30;
    reasons.push('Feedback does not cite specific technical concepts from the question or answer.');
  }

  if (genericPhraseMatches > 0) {
    const penalty = Math.min(0.35, genericPhraseMatches * 0.15);
    specificity = Math.max(0.1, specificity - penalty);
    reasons.push(`Feedback contains generic boilerplate phrasing (${genericPhraseMatches} match).`);
  }

  // ─── 2. Actionability (0.0 to 1.0) ────────────────────────────────────────
  let actionableSuggestions = 0;
  const growthText = growthAreas.join(' ').toLowerCase();
  const fullConstructiveText = `${feedbackLower} ${growthText}`;

  for (const verb of ACTIONABLE_VERBS) {
    if (fullConstructiveText.includes(verb)) {
      actionableSuggestions++;
    }
  }

  let actionability = 0.5;
  if (actionableSuggestions >= 2) {
    actionability = 0.95;
  } else if (actionableSuggestions === 1) {
    actionability = 0.75;
  } else if (growthAreas.length > 0) {
    actionability = 0.40;
    reasons.push('Growth areas lack specific actionable verbs (practice, explore, implement, optimize).');
  } else {
    actionability = 0.30;
    reasons.push('No concrete or actionable suggestions detected in growth areas or feedback.');
  }

  // ─── 3. Relevance (0.0 to 1.0) ────────────────────────────────────
  const canonical = canonicalSkill(targetSkill);
  const targetKey = canonical?.key || targetSkill.toLowerCase();
  let relevance = 0.7;

  const combinedLower = combinedEvaluationText.toLowerCase();
  const groundedKeys = groundedSkills.map((s) => canonicalSkill(s)?.key || s.toLowerCase());

  if (
    targetKey &&
    (combinedLower.includes(targetKey) ||
      (canonical && combinedLower.includes(canonical.name.toLowerCase())) ||
      groundedKeys.includes(targetKey))
  ) {
    relevance = 0.95;
  } else if (technicalOverlaps >= 2) {
    relevance = 0.85;
  } else {
    relevance = 0.50;
    reasons.push(`Feedback does not explicitly reference target skill "${targetSkill || 'General'}".`);
  }

  // ─── 4. Hallucination Risk & Detection ────────────────────────────────────
  const skillHallucinations = detectHallucinatedSkills(groundedSkills, {
    answerText,
    questionPrompt,
    targetSkill,
  });

  let hallucinationRisk = 0.0;
  const detectedHallucinations = [...skillHallucinations.hallucinatedSkills];

  if (skillHallucinations.hasHallucinations) {
    hallucinationRisk += Math.min(0.8, skillHallucinations.hallucinatedSkills.length * 0.4);
    reasons.push(
      `Hallucinated skills detected not present in candidate answer: ${skillHallucinations.hallucinatedSkills.join(', ')}.`,
    );
  }

  // ─── 5. Tone, Length & Safety ─────────────────────────────────────────────
  let tone = 0.9;
  if (feedback.length < 20) {
    tone = 0.3;
    reasons.push('Feedback summary is too terse (under 20 characters).');
  } else if (feedback.length > 1500) {
    tone = 0.7;
    reasons.push('Feedback summary is unusually verbose.');
  }

  // Check for unredacted sensitive patterns
  const secretCheck = redactSensitiveSecrets(feedback);
  if (secretCheck.redactedSecretsCount > 0) {
    tone = 0.1;
    reasons.push('Feedback contained sensitive credential or secret patterns.');
  }

  const errorCheck = redactProviderErrors(feedback);
  if (errorCheck.redactedErrorsCount > 0) {
    tone = 0.1;
    reasons.push('Feedback leaked raw provider error or stack trace traces.');
  }

  // ─── 6. Composite Quality Score ───────────────────────────────────────────
  // Specificity (0.35) + Relevance (0.30) + Actionability (0.25) + Tone (0.10)
  let rawQuality =
    specificity * 0.35 +
    relevance * 0.30 +
    actionability * 0.25 +
    tone * 0.10;

  // Apply penalty if feedback is predominantly generic boilerplate
  if (genericPhraseMatches >= 2) {
    rawQuality *= 0.8;
  }

  // Apply severe penalty if hallucination detected
  if (hallucinationRisk > 0) {
    rawQuality = Math.max(0, rawQuality * (1 - hallucinationRisk));
  }

  const qualityScore = Math.round(rawQuality * 100) / 100;
  const isAcceptable = qualityScore >= 0.60 && hallucinationRisk <= 0.20 && tone >= 0.60;

  return {
    qualityScore,
    isAcceptable,
    dimensions: {
      specificity: Math.round(specificity * 100) / 100,
      relevance: Math.round(relevance * 100) / 100,
      actionability: Math.round(actionability * 100) / 100,
      tone: Math.round(tone * 100) / 100,
    },
    hallucinationRisk: Math.round(hallucinationRisk * 100) / 100,
    detectedHallucinations,
    reasons,
  };
}

/**
 * Compares an array of canary evaluations against baseline expectations to detect model drift.
 *
 * @param {Array<{ id: string, score: number, dimensions?: object }>} canaryEvaluations
 * @param {Array<object>} [baselines=CANARY_BASELINES]
 * @param {object} [options]
 * @param {number} [options.maxTolerance=0.20] Maximum acceptable fractional deviation (default 20%)
 * @returns {object} Drift audit report
 */
export function checkModelDrift(
  canaryEvaluations = [],
  baselines = CANARY_BASELINES,
  { maxTolerance = 0.20 } = {},
) {
  const safeEvaluations = Array.isArray(canaryEvaluations) ? canaryEvaluations : [];
  const evalMap = new Map();
  for (const item of safeEvaluations) {
    if (item && item.id) {
      evalMap.set(item.id, item);
    }
  }

  const canaryResults = [];
  let maxDrift = 0;
  let driftedCount = 0;

  for (const baseline of baselines) {
    const actual = evalMap.get(baseline.id);
    if (!actual) {
      canaryResults.push({
        id: baseline.id,
        status: 'missing',
        expectedScore: baseline.expectedScore,
        actualScore: null,
        drift: null,
        isWithinTolerance: false,
        reason: 'Canary evaluation was not executed or returned no result.',
      });
      driftedCount++;
      continue;
    }

    const actualScore = Number(actual.score ?? actual.compositeScore ?? 0);
    const scoreDiff = Math.abs(actualScore - baseline.expectedScore);
    const fractionalDrift = Math.round((scoreDiff / Math.max(0.1, baseline.expectedScore)) * 1000) / 1000;

    if (fractionalDrift > maxDrift) {
      maxDrift = fractionalDrift;
    }

    const isWithinBounds =
      actualScore >= baseline.minScore - 0.02 &&
      actualScore <= baseline.maxScore + 0.02;

    const isWithinTolerance = fractionalDrift <= maxTolerance && isWithinBounds;

    if (!isWithinTolerance) {
      driftedCount++;
    }

    canaryResults.push({
      id: baseline.id,
      skill: baseline.skill,
      difficulty: baseline.difficulty,
      expectedScore: baseline.expectedScore,
      actualScore,
      drift: fractionalDrift,
      isWithinTolerance,
      reason: isWithinTolerance
        ? 'Within acceptable drift tolerance.'
        : `Score deviation of ${Math.round(fractionalDrift * 100)}% exceeds tolerance (${Math.round(maxTolerance * 100)}%).`,
    });
  }

  const isDriftDetected = driftedCount > 0;

  return {
    isDriftDetected,
    driftedCount,
    totalCanaries: baselines.length,
    maxDrift,
    maxTolerance,
    canaries: canaryResults,
  };
}
