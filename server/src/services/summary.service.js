import { PROCESSING_STATUS } from '../constants/resumePolicy.js';
import { CareerTwin, Resume, StudentProfile, isCareerTwinStale } from '../models/index.js';
import { getCareerTwin } from './careerTwin.service.js';
import { recommendRoles } from './recommendation.service.js';
import { getRoadmap } from './roadmap.service.js';
import { getSkillGap } from './skillGap.service.js';
import { logger } from '../utils/logger.js';

/**
 * One read that answers "where am I?".
 *
 * Exists because the dashboard otherwise needs six round trips to render,
 * two of which depend on the result of a third. That is a latency problem,
 * not a modelling one — so this endpoint adds no new concepts. Every number
 * it returns is produced by the domain service that owns it:
 *
 * - the CareerTwin and its staleness come from careerTwin.service
 * - the ranking comes from recommendation.service
 * - gap counts come from skillGap.service
 * - roadmap counts come from roadmap.service
 *
 * **Nothing is scored here.** There is deliberately no readiness figure, no
 * completion percentage and no weighting of one section against another: any
 * such number would be a second opinion competing with the page it summarises,
 * and the existing match score is already the one honest headline figure,
 * computed from published weights.
 *
 * Nothing is persisted either, for the same reason the gap and the roadmap
 * are not: a summary is a function of data that changes underneath it, and a
 * stored copy could only go stale.
 */

/**
 * How many roles the dashboard shows.
 *
 * Three, because the drill-down below is per-role and loading a gap and a
 * roadmap for all ten would be twenty computations to render three rows.
 */
const TOP_MATCHES = 3;

/**
 * Builds the summary for one student.
 *
 * Structured as sections that can each be empty, because they genuinely can
 * be: a new account has a profile and nothing else, and "you have not built
 * a CareerTwin" is a different thing to tell someone than "your CareerTwin
 * is empty". Each section says which it is rather than leaving a client to
 * infer it from a zero.
 *
 * @param {string} userId From requireAuth. Every query below is scoped to it.
 */
export async function getSummary(userId) {
  const [profile, twinResult, resumeCounts] = await Promise.all([
    loadProfileStatus(userId),
    getCareerTwin(userId),
    loadResumeCounts(userId),
  ]);

  const summary = {
    profile,
    resumes: resumeCounts,
    careerTwin: describeTwin(twinResult),
    matches: { exists: false, top: [], method: null },
    focusRole: null,
    skillGap: null,
    roadmap: null,
    /** What the student should do next, by the pipeline's own ordering. */
    nextStep: null,
  };

  // Everything below is measured against the twin, so without one there is
  // nothing to measure. Not an error — a student who has not built one has
  // not failed at anything.
  if (!twinResult.exists) {
    summary.nextStep = nextStepFor(summary);
    return summary;
  }

  const ranking = await recommendRoles(userId, { limit: TOP_MATCHES });

  summary.matches = {
    exists: ranking.matches.length > 0,
    top: ranking.matches.map(toMatchSummary),
    method: ranking.method ?? null,
  };

  const focus = ranking.matches[0];
  if (focus) {
    summary.focusRole = { roleId: focus.roleId, title: focus.title };

    // Only for the top match, and only its counts. A client that wants the
    // detail has the per-role endpoints; duplicating their full output here
    // would make this response grow with every field they gain.
    //
    // Promise.allSettled rather than Promise.all: a transient failure in one
    // section must not crash the entire summary. The defaults above are
    // already null, so a rejected section is simply absent.
    const [gapResult, roadmapResult] = await Promise.allSettled([
      getSkillGap(userId, focus.roleId),
      getRoadmap(userId, focus.roleId),
    ]);

    if (gapResult.status === 'fulfilled') {
      summary.skillGap = { roleId: focus.roleId, summary: gapResult.value.gap.summary };
    } else {
      logger.warn(`Summary: skill-gap section failed for user ${userId}`, gapResult.reason);
    }

    if (roadmapResult.status === 'fulfilled') {
      summary.roadmap = { roleId: focus.roleId, summary: roadmapResult.value.roadmap.summary };
    } else {
      logger.warn(`Summary: roadmap section failed for user ${userId}`, roadmapResult.reason);
    }
  }

  summary.nextStep = nextStepFor(summary);

  return summary;
}

