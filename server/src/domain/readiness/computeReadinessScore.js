import { GAP_IMPORTANCE, GAP_STATUS } from '../skillGap/computeSkillGap.js';

/**
 * Task 17 — Career Readiness Score Engine.
 *
 * Computes a deterministic, evidence-weighted readiness score for a student
 * against a specific role. Nothing is invented: every figure is traceable to
 * a concrete piece of evidence in the student's skill gap.
 *
 * Architecture: this is a separate concern from `computeReadiness`, which
 * intentionally produces no numeric signal. The score lives here because it
 * has its own contract and its own testable quality criteria. It answers a
 * different question: "how ready, numerically?" rather than "are you ready?"
 *
 * ## Design decisions
 *
 * **No percentages in the readiness status block.**
 * `computeReadiness` deliberately omits scores — it expresses readiness as
 * an evidence status so the UI can surface a truthful narrative rather than
 * a number that invites gamification. This engine is separate so clients that
 * explicitly request a numeric signal can have one.
 *
 * **Evidence-quality weights, not boolean pass/fail.**
 * A claimed skill is worth 0.25× a verified one, not 0 (the student did the
 * work, they just haven't proved it yet) and not 1 (they might be wrong
 * about themselves). This mirrors how a technical interviewer weights a
 * candidate's self-assessment vs. a shipped project vs. a certif.
 *
 * **Required skills dominate.**
 * 70% of the score comes from required skills because those are the gates
 * that determine whether a student is worth interviewing at all. Preferred
 * skills move the score but cannot overcome a missing required one.
 *
 * **Interview evidence is integration-tested elsewhere.** This module does not
 * reach for the database. The caller (readiness.service) resolves interview
 * history and passes it in as `interviewSkills`. This keeps the function pure
 * and testable without a running DB.
 *
 * ## Score bands
 *
 * | Score    | Label      | Meaning                                          |
 * |----------|------------|--------------------------------------------------|
 * | 0–24     | beginning  | Essential required skills are missing or claimed |
 * | 25–49    | developing | Most required skills present, gaps remain        |
 * | 50–74    | solid      | Required skills mostly supported or better       |
 * | 75–89    | strong     | Required skills all supported, preferred gaps OK |
 * | 90–100   | interview-ready | All required skills verified or close     |
 */

/** Readiness score contract version — increment when weights or bands change. */
export const READINESS_SCORE_CONTRACT_VERSION = 1;

/** Proportion of the score allocated to required vs. preferred skills. */
const WEIGHT = Object.freeze({
  required: 0.70,
  preferred: 0.30,
});

/**
 * Evidence quality multipliers.
 *
 * Each multiplier expresses how much credit a student gets for a skill
 * at that evidence level, on a [0, 1] scale. Values are:
 *   missing   = 0    (no evidence at all)
 *   claimed   = 0.25 (self-declared only, not corroborated)
 *   supported = 0.65 (project or artifact evidence, not independently verified)
 *   verified  = 1.00 (independently assessed — highest credibility)
 *
 * Interview pass bumps a skill from supported to verified-equivalent by
 * adding 0.35 (the gap between supported and verified multipliers).
 */
export const EVIDENCE_WEIGHT = Object.freeze({
  [GAP_STATUS.MISSING]: 0,
  [GAP_STATUS.CLAIMED]: 0.25,
  [GAP_STATUS.SUPPORTED]: 0.65,
  [GAP_STATUS.VERIFIED]: 1.0,
});

/** Interview-pass credit: amount added to a skill's evidence multiplier. */
export const INTERVIEW_BOOST = 0.35;

/** Score bands — inclusive lower bounds. */
export const SCORE_BANDS = Object.freeze([
  { min: 90, label: 'interview-ready' },
  { min: 75, label: 'strong' },
  { min: 50, label: 'solid' },
  { min: 25, label: 'developing' },
  { min: 0, label: 'beginning' },
]);

