/**
 * Client-side mirror of the resume rules the UI has to know before it can
 * usefully talk to the server.
 *
 * These duplicate server/src/constants/resumePolicy.js, which is a cost worth
 * naming: the alternative is a form that lets someone paste 60,000 characters
 * and waits for a round trip to say no, or a counter that cannot tell them
 * how much room is left. The server remains the authority — nothing here is
 * treated as a substitute for its answer, and a value that drifts shows up as
 * a field error rather than as accepted bad data.
 */

/** RESUME_LIMITS.text — the length bounds the server enforces. */
export const RESUME_TEXT_LIMITS = { min: 50, max: 40_000 };

/** RESUME_LIMITS.label */
export const RESUME_LABEL_MAX = 120;

/** RESUME_LIMITS.perUser — how many resumes one student may keep. */
export const RESUMES_PER_USER = 10;

/**
 * Whether the backend accepts an uploaded file yet.
 *
 * Derived from ACCEPTED_RESUME_SOURCES, which still lists only pasted text.
 * The UI says so plainly instead of offering a file picker that would fail:
 * a control that cannot work is worse than an absent one.
 *
 * There is no capability endpoint to read this from, so flipping it is a
 * manual step when the upload route lands. That is recorded as debt rather
 * than solved by probing the API with a request designed to fail.
 */
export const FILE_UPLOAD_AVAILABLE = false;
