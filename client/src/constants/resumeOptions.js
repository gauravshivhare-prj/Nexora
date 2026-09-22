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
