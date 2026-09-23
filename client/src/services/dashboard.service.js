import { request } from './apiClient.js';

/**
 * Everything the dashboard shows, in one read.
 *
 * This module used to compose five endpoints client-side, two of which
 * depended on the result of a third — six round trips to render one page.
 * `GET /api/summary` now returns the same figures in one, so this is the
 * single file that changed and the page above it did not.
 *
 * Nothing is computed here. Every count, score, status and next-step comes
 * from the endpoint, which in turn takes each figure from the domain service
 * that owns it — so the dashboard cannot disagree with the page it links to.
 */

/**
 * A section's state.
 *
 * `EMPTY` and `FAILED` stay distinct, as they did before: "you have not
 * built a CareerTwin" and "the request failed" are different things to tell
 * a student, and rendering both as an empty box lies about one of them.
 */
export const SECTION_STATUS = { READY: 'ready', EMPTY: 'empty', FAILED: 'failed' };

const { READY, EMPTY, FAILED } = SECTION_STATUS;

function section(status, value = null, error = null) {
  return { status, value, error };
}

/**
 * Loads the dashboard.
 *
 * One request, so unlike the previous version there are no longer
 * independent per-section failures to report: either the summary arrives or
 * it does not. The section shape is kept because emptiness is still
 * per-section, and because the page renders against it.
 *
 * @returns {Promise<object>} Sections, each `{ status, value, error }`.
 */
export async function fetchDashboard({ signal } = {}) {
  const body = await request('/api/summary', { signal });

  const data = body?.data;
  if (!data) throw new Error('The backend returned an unexpected response shape.');

  const readiness = data.focusRole
    ? await request(
        `/api/careers/roles/${encodeURIComponent(data.focusRole.roleId)}/readiness`,
        { signal },
      )
          .then((result) => {
            if (!result?.data?.readiness) {
              throw new Error('The backend returned an unexpected readiness response.');
            }
            return section(READY, result.data.readiness);
          })
          .catch((error) => section(FAILED, null, error))
    : section(EMPTY);

  return {
    profile: data.profile.exists ? section(READY, data.profile) : section(EMPTY),
    resumes: data.resumes.total > 0 ? section(READY, data.resumes) : section(EMPTY),
    careerTwin: data.careerTwin.exists ? section(READY, data.careerTwin) : section(EMPTY),
    matches: data.matches.exists ? section(READY, data.matches) : section(EMPTY),
    focusRole: data.focusRole ? section(READY, data.focusRole) : section(EMPTY),
    skillGap: data.skillGap ? section(READY, data.skillGap) : section(EMPTY),
    roadmap: data.roadmap ? section(READY, data.roadmap) : section(EMPTY),
    readiness,

    /**
     * What to do next, decided by the backend.
     *
     * Previously worked out in the page from the shape of the other
     * sections. Moving it server-side removes the second implementation of
     * an ordering that the pipeline already imposes, and gives the client a
     * stable code to branch on instead of matching on English.
     */
    nextStep: data.nextStep ?? null,
  };
}

/** Exported for the failure branch the page still renders. */
export const FAILED_SECTION = FAILED;
