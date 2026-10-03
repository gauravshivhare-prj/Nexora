/**
 * Task 27 — Complete Student Career Journey / Closed-Loop Intelligence.
 *
 * Defines the canonical 10-milestone student career readiness progression
 * and computes closed-loop journey progress deterministically.
 */

export const JOURNEY_MILESTONE_KEYS = Object.freeze({
  PROFILE_CREATED: 'profile_created',
  RESUME_UPLOADED: 'resume_uploaded',
  RESUME_ANALYZED: 'resume_analyzed',
  TWIN_GENERATED: 'twin_generated',
  RECOMMENDATIONS_VIEWED: 'recommendations_viewed',
  GAP_ANALYZED: 'gap_analyzed',
  ROADMAP_GENERATED: 'roadmap_generated',
  ASSESSMENT_ATTEMPTED: 'assessment_attempted',
  INTERVIEW_COMPLETED: 'interview_completed',
  ROLE_FIT_VERIFIED: 'role_fit_verified',
});

export const JOURNEY_STAGES = Object.freeze({
  ONBOARDING: 'Onboarding',
  DISCOVERY: 'Discovery',
  PLANNING: 'Planning',
  VALIDATION: 'Validation',
  ALIGNMENT: 'Alignment',
});

/**
 * 10 Canonical Career Journey Milestones.
 */
export const JOURNEY_MILESTONES = Object.freeze([
  {
    key: JOURNEY_MILESTONE_KEYS.PROFILE_CREATED,
    label: 'Create Profile',
    order: 1,
    stage: JOURNEY_STAGES.ONBOARDING,
    description: 'Add initial skills, projects, and target role to your profile.',
    actionRoute: '/profile',
  },
  {
    key: JOURNEY_MILESTONE_KEYS.RESUME_UPLOADED,
    label: 'Upload Resume',
    order: 2,
    stage: JOURNEY_STAGES.ONBOARDING,
    description: 'Upload your CV/resume document.',
    actionRoute: '/resumes',
  },
  {
    key: JOURNEY_MILESTONE_KEYS.RESUME_ANALYZED,
    label: 'Analyze Resume',
    order: 3,
    stage: JOURNEY_STAGES.ONBOARDING,
    description: 'Extract skills and experience into verified career evidence.',
    actionRoute: '/resumes',
  },
  {
    key: JOURNEY_MILESTONE_KEYS.TWIN_GENERATED,
    label: 'Build CareerTwin',
    order: 4,
    stage: JOURNEY_STAGES.DISCOVERY,
    description: 'Construct your digital skill twin from multi-source evidence.',
    actionRoute: '/career-twin',
  },
  {
    key: JOURNEY_MILESTONE_KEYS.RECOMMENDATIONS_VIEWED,
    label: 'Explore Recommendations',
    order: 5,
    stage: JOURNEY_STAGES.DISCOVERY,
    description: 'Review role recommendations matched against your skill strengths.',
    actionRoute: '/careers',
  },
  {
    key: JOURNEY_MILESTONE_KEYS.GAP_ANALYZED,
    label: 'Analyze Skill Gap',
    order: 6,
    stage: JOURNEY_STAGES.PLANNING,
    description: 'Audit missing and blocking skills for your chosen target role.',
    actionRoute: '/careers',
  },
  {
    key: JOURNEY_MILESTONE_KEYS.ROADMAP_GENERATED,
    label: 'Generate Learning Roadmap',
    order: 7,
    stage: JOURNEY_STAGES.PLANNING,
    description: 'Review personalized sequence of milestones to bridge skill gaps.',
    actionRoute: '/roadmap',
  },
  {
    key: JOURNEY_MILESTONE_KEYS.ASSESSMENT_ATTEMPTED,
    label: 'Attempt Skill Assessment',
    order: 8,
    stage: JOURNEY_STAGES.VALIDATION,
    description: 'Verify your knowledge through MCQ and practical coding assessments.',
    actionRoute: '/assessments',
  },
  {
    key: JOURNEY_MILESTONE_KEYS.INTERVIEW_COMPLETED,
    label: 'Complete AI Interview',
    order: 9,
    stage: JOURNEY_STAGES.VALIDATION,
    description: 'Practice real-time technical questions with automated AI evaluation.',
    actionRoute: '/interviews',
  },
  {
    key: JOURNEY_MILESTONE_KEYS.ROLE_FIT_VERIFIED,
    label: 'Audit Role Fit & Preparation',
    order: 10,
    stage: JOURNEY_STAGES.ALIGNMENT,
    description: 'Review your composite preparation score and blocker status.',
    actionRoute: '/careers',
  },
]);

/**
 * Checks whether a specific milestone has been completed based on student state.
 *
 * @param {string} milestoneKey
 * @param {object} context Unified student context (canonicalStudent or summary state)
 * @returns {boolean}
 */