/**
 * Whether a profile exists, and how much is in it.
 *
 * Counts rather than a completeness percentage. Weighting the sections
 * against each other would mean inventing which of a skill and a project is
 * worth more, and the student can see the counts for themselves.
 */
async function loadProfileStatus(userId) {
  const profile = await StudentProfile.findOne({ user: userId }).select(
    'skills projects certifications career.targetRole updatedAt',
  );

  if (!profile) {
    return {
      exists: false,
      skillCount: 0,
      projectCount: 0,
      certificationCount: 0,
      hasTargetRole: false,
      updatedAt: null,
    };
  }

  return {
    exists: true,
    skillCount: profile.skills?.length ?? 0,
    projectCount: profile.projects?.length ?? 0,
    certificationCount: profile.certifications?.length ?? 0,
    hasTargetRole: Boolean(profile.career?.targetRole),
    updatedAt: profile.updatedAt ?? null,
  };
}

/**
 * Resume counts.
 *
 * Two counts because they answer different questions: how many documents the
 * student has kept, and how many of them Nexora can actually reason about.
 * An unanalysed resume contributes nothing to the twin.
 */
async function loadResumeCounts(userId) {
  const [total, analysed] = await Promise.all([
    Resume.countDocuments({ user: userId }),
    Resume.countDocuments({ user: userId, 'analysis.status': PROCESSING_STATUS.COMPLETED }),
  ]);

  return { total, analysed };
}

/** The twin's own indicators and staleness, unchanged. */
function describeTwin({ twin, exists }) {
  if (!exists) {
    return { exists: false, indicators: null, isStale: false, staleReasons: [], generatedAt: null };
  }

  return {
    exists: true,
    indicators: twin.indicators,
    isStale: twin.isStale,
    staleReasons: twin.staleReasons,
    generatedAt: twin.generatedAt,
  };
}

/**
 * A match, reduced to what a dashboard row shows.
 *
 * The score and band are the recommendation service's, untouched. The
 * per-dimension breakdown and the matched-skill lists are dropped: they are
 * what the careers page is for, and carrying them here would triple the
 * response to render three lines.
 */
function toMatchSummary(match) {
  return {
    roleId: match.roleId,
    title: match.title,
    score: match.score,
    band: match.band,
  };
}

/**
 * The first genuinely blocking thing, as a stable code plus a message.
 *
 * A code rather than prose alone, so a client can act on it — highlight a
 * card, change a button — without matching on English. The ordering is the
 * pipeline's own and not a judgement: a twin needs a profile, matches need a
 * twin. Nothing here is a recommendation about the student's career.
 */
function nextStepFor(summary) {
  if (!summary.profile.exists || summary.profile.skillCount + summary.profile.projectCount === 0) {
    return {
      code: 'COMPLETE_PROFILE',
      message: 'Add some skills or projects to your profile — everything else is built from it.',
    };
  }

  if (!summary.careerTwin.exists) {
    return {
      code: 'BUILD_CAREER_TWIN',
      message: 'Build your CareerTwin to see which roles fit what you can demonstrate.',
    };
  }

  if (summary.careerTwin.isStale) {
    return {
      code: 'REGENERATE_CAREER_TWIN',
      message: 'Your data has changed since your CareerTwin was built. Regenerate it.',
    };
  }

  if (!summary.matches.exists) {
    return {
      code: 'ADD_EVIDENCE',
      message: 'Nothing matched strongly yet. Adding projects gives Nexora more to go on.',
    };
  }

  if ((summary.roadmap?.summary?.totalItems ?? 0) > 0) {
    return {
      code: 'WORK_ON_ROADMAP',
      message: `Your roadmap towards ${summary.focusRole.title} has the next concrete thing to work on.`,
    };
  }

  return { code: 'UP_TO_DATE', message: 'Everything is up to date.' };
}