/**
 * Computes a readiness score for a student against a role.
 *
 * @param {object|null} gap Output of `computeSkillGap`, or null.
 * @param {object} [options]
 * @param {Set<string>} [options.interviewPassedSkillKeys] Set of canonicalKey/key
 *   values for skills where the student passed a live interview. When provided,
 *   those skills receive an interview boost on top of their evidence multiplier.
 *   The caller is responsible for validating interview data before passing it.
 * @returns {object} Readiness score result.
 */
export function computeReadinessScore(gap, { interviewPassedSkillKeys = new Set() } = {}) {
  if (!gap?.roleId || !Array.isArray(gap.skills)) {
    return emptyScore(gap?.roleId ?? null);
  }

  const validSkills = gap.skills.filter((s) => s && typeof s === 'object');
  const required = validSkills.filter((s) => s.importance === GAP_IMPORTANCE.REQUIRED);
  const preferred = validSkills.filter((s) => s.importance === GAP_IMPORTANCE.PREFERRED);

  const interviewKeys = interviewPassedSkillKeys instanceof Set
    ? interviewPassedSkillKeys
    : new Set();

  const requiredScore = scoreForGroup(required, interviewKeys);
  const preferredScore = scoreForGroup(preferred, interviewKeys);

  // Weighted composite. Clamp to [0, 100] to defend against future weight changes.
  const composite = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        requiredScore.groupScore * WEIGHT.required * 100 +
          preferredScore.groupScore * WEIGHT.preferred * 100,
      ),
    ),
  );

  const band = bandFor(composite);
  const nextMilestone = nextMilestoneFor(composite, requiredScore.skills, preferredScore.skills);
  const confidence = confidenceFor(required, preferred, interviewKeys);

  return {
    roleId: gap.roleId,
    value: composite,
    score: composite,
    band,
    confidence,
    breakdown: {
      required: {
        ...requiredScore.counts,
        contribution: Math.round(requiredScore.groupScore * WEIGHT.required * 100),
      },
      preferred: {
        ...preferredScore.counts,
        contribution: Math.round(preferredScore.groupScore * WEIGHT.preferred * 100),
      },
      interviewBoostApplied: interviewKeys.size > 0,
    },
    nextMilestone,
    method: {
      contractVersion: READINESS_SCORE_CONTRACT_VERSION,
      deterministic: true,
      usesAi: false,
      weights: WEIGHT,
      evidenceMultipliers: EVIDENCE_WEIGHT,
      interviewBoost: INTERVIEW_BOOST,
      note:
        'Score is computed from evidence-weighted skill coverage. ' +
        'Required skills account for 70% of the score; preferred for 30%. ' +
        'Claimed skills are worth 25% of a verified one; supported skills 65%.',
    },
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Deduplicates a list of gap skills by canonical key.
 *
 * When the same skill appears more than once (e.g. a CareerTwin has two
 * entries with the same key), only the entry with the highest evidence
 * quality is kept. Without deduplication, a duplicated verified skill
 * inflates the group score because it adds an extra 1.0 to the numerator
 * while also adding 1 to the denominator — making the average appear higher
 * than it really is.
 *
 * Evidence quality ordering (highest to lowest):
 *   verified > supported > claimed > missing
 *
 * @param {Array<object>} skills Raw skill list, possibly containing duplicates.
 * @returns {Array<object>} De-duplicated skill list.
 */
function deduplicateSkills(skills) {
  const QUALITY_ORDER = {
    [GAP_STATUS.VERIFIED]: 3,
    [GAP_STATUS.SUPPORTED]: 2,
    [GAP_STATUS.CLAIMED]: 1,
    [GAP_STATUS.MISSING]: 0,
  };

  const best = new Map();
  for (const skill of skills) {
    if (!skill || typeof skill !== 'object') continue;
    const key = (skill.key || skill.name || '').toLowerCase().trim();
    if (!key) continue;
    const existing = best.get(key);
    if (!existing) {
      best.set(key, skill);
    } else {
      const existingQuality = QUALITY_ORDER[existing.status] ?? 0;
      const candidateQuality = QUALITY_ORDER[skill.status] ?? 0;
      if (candidateQuality > existingQuality) {
        best.set(key, skill);
      }
    }
  }
  return [...best.values()];
}

/**
 * Computes the [0, 1] coverage score for a group of skills.
 *
 * Skills are deduplicated by key before scoring so that a duplicate entry
 * cannot artificially inflate the group score.
 *
 * @param {Array<object>} skills Subset of gap skills (all same importance).
 * @param {Set<string>} interviewKeys
 * @returns {{ groupScore: number, skills: Array<object>, counts: object }}
 */
function scoreForGroup(skills, interviewKeys) {
  if (!skills || skills.length === 0) {
    return {
      groupScore: 0,
      skills: [],
      counts: { total: 0, missing: 0, claimed: 0, supported: 0, verified: 0, interviewBoosted: 0 },
    };
  }

  // Deduplicate before scoring — keeps highest-quality evidence per skill key.
  const uniqueSkills = deduplicateSkills(skills);

  let totalWeight = 0;
  let earnedWeight = 0;
  const counts = { total: uniqueSkills.length, missing: 0, claimed: 0, supported: 0, verified: 0, interviewBoosted: 0 };
  const scoredSkills = [];

  for (const skill of uniqueSkills) {
    const baseMultiplier = EVIDENCE_WEIGHT[skill.status] ?? 0;
    const skillKey = skill.key || skill.name || '';

    // Interview boost: if the student passed an interview for this skill,
    // add INTERVIEW_BOOST but cap at 1.0 (verified ceiling).
    const hasInterviewBoost = interviewKeys.has(skillKey) || interviewKeys.has(skill.canonicalId);
    const interviewBump = hasInterviewBoost ? INTERVIEW_BOOST : 0;
    const effectiveMultiplier = Math.min(1.0, baseMultiplier + interviewBump);

    totalWeight += 1;
    earnedWeight += effectiveMultiplier;

    // Count at the effective (post-boost) status for the breakdown
    const effectiveStatus = effectiveMultiplierToStatus(effectiveMultiplier);
    counts[effectiveStatus] = (counts[effectiveStatus] || 0) + 1;
    if (hasInterviewBoost) counts.interviewBoosted += 1;

    scoredSkills.push({
      key: skillKey,
      name: skill.name ?? skillKey,
      status: skill.status,
      effectiveMultiplier,
      interviewBoosted: hasInterviewBoost,
    });
  }

  return {
    groupScore: totalWeight > 0 ? earnedWeight / totalWeight : 0,
    skills: scoredSkills,
    counts,
  };
}

/** Maps an effective multiplier back to a status label for the breakdown counts. */
function effectiveMultiplierToStatus(multiplier) {
  if (multiplier >= 1.0) return GAP_STATUS.VERIFIED;
  if (multiplier >= 0.65) return GAP_STATUS.SUPPORTED;
  if (multiplier > 0) return GAP_STATUS.CLAIMED;
  return GAP_STATUS.MISSING;
}

/** Returns the band descriptor for a composite score. */
function bandFor(score) {
  return (SCORE_BANDS.find((band) => score >= band.min) ?? SCORE_BANDS.at(-1)).label;
}

/**
 * Describes what would move the student to the next score band.
 *
 * Identifies the single highest-impact improvement: the required skill with
 * the lowest evidence multiplier. Fixing that skill yields the most points.
 *
 * @param {number} score
 * @param {Array<object>} requiredScoredSkills
 * @param {Array<object>} preferredScoredSkills
 * @returns {object}
 */
function nextMilestoneFor(score, requiredScoredSkills, preferredScoredSkills) {
  const currentBandIdx = SCORE_BANDS.findIndex((band) => score >= band.min);
  const nextBand = currentBandIdx > 0 ? SCORE_BANDS[currentBandIdx - 1] : null;

  if (!nextBand) {
    return {
      achievable: false,
      targetBand: null,
      action: 'You have reached the highest readiness band.',
      skill: null,
    };
  }

  // Find the required skill with the most room for improvement.
  const lowestRequired = [...requiredScoredSkills]
    .filter((s) => s.effectiveMultiplier < 1.0)
    .sort((a, b) => a.effectiveMultiplier - b.effectiveMultiplier)
    .at(0);

  if (lowestRequired) {
    const action = actionForSkill(lowestRequired);
    return {
      achievable: true,
      targetBand: nextBand.label,
      pointsNeeded: nextBand.min - score,
      skill: { key: lowestRequired.key, name: lowestRequired.name },
      action,
    };
  }

  // All required skills are verified — look at preferred skills
  const lowestPreferred = [...preferredScoredSkills]
    .filter((s) => s.effectiveMultiplier < 1.0)
    .sort((a, b) => a.effectiveMultiplier - b.effectiveMultiplier)
    .at(0);

  if (lowestPreferred) {
    return {
      achievable: true,
      targetBand: nextBand.label,
      pointsNeeded: nextBand.min - score,
      skill: { key: lowestPreferred.key, name: lowestPreferred.name },
      action: actionForSkill(lowestPreferred),
    };
  }

  return {
    achievable: false,
    targetBand: nextBand.label,
    action: 'No actionable gaps remain in the skill set.',
    skill: null,
  };
}

/** Translates a scored skill's current state into a concrete next action. */
function actionForSkill(skill) {
  if (skill.effectiveMultiplier === 0) {
    return `Add ${skill.name} to your profile and build a project that uses it.`;
  }
  if (skill.effectiveMultiplier <= 0.25) {
    return `Turn your ${skill.name} claim into a project Nexora can see.`;
  }
  if (skill.effectiveMultiplier < 1.0) {
    return `Get ${skill.name} independently verified — pass an assessment or a live interview.`;
  }
  return `${skill.name} is already at the highest evidence level.`;
}

/**
 * Computes a confidence value for the score.
 *
 * Confidence is high when most skills have corroborated evidence (not just
 * self-declared). Low confidence means the score might rise significantly
 * once the student adds evidence.
 *
 * Returns one of: 'high' | 'medium' | 'low'.
 */
function confidenceFor(required, preferred, interviewKeys) {
  const all = [...required, ...preferred];
  if (all.length === 0) return 'low';

  const corroboratedCount = all.filter((s) => {
    const isSupOrVer = s.status === GAP_STATUS.SUPPORTED || s.status === GAP_STATUS.VERIFIED;
    const boosted = interviewKeys.has(s.key) || interviewKeys.has(s.canonicalId);
    return isSupOrVer || boosted;
  }).length;

  const ratio = corroboratedCount / all.length;
  if (ratio >= 0.7) return 'high';
  if (ratio >= 0.35) return 'medium';
  return 'low';
}

/** Returns an empty score result when no gap data is available. */
function emptyScore(roleId) {
  return {
    roleId,
    value: 0,
    score: 0,
    band: 'beginning',
    confidence: 'low',
    breakdown: {
      required: { total: 0, missing: 0, claimed: 0, supported: 0, verified: 0, interviewBoosted: 0, contribution: 0 },
      preferred: { total: 0, missing: 0, claimed: 0, supported: 0, verified: 0, interviewBoosted: 0, contribution: 0 },
      interviewBoostApplied: false,
    },
    nextMilestone: {
      achievable: false,
      targetBand: null,
      action: 'Insufficient data — build your CareerTwin first.',
      skill: null,
    },
    method: {
      contractVersion: READINESS_SCORE_CONTRACT_VERSION,
      deterministic: true,
      usesAi: false,
      weights: WEIGHT,
      evidenceMultipliers: EVIDENCE_WEIGHT,
      interviewBoost: INTERVIEW_BOOST,
      note: 'Score could not be computed — gap data is missing or incomplete.',
    },
  };
}
