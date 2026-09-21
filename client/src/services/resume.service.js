import { post, request } from './apiClient.js';

/**
 * Resume calls against the Nexora API.
 *
 * Same job as profile.service.js: unwrap the envelope, and guarantee a
 * complete shape so no component has to write `resume.analysis?.status ?? …`.
 *
 * Every endpoint here already exists on the backend. Nothing is invented —
 * in particular there is no upload call, because `ACCEPTED_RESUME_SOURCES`
 * in server/src/constants/resumePolicy.js still lists only pasted text.
 */

/** Mirrors PROCESSING_STATUS in server/src/constants/resumePolicy.js. */
export const PROCESSING_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Fills in the parts of a resume a component reads unconditionally.
 *
 * The backend's serialiser is already an allow-list with defaults, so this is
 * a second belt rather than a rewrite: it exists so that a summary (which has
 * no `parsed` or `warnings`) and a full resume can be rendered by the same
 * component without branching.
 */
function toResume(resume) {
  return {
    id: resume.id,
    label: resume.label ?? null,
    source: resume.source,
    file: {
      originalName: resume.file?.originalName ?? null,
      sizeBytes: resume.file?.sizeBytes ?? null,
    },
    textLength: resume.textLength ?? 0,
    extraction: toStep(resume.extraction),
    analysis: toStep(resume.analysis),
    hasParsedData: Boolean(resume.hasParsedData),
    createdAt: resume.createdAt ?? null,
    updatedAt: resume.updatedAt ?? null,

    // Present on a single resume, absent on a list summary.
    extractedText: resume.extractedText ?? null,
    analysedBy: resume.analysedBy ?? null,
    parsed: resume.parsed ?? null,
    warnings: resume.warnings ?? [],
  };
}

function toStep(step) {
  return {
    status: step?.status ?? PROCESSING_STATUS.PENDING,
    startedAt: step?.startedAt ?? null,
    completedAt: step?.completedAt ?? null,
    error: step?.error ?? null,
  };
}

function unwrap(body, key) {
  const value = body?.data?.[key];
  if (value === undefined || value === null) {
    throw new Error('The backend returned an unexpected response shape.');
  }
  return value;
}

/** GET /api/resumes — summaries, newest first. */
export async function fetchResumes({ signal } = {}) {
  const body = await request('/api/resumes', { signal });
  return unwrap(body, 'resumes').map(toResume);
}

/** GET /api/resumes/:id — one resume in full, including its text. */
export async function fetchResume(resumeId, { signal } = {}) {
  const body = await request(`/api/resumes/${encodeURIComponent(resumeId)}`, { signal });
  return toResume(unwrap(body, 'resume'));
}

/**
 * POST /api/resumes — stores a resume's text.
 *
 * `source` is not a parameter. The server accepts exactly one value today and
 * defaults to it, so sending it from here would be a second place to change
 * when upload arrives.
 */
export async function createResume({ label, text }) {
  const body = await post('/api/resumes', { label, text });
  return toResume(unwrap(body, 'resume'));
}

/**
 * POST /api/resumes/:id/analysis — runs the AI pipeline over a stored resume.
 *
 * Separate from creation on the backend, and kept separate here: analysing
 * costs money and a student who only wanted to keep a copy should not pay it.
 */
export async function analyseResume(resumeId) {
  const body = await post(`/api/resumes/${encodeURIComponent(resumeId)}/analysis`);
  return toResume(unwrap(body, 'resume'));
}

/** DELETE /api/resumes/:id */
export async function deleteResume(resumeId) {
  await request(`/api/resumes/${encodeURIComponent(resumeId)}`, { method: 'DELETE' });
}