export function isMilestoneCompleted(milestoneKey, context = {}) {
  if (!context || typeof context !== 'object') {
    return false;
  }

  // Support both canonicalStudent (Task 02) and dashboard summary structures
  const isCanonical = Boolean(context.version && context.metadata?.sourceCounts);

  switch (milestoneKey) {
    case JOURNEY_MILESTONE_KEYS.PROFILE_CREATED: {
      if (isCanonical) {
        return Boolean(context.metadata.sourceCounts.hasProfile);
      }
      const profile = context.profile;
      return Boolean(profile?.exists && (profile.skillCount > 0 || profile.projectCount > 0 || profile.hasTargetRole));
    }

    case JOURNEY_MILESTONE_KEYS.RESUME_UPLOADED: {
      if (isCanonical) {
        return (context.metadata.sourceCounts.resumesCount || 0) > 0;
      }
      return (context.resumes?.total || 0) > 0;
    }

    case JOURNEY_MILESTONE_KEYS.RESUME_ANALYZED: {
      if (isCanonical) {
        // In canonical student, skills with provenanceTier 'ai_extracted' prove resume analysis
        const hasExtractedSkills = Array.isArray(context.skills) &&
          context.skills.some((s) => s.provenanceTier === 'ai_extracted' || (s.sources || []).includes('resume_extraction'));
        return hasExtractedSkills || (context.metadata.sourceCounts.resumesCount || 0) > 0;
      }
      return (context.resumes?.analysed || 0) > 0;
    }

    case JOURNEY_MILESTONE_KEYS.TWIN_GENERATED: {
      if (isCanonical) {
        return Array.isArray(context.skills) && context.skills.length > 0;
      }
      return Boolean(context.careerTwin?.exists);
    }

    case JOURNEY_MILESTONE_KEYS.RECOMMENDATIONS_VIEWED: {
      if (isCanonical) {
        return Boolean(context.career?.targetRole || (context.career?.careerInterests?.length || 0) > 0);
      }
      return Boolean(context.matches?.exists && (context.matches.top?.length || 0) > 0);
    }

    case JOURNEY_MILESTONE_KEYS.GAP_ANALYZED: {
      if (isCanonical) {
        return Boolean(context.career?.targetRole);
      }
      return Boolean(context.skillGap !== null && context.skillGap !== undefined);
    }

    case JOURNEY_MILESTONE_KEYS.ROADMAP_GENERATED: {
      if (isCanonical) {
        return Boolean(context.career?.targetRole && (context.skills?.length || 0) > 0);
      }
      return Boolean(context.roadmap !== null && context.roadmap !== undefined);
    }

    case JOURNEY_MILESTONE_KEYS.ASSESSMENT_ATTEMPTED: {
      if (isCanonical) {
        return (context.metadata.sourceCounts.assessmentAttemptsCount || 0) > 0;
      }
      const attempts = context.assessmentAttemptsCount ?? context.assessments?.attemptsCount ?? 0;
      return attempts > 0;
    }

    case JOURNEY_MILESTONE_KEYS.INTERVIEW_COMPLETED: {
      if (isCanonical) {
        return (context.metadata.sourceCounts.interviewSessionsCount || 0) > 0;
      }
      const sessions = context.interviewSessionsCount ?? context.interviews?.completedCount ?? 0;
      return sessions > 0;
    }

    case JOURNEY_MILESTONE_KEYS.ROLE_FIT_VERIFIED: {
      if (isCanonical) {
        return (context.metadata.sourceCounts.evidenceChecksCount || 0) > 0;
      }
      return Boolean(context.focusRole && context.careerTwin?.exists && context.matches?.exists);
    }

    default:
      return false;
  }
}

/**
 * Computes the complete closed-loop student journey progress.
 * Pure deterministic function — no database queries, no side effects.
 *
 * @param {object} context Unified student context (canonicalStudent or summary state)
 * @returns {object} JourneyProgress report
 */
export function computeJourneyProgress(context = {}) {
  const milestones = [];
  let completedCount = 0;
  let nextMilestone = null;

  for (const template of JOURNEY_MILESTONES) {
    const isCompleted = isMilestoneCompleted(template.key, context);
    if (isCompleted) {
      completedCount++;
    } else if (!nextMilestone) {
      nextMilestone = {
        ...template,
        isCompleted: false,
      };
    }

    milestones.push({
      key: template.key,
      label: template.label,
      order: template.order,
      stage: template.stage,
      description: template.description,
      actionRoute: template.actionRoute,
      isCompleted,
    });
  }

  const totalMilestones = JOURNEY_MILESTONES.length;
  const progressPercentage = Math.round((completedCount / totalMilestones) * 100);

  // Determine current overarching journey stage
  let currentStage = JOURNEY_STAGES.ONBOARDING;
  if (progressPercentage >= 90) {
    currentStage = JOURNEY_STAGES.ALIGNMENT;
  } else if (progressPercentage >= 70) {
    currentStage = JOURNEY_STAGES.VALIDATION;
  } else if (progressPercentage >= 50) {
    currentStage = JOURNEY_STAGES.PLANNING;
  } else if (progressPercentage >= 30) {
    currentStage = JOURNEY_STAGES.DISCOVERY;
  }

  return {
    completedCount,
    totalMilestones,
    progressPercentage,
    currentStage,
    isComplete: completedCount === totalMilestones,
    milestones,
    nextMilestone,
  };
}
