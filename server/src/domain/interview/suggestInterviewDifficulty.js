import { canonicalSkill, skillKey } from '../skills/skillKey.js';
import { INTERVIEW_DIFFICULTY, INTERVIEW_DIFFICULTY_VALUES } from './interviewContract.js';

/**
 * Suggests an optimal starting interview difficulty based on student's CareerTwin
 * evidence and declared profile preferences.
 *
 * Pure deterministic function — no database, no network, no clock.
 *
 * @param {object} params
 * @param {string[]} [params.targetSkills=[]] Skills to be evaluated in the session
 * @param {object|null} [params.twin=null] Student's CareerTwin (or null if not yet built)
 * @param {string|null} [params.preferredDifficulty=null] Profile preference ('beginner'|'intermediate'|'advanced')
 * @returns {object} Structured recommendation with explainable rationale
 */
export function suggestInterviewDifficulty({
  targetSkills = [],
  twin = null,
  preferredDifficulty = null,
} = {}) {
  const safePreferred = INTERVIEW_DIFFICULTY_VALUES.includes(preferredDifficulty)
    ? preferredDifficulty
    : null;

  const rawSkills = Array.isArray(targetSkills) ? targetSkills.filter(Boolean) : [];
  const twinSkills = Array.isArray(twin?.skills) ? twin.skills : [];

  // Build lookup index of twin skills by key and name
  const twinSkillMap = new Map();
  for (const s of twinSkills) {
    if (s?.key) twinSkillMap.set(s.key, s);
    if (s?.name) twinSkillMap.set(s.name.toLowerCase(), s);
  }

  const breakdown = [];
  let totalMastery = 0;

  for (const skillName of rawSkills) {
    const resolved = canonicalSkill(skillName);
    const key = resolved?.key || skillKey(skillName);
    const twinMatch = twinSkillMap.get(key) || twinSkillMap.get(skillName.toLowerCase());

    const strength = twinMatch?.strength || 'missing';
    let masteryLevel = 1; // 1 = claimed/missing (beginner), 2 = supported (intermediate), 3 = verified (advanced)

    if (strength === 'verified') {
      masteryLevel = 3;
    } else if (strength === 'supported') {
      masteryLevel = 2;
    } else {
      masteryLevel = 1;
    }

    totalMastery += masteryLevel;
    breakdown.push({
      skill: skillName,
      canonicalKey: key,
      evidenceTier: strength,
      masteryLevel,
    });
  }

  const skillCount = breakdown.length;
  const averageMastery = skillCount > 0 ? totalMastery / skillCount : 1.0;

  // Determine evidence-driven recommended difficulty
  let recommendedDifficulty = INTERVIEW_DIFFICULTY.BEGINNER;
  if (averageMastery >= 2.4) {
    recommendedDifficulty = INTERVIEW_DIFFICULTY.ADVANCED;
  } else if (averageMastery >= 1.5) {
    recommendedDifficulty = INTERVIEW_DIFFICULTY.INTERMEDIATE;
  } else {
    recommendedDifficulty = INTERVIEW_DIFFICULTY.BEGINNER;
  }

  // Reconcile with declared student preference
  let suggestedDifficulty = recommendedDifficulty;
  let rationale = '';

  const skillListText = skillCount > 0 ? breakdown.map((b) => b.skill).join(', ') : 'selected skills';

  if (!safePreferred) {
    suggestedDifficulty = recommendedDifficulty;
    rationale = `Based on your CareerTwin evidence for ${skillListText}, ${recommendedDifficulty} difficulty is recommended.`;
  } else if (safePreferred === recommendedDifficulty) {
    suggestedDifficulty = safePreferred;
    rationale = `Your ${safePreferred} preference aligns with your demonstrated evidence in ${skillListText}.`;
  } else if (safePreferred === INTERVIEW_DIFFICULTY.ADVANCED && recommendedDifficulty === INTERVIEW_DIFFICULTY.BEGINNER) {
    // Student wants advanced, but evidence is only beginner: compromise at intermediate to avoid severe frustration
    suggestedDifficulty = INTERVIEW_DIFFICULTY.INTERMEDIATE;
    rationale = `You requested advanced difficulty, but your twin shows emerging evidence for ${skillListText}. Starting at intermediate provides a progressive challenge.`;
  } else if (safePreferred === INTERVIEW_DIFFICULTY.BEGINNER && recommendedDifficulty === INTERVIEW_DIFFICULTY.ADVANCED) {
    // Student wants beginner, but has verified skills: offer intermediate
    suggestedDifficulty = INTERVIEW_DIFFICULTY.INTERMEDIATE;
    rationale = `You have verified competence in ${skillListText}, but per your beginner preference, starting at intermediate is recommended.`;
  } else {
    // One step difference (e.g. intermediate vs advanced or beginner vs intermediate): honor student preference
    suggestedDifficulty = safePreferred;
    rationale = `Using your preferred ${safePreferred} difficulty for ${skillListText} (evidence baseline suggests ${recommendedDifficulty}).`;
  }

  return {
    suggestedDifficulty,
    recommendedDifficulty,
    preferredDifficulty: safePreferred,
    averageMasteryScore: Number((averageMastery / 3).toFixed(2)),
    rationale,
    skillBreakdown: breakdown,
  };
}
