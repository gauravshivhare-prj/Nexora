/**
 * Task 20 — Interview Session Impact Contract.
 *
 * Pure, deterministic function that builds the cross-feature impact signal
 * returned after every interview session is completed. Parallel to the
 * assessmentImpact module in Task 19, but scoped to interview sessions which
 * can cover multiple skills in a single session.
 *
 * ## Design decisions
 *
 * **Multi-skill sessions.** Unlike an assessment (one skill, one score), an
 * interview session can target multiple skills. The impact is computed per
 * skill and aggregated into a single `skillImpacts` array.
 *
 * **Human vs AI evaluator.** Only human-evaluated sessions create verified
 * evidence. AI evaluations are advisory and create supported evidence at best.
 * This is reflected in `eligibleForVerified` per skill.
 *
 * **Conservative staleness.** If any skill in the session creates a new
 * SkillEvidenceCheck, the CareerTwin is stale. If any verified check was
 * created, readiness and opportunities are also stale.
 */

/**
 * The set of downstream domains that can be marked stale by an interview session.
 */
export const INTERVIEW_IMPACT_DOMAINS = Object.freeze({
  CAREER_TWIN: 'careerTwin',
  SKILL_GAP: 'skillGap',
  READINESS: 'readiness',
  OPPORTUNITIES: 'opportunities',
});

/**
 * Builds the cross-feature impact descriptor after an interview session completes.
 *
 * @param {object} opts
 * @param {number} opts.overallScore Overall session score [0, 1].
 * @param {boolean} opts.eligibleForVerified Whether any skill was verified.
 * @param {string} opts.evaluatorType 'human' or 'ai'.
 * @param {Array<object>} opts.evidenceResults Per-skill evidence results from evaluateSessionResults.
 *   Each: { skillKey, skillName, outcome, eligibleForVerified, score }
 * @param {number} opts.passMark Session pass mark [0, 1].
 * @returns {object} Impact descriptor.
 */
export function buildInterviewImpact({
  overallScore,
  eligibleForVerified,
  evaluatorType,
  evidenceResults = [],
  passMark = 0.75,
}) {
  const passed = overallScore >= passMark;

  if (!passed || evidenceResults.length === 0) {
    return {
      passed,
      overallScore,
      evaluatorType,
      eligibleForVerified: false,
      careerTwinWillRefresh: false,
      staleDomains: [],
      skillImpacts: [],
      message: passed
        ? 'Interview passed but no skill evidence was recorded (no skills were evaluated).'
        : `Interview score (${Math.round(overallScore * 100)}%) did not meet the pass mark (${Math.round(passMark * 100)}%). No evidence was recorded.`,
      nextActions: passed
        ? []
        : [
            'Review the feedback for each question and retry after improving the weak areas.',
            'Check the roadmap for learning resources on the skills covered.',
          ],
    };
  }

  // Per-skill impacts
  const skillImpacts = evidenceResults.map((ev) => ({
    skillKey: ev.skillKey,
    skillName: ev.skillName,
    outcome: ev.outcome,
    score: ev.score,
    eligibleForVerified: Boolean(ev.eligibleForVerified),
    message: ev.eligibleForVerified
      ? `${ev.skillName} is now verified by interview.`
      : ev.outcome === 'pass'
        ? `${ev.skillName} is now supported by interview evidence.`
        : `${ev.skillName} did not pass the interview threshold.`,
  }));

  // Aggregate staleness
  const anyVerified = skillImpacts.some((s) => s.eligibleForVerified);
  const anyPassed = skillImpacts.some((s) => s.outcome === 'pass');

  const staleDomains = [];
  let careerTwinWillRefresh = false;

  if (anyPassed) {
    careerTwinWillRefresh = true;
    staleDomains.push(INTERVIEW_IMPACT_DOMAINS.CAREER_TWIN, INTERVIEW_IMPACT_DOMAINS.SKILL_GAP);
  }
  if (anyVerified) {
    staleDomains.push(INTERVIEW_IMPACT_DOMAINS.READINESS, INTERVIEW_IMPACT_DOMAINS.OPPORTUNITIES);
  }

  // Build message and actions
  const verifiedCount = skillImpacts.filter((s) => s.eligibleForVerified).length;
  const passedCount = skillImpacts.filter((s) => s.outcome === 'pass').length;
  const totalCount = skillImpacts.length;

  let message = '';
  const nextActions = [];

  if (anyVerified) {
    message = `Interview passed. ${verifiedCount} of ${totalCount} skill${verifiedCount !== 1 ? 's' : ''} verified. Your CareerTwin will refresh on next access.`;
    nextActions.push(
      'Refresh your skill gap to see your updated readiness.',
      'Check your opportunities — you may now qualify for new ones.',
    );
  } else if (anyPassed) {
    message = `Interview passed. ${passedCount} of ${totalCount} skill${passedCount !== 1 ? 's' : ''} now supported by interview evidence.`;
    if (evaluatorType === 'ai') {
      nextActions.push(
        'AI evaluations are advisory. Request a human-evaluated interview to reach verified status.',
      );
    } else {
      nextActions.push('Complete an intermediate assessment to confirm verified status.');
    }
  }

  return {
    passed,
    overallScore,
    evaluatorType,
    eligibleForVerified: Boolean(anyVerified),
    careerTwinWillRefresh,
    staleDomains,
    skillImpacts,
    message,
    nextActions,
  };
}
