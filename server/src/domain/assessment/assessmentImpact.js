/**
 * Task 19 — Assessment Impact Contract.
 *
 * Pure, deterministic function that builds the cross-feature impact signal
 * returned after every assessment submission. This lives in the domain layer
 * so it can be unit-tested without a running server or database.
 *
 * The impact descriptor tells the client exactly which downstream resources
 * are now stale — CareerTwin, skill gap, readiness, opportunities — so the
 * UI can invalidate its caches deterministically without guessing or polling.
 *
 * ## Design decisions
 *
 * **Pure function with no side effects.** The assessment service creates
 * SkillEvidenceChecks and updates the attempt document; this module only
 * computes what the *response* should say about cross-feature consequences.
 *
 * **Staleness propagation is explicit, not implicit.** Rather than having
 * the client guess "will my readiness change after I pass?", the response
 * tells it exactly which domains to refresh. This prevents the common
 * pattern of hitting every endpoint after every action.
 *
 * **nextActions are student-facing, not developer-facing.** They should
 * read naturally in a notification or toast, not as code comments.
 */

/**
 * The set of downstream domains that can be marked stale by an assessment.
 * The client uses this to invalidate the right caches.
 */
export const IMPACT_DOMAINS = Object.freeze({
  CAREER_TWIN: 'careerTwin',
  SKILL_GAP: 'skillGap',
  READINESS: 'readiness',
  OPPORTUNITIES: 'opportunities',
  ROADMAP: 'roadmap',
});

/**
 * Builds the cross-feature impact descriptor after an assessment is submitted.
 *
 * This is the canonical implementation. The assessment service delegates to
 * this function after evidence recording so the logic is testable without a DB.
 *
 * @param {object} opts
 * @param {boolean} opts.passed Whether the student passed this attempt.
 * @param {boolean} opts.eligibleForVerified Whether the result creates verified evidence.
 * @param {string} opts.skillKey The skill this assessment covers.
 * @param {string|null} opts.evidenceCheckId The persisted SkillEvidenceCheck ID, or null.
 * @param {boolean} opts.isPractice Whether this was a practice attempt (no verified evidence).
 * @returns {object} Impact descriptor.
 */
export function buildAssessmentImpact({ passed, eligibleForVerified, skillKey, evidenceCheckId, isPractice }) {
  if (!passed) {
    return {
      passed: false,
      eligibleForVerified: false,
      skillKey,
      evidenceCheckId: null,
      careerTwinWillRefresh: false,
      staleDomains: [],
      message: `Assessment not passed. No evidence was recorded for ${skillKey}.`,
      nextActions: [
        `Review the question results and retry the ${skillKey} assessment.`,
        'Check the roadmap for learning resources on this skill.',
      ],
    };
  }

  // Determine which domains need refreshing based on evidence quality
  const staleDomains = [];
  let careerTwinWillRefresh = false;
  let message = '';
  let nextActions = [];

  if (eligibleForVerified && !isPractice) {
    // Verified SkillEvidenceCheck written — all downstream domains stale
    careerTwinWillRefresh = true;
    staleDomains.push(
      IMPACT_DOMAINS.CAREER_TWIN,
      IMPACT_DOMAINS.SKILL_GAP,
      IMPACT_DOMAINS.READINESS,
      IMPACT_DOMAINS.OPPORTUNITIES,
      IMPACT_DOMAINS.ROADMAP,
    );
    message = `${skillKey} is now verified. Your CareerTwin will refresh on next access.`;
    nextActions = [
      `Your ${skillKey} skill is now verified. Refresh your skill gap to see updated readiness.`,
      'Check your opportunities — you may now qualify for new ones.',
    ];
  } else if (isPractice) {
    // Practice — supported evidence, CareerTwin + gap stale
    careerTwinWillRefresh = true;
    staleDomains.push(IMPACT_DOMAINS.CAREER_TWIN, IMPACT_DOMAINS.SKILL_GAP);
    message = `${skillKey} is now supported by practice evidence. Your CareerTwin will refresh on next access.`;
    nextActions = [
      `Complete an intermediate or advanced ${skillKey} assessment to reach verified status.`,
    ];
  } else {
    // Passed but not eligible for verified (e.g., beginner difficulty)
    careerTwinWillRefresh = true;
    staleDomains.push(IMPACT_DOMAINS.CAREER_TWIN, IMPACT_DOMAINS.SKILL_GAP);
    message = `${skillKey} is now supported by assessment evidence. To reach verified status, pass an intermediate or advanced assessment.`;
    nextActions = [
      `Complete an intermediate or advanced ${skillKey} assessment to reach verified status.`,
    ];
  }

  return {
    passed,
    eligibleForVerified,
    skillKey,
    evidenceCheckId: evidenceCheckId ?? null,
    careerTwinWillRefresh,
    staleDomains,
    message,
    nextActions,
  };
}
