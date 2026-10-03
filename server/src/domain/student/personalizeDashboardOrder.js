/**
 * Dashboard Section Prioritization Engine.
 *
 * Deterministically computes the optimal viewing order of dashboard sections
 * based on the student's pipeline lifecycle stage and declared priority goals.
 *
 * Pure function: no database, no clock, no network, no score invention.
 */

export const DASHBOARD_SECTIONS = Object.freeze([
  'profile',
  'careerTwin',
  'matches',
  'roadmap',
  'assessments',
  'interviews',
  'opportunities',
]);

/**
 * Computes prioritized dashboard section ordering.
 *
 * @param {object} summary Summary state of the student
 * @param {object} [preferences={}] Student profile preferences
 * @returns {object} Prioritized sections with explainable rationale
 */
export function prioritizeDashboardSections(summary = {}, preferences = {}) {
  const safePrefs = preferences && typeof preferences === 'object' ? preferences : {};
  const profile = summary.profile || {};
  const careerTwin = summary.careerTwin || {};
  const goals = Array.isArray(safePrefs.priorityGoals)
    ? safePrefs.priorityGoals.map((g) => String(g).toLowerCase().trim())
    : [];

  // Stage 1: Pipeline blockers override preference-based ordering
  const hasProfileContent =
    (profile.skillCount ?? 0) + (profile.projectCount ?? 0) > 0;
  if (!profile.exists || !hasProfileContent) {
    return {
      orderedSections: [
        'profile',
        'careerTwin',
        'roadmap',
        'matches',
        'assessments',
        'interviews',
        'opportunities',
      ],
      prioritizedBy: 'pipeline_blocker',
      primaryFocus: 'profile',
      rationale:
        'Complete your profile with initial skills or projects to unlock CareerTwin modeling.',
    };
  }

  if (!careerTwin.exists) {
    return {
      orderedSections: [
        'careerTwin',
        'profile',
        'roadmap',
        'matches',
        'assessments',
        'interviews',
        'opportunities',
      ],
      prioritizedBy: 'pipeline_blocker',
      primaryFocus: 'careerTwin',
      rationale:
        'Build your CareerTwin to measure verified evidence against target career roles.',
    };
  }

  if (careerTwin.isStale) {
    return {
      orderedSections: [
        'careerTwin',
        'roadmap',
        'matches',
        'assessments',
        'interviews',
        'opportunities',
        'profile',
      ],
      prioritizedBy: 'staleness_refresh',
      primaryFocus: 'careerTwin',
      rationale:
        'Your profile or resume changed. Regenerate your CareerTwin to refresh recommendations.',
    };
  }

  // Stage 2: Goal-based personalization for active students
  const hasGoal = (keyword) => goals.some((g) => g.includes(keyword));

  if (hasGoal('interview')) {
    return {
      orderedSections: [
        'interviews',
        'roadmap',
        'matches',
        'assessments',
        'opportunities',
        'careerTwin',
        'profile',
      ],
      prioritizedBy: 'student_priority_goals',
      primaryFocus: 'interviews',
      rationale:
        'Prioritized AI mock interviews based on your interview preparation goal.',
    };
  }

  if (hasGoal('assessment') || hasGoal('eval') || hasGoal('test')) {
    return {
      orderedSections: [
        'assessments',
        'roadmap',
        'interviews',
        'matches',
        'opportunities',
        'careerTwin',
        'profile',
      ],
      prioritizedBy: 'student_priority_goals',
      primaryFocus: 'assessments',
      rationale:
        'Prioritized technical assessments based on your skill evaluation goal.',
    };
  }

  if (hasGoal('job') || hasGoal('opportunity') || hasGoal('internship')) {
    return {
      orderedSections: [
        'opportunities',
        'matches',
        'roadmap',
        'interviews',
        'assessments',
        'careerTwin',
        'profile',
      ],
      prioritizedBy: 'student_priority_goals',
      primaryFocus: 'opportunities',
      rationale:
        'Prioritized career opportunities and role matches based on your job placement goal.',
    };
  }

  // Stage 3: Default pipeline milestone ordering
  return {
    orderedSections: [
      'roadmap',
      'matches',
      'interviews',
      'assessments',
      'opportunities',
      'careerTwin',
      'profile',
    ],
    prioritizedBy: 'pipeline_milestone',
    primaryFocus: 'roadmap',
    rationale:
      'Structured by your active learning roadmap and role progression milestones.',
  };
}
