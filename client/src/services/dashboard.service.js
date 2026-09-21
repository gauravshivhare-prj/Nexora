import { ApiRequestError } from './apiClient.js';
import { fetchCareerTwin } from './careerTwin.service.js';
import { fetchRecommendations, fetchRoadmap, fetchSkillGap } from './career.service.js';
import { fetchProfile } from './profile.service.js';
import { fetchResumes } from './resume.service.js';

/**
 * Everything the dashboard shows, gathered in one place.
 *
 * There is no summary endpoint yet, so this composes the five that exist.
 * It is deliberately the *only* place that composition happens: when a
 * server-side aggregate lands, this module is the single file that changes
 * and the page above it does not.
 *
 * Nothing is computed here beyond picking which role to drill into. Every
 * count, score, status and priority on the dashboard is a value the backend
 * returned — duplicating any of that scoring would give the dashboard an
 * opinion that could disagree with the page it links to.
 */

/**
 * A section that could not be loaded, or that has nothing to show yet.
 *
 * Distinguished on purpose. "You have not built a CareerTwin" and "the
 * CareerTwin request failed" are different things to tell a student, and a
 * dashboard that renders both as an empty box is lying about one of them.
 */
function section(status, value = null, error = null) {
  return { status, value, error };
}

const READY = 'ready';
const EMPTY = 'empty';
const FAILED = 'failed';

/**
 * Loads the dashboard.
 *
 * Every request is independent and allowed to fail on its own: a resume
 * service outage should cost the student the resume tile, not the whole
 * page. Each section therefore reports its own state.
 *
 * @returns {Promise<object>} Sections, each `{ status, value, error }`.
 */
export async function fetchDashboard({ signal } = {}) {
  const [profile, twin, resumes, recommendations] = await Promise.allSettled([
    fetchProfile({ signal }),
    fetchCareerTwin({ signal }),
    fetchResumes({ signal }),
    fetchRecommendations({ limit: 3, signal }),
  ]);

  const dashboard = {
    profile: fromSettled(profile, (value) => (value.exists ? section(READY, value) : section(EMPTY))),

    careerTwin: fromSettled(twin, (value) =>
      value.exists ? section(READY, value.twin) : section(EMPTY),
    ),

    resumes: fromSettled(resumes, (value) =>
      value.length > 0 ? section(READY, value) : section(EMPTY),
    ),

    matches: fromSettled(recommendations, (value) =>
      value.matches.length > 0 ? section(READY, value) : section(EMPTY),
    ),

    // Filled in below, if there is a role to fill them from.
    focusRole: section(EMPTY),
    skillGap: section(EMPTY),
    roadmap: section(EMPTY),
  };

  // Recommendations depend on a twin, so this section stays empty rather
  // than failed when there simply is not one yet.
  if (recommendations.status === 'rejected' && isMissingTwin(recommendations.reason)) {
    dashboard.matches = section(EMPTY);
  }

  const focus = dashboard.matches.value?.matches?.[0];
  if (!focus) return dashboard;

  dashboard.focusRole = section(READY, { roleId: focus.roleId, title: focus.title });

  // Only for the top-ranked role. Loading a gap and a roadmap for all ten
  // would be twenty requests to render four numbers.
  const [gap, roadmap] = await Promise.allSettled([
    fetchSkillGap(focus.roleId, { signal }),
    fetchRoadmap(focus.roleId, { signal }),
  ]);

  dashboard.skillGap = fromSettled(gap, (value) => section(READY, value));
  dashboard.roadmap = fromSettled(roadmap, (value) => section(READY, value));

  return dashboard;
}

function fromSettled(settled, toSection) {
  if (settled.status === 'fulfilled') return toSection(settled.value);
  if (isMissingTwin(settled.reason)) return section(EMPTY);

  return section(FAILED, null, settled.reason);
}

/** A 409 saying the student has no CareerTwin — a state, not a failure. */
function isMissingTwin(error) {
  return error instanceof ApiRequestError && error.errorCode === 'CAREER_TWIN_NOT_FOUND';
}

export const SECTION_STATUS = { READY, EMPTY, FAILED };
