export const DIFFICULTY_LEVELS = Object.freeze([
  'beginner',
  'intermediate',
  'advanced',
]);

/**
 * Calculates adaptive difficulty adjustments based on student's session history.
 * Pure deterministic function — no side effects, no database access, no clock.
 *
 * Thresholds:
 * - If running average >= 0.85 (or recent answers >= 0.80):
 *   Step up difficulty (beginner -> intermediate -> advanced)
 * - If running average < 0.45 (or recent answers < 0.45):
 *   Step down difficulty (advanced -> intermediate -> beginner)
 * - Otherwise:
 *   Maintain current difficulty ('steady')
 *
 * @param {Array<{ score: number, difficulty?: string }>} sessionHistory Answered questions history
 * @param {string} currentDifficulty Current question difficulty
 * @param {object} [options]
 * @param {number} [options.stepUpThreshold=0.85]
 * @param {number} [options.stepDownThreshold=0.45]
 * @param {number} [options.minQuestionsBeforeAdapt=1] Minimum questions before adapting
 * @returns {object} Adaptation recommendation
 */
export function adaptDifficulty(
  sessionHistory = [],
  currentDifficulty = 'intermediate',
  {
    stepUpThreshold = 0.85,
    stepDownThreshold = 0.45,
    minQuestionsBeforeAdapt = 1,
  } = {},
) {
  // Validate and sanitize current difficulty
  const safeCurrent = DIFFICULTY_LEVELS.includes(currentDifficulty)
    ? currentDifficulty
    : 'intermediate';

  const validScores = (Array.isArray(sessionHistory) ? sessionHistory : [])
    .map((item) => (typeof item === 'number' ? item : item?.score))
    .filter((s) => typeof s === 'number' && !Number.isNaN(s) && s >= 0 && s <= 1.0);

  if (validScores.length < minQuestionsBeforeAdapt) {
    return {
      suggestedDifficulty: safeCurrent,
      currentDifficulty: safeCurrent,
      direction: 'steady',
      runningAverage: validScores.length > 0 ? validScores[0] : null,
      evaluatedQuestionCount: validScores.length,
      reason: `Insufficient question history (${validScores.length}/${minQuestionsBeforeAdapt}) to adapt difficulty.`,
    };
  }

  // Weight recent answers slightly higher (recency weighting)
  let weightedSum = 0;
  let weightSum = 0;
  for (let i = 0; i < validScores.length; i++) {
    const weight = 1 + (i / validScores.length);
    weightedSum += validScores[i] * weight;
    weightSum += weight;
  }
  const runningAverage = Math.round((weightedSum / weightSum) * 100) / 100;

  const currentIndex = DIFFICULTY_LEVELS.indexOf(safeCurrent);

  if (runningAverage >= stepUpThreshold && currentIndex < DIFFICULTY_LEVELS.length - 1) {
    const nextLevel = DIFFICULTY_LEVELS[currentIndex + 1];
    return {
      suggestedDifficulty: nextLevel,
      currentDifficulty: safeCurrent,
      direction: 'up',
      runningAverage,
      evaluatedQuestionCount: validScores.length,
      reason: `Student performance (score: ${Math.round(runningAverage * 100)}%) exceeded mastery threshold (${Math.round(stepUpThreshold * 100)}%). Elevating difficulty to ${nextLevel}.`,
    };
  }

  if (runningAverage < stepDownThreshold && currentIndex > 0) {
    const nextLevel = DIFFICULTY_LEVELS[currentIndex - 1];
    return {
      suggestedDifficulty: nextLevel,
      currentDifficulty: safeCurrent,
      direction: 'down',
      runningAverage,
      evaluatedQuestionCount: validScores.length,
      reason: `Student struggled (score: ${Math.round(runningAverage * 100)}%) below support threshold (${Math.round(stepDownThreshold * 100)}%). Adjusting difficulty to ${nextLevel}.`,
    };
  }

  return {
    suggestedDifficulty: safeCurrent,
    currentDifficulty: safeCurrent,
    direction: 'steady',
    runningAverage,
    evaluatedQuestionCount: validScores.length,
    reason: `Student performance (score: ${Math.round(runningAverage * 100)}%) is well-calibrated for ${safeCurrent} difficulty.`,
  };
}
