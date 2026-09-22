/**
 * Client-side mirror of the resume rules the UI has to know before it can
 * usefully talk to the server.
 *
 * ## Source-of-truth arrangement
 *
 * The **server** (server/src/constants/resumePolicy.js) is the authority.
 * Nothing here is treated as a substitute for the server's answer, and a
 * value that drifts shows up as a field error rather than as accepted bad
 * data. The **server** enforces every limit in its request validator and
 * Mongoose schema; the client may never weaken what the server rejects.
 *
 * These values exist on the **client** for one reason: instant feedback.
 * Without them, a student can paste 60,000 characters and wait for a round
 * trip to be told no, or watch a counter that cannot say how much room is
 * left. They are **client UX guards**, not security boundaries.
 *
 * ### Authoritative server policy (mirrored here)
 * | Server constant              | Client constant          |
 * |------------------------------|--------------------------|
 * | `RESUME_LIMITS.text`         | `RESUME_TEXT_LIMITS`     |
 * | `RESUME_LIMITS.label`        | `RESUME_LABEL_MAX`       |
 * | `RESUME_LIMITS.perUser`      | `RESUMES_PER_USER`       |
 * | `ACCEPTED_UPLOAD_TYPES`      | `RESUME_UPLOAD_TYPES`    |
 * | `UPLOAD_LIMITS.maxBytes`     | `RESUME_UPLOAD_MAX_BYTES`|
 *
 * ### Client-only UX constants
 * | Constant                     | Purpose                  |
 * |------------------------------|--------------------------|
 * | `RESUME_UPLOAD_ACCEPT`       | Computed `accept` attr   |
 * | `FILE_UPLOAD_AVAILABLE`      | Feature-gate for UI      |
 *
 * If a server limit changes, change it in both places. The parity test in
 * client/tests/resumePolicyParity.test.js catches disagreements at CI time.
 */

/** RESUME_LIMITS.text — the length bounds the server enforces. */
export const RESUME_TEXT_LIMITS = { min: 50, max: 40_000 };

/** RESUME_LIMITS.label */
export const RESUME_LABEL_MAX = 120;

/** RESUME_LIMITS.perUser — how many resumes one student may keep. */
export const RESUMES_PER_USER = 10;

/** The client-side mirror of the backend's upload policy. */
export const RESUME_UPLOAD_TYPES = {
  'application/pdf': { extensions: ['.pdf'], label: 'PDF' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extensions: ['.docx'],
    label: 'Word document (.docx)',
  },
  'text/plain': { extensions: ['.txt'], label: 'plain text' },
};

export const RESUME_UPLOAD_ACCEPT = Object.entries(RESUME_UPLOAD_TYPES)
  .flatMap(([mimeType, type]) => [mimeType, ...type.extensions])
  .join(',');

export const RESUME_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export const FILE_UPLOAD_AVAILABLE = true;
