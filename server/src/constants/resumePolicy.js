/**
 * Resume rules in one place.
 *
 * Same arrangement as authPolicy.js and profilePolicy.js: the validator, the
 * schema and the tests all read these, so a limit cannot drift.
 */

/**
 * How a resume's text reached Nexora.
 *
 * Only PASTED_TEXT is accepted today. FILE_UPLOAD is declared now because the
 * field it lives on is part of the stored shape, and a value added to an enum
 * later is a migration — but nothing produces it yet, and the API rejects it.
 */
export const RESUME_SOURCES = {
  PASTED_TEXT: 'pasted_text',
  FILE_UPLOAD: 'file_upload',
};

/**
 * The sources a client may name in a JSON create body.
 *
 * Still pasted text alone, now that uploads exist. `file_upload` is set by
 * the upload route itself, from the fact that a file arrived — never from
 * something the client said. Accepting it here would let a plain JSON
 * request store pasted text labelled as an extracted document, which is a
 * lie about provenance and the kind that later phases would act on.
 */
export const ACCEPTED_RESUME_SOURCES = [RESUME_SOURCES.PASTED_TEXT];

export const RESUME_SOURCE_VALUES = Object.values(RESUME_SOURCES);

/**
 * Lifecycle of one processing step.
 *
 * Both extraction (file → text) and analysis (text → structured data) use
 * these. Keeping the two statuses separate matters: a resume whose text was
 * read perfectly but whose analysis failed is a different problem from one
 * that could not be read at all, and a single status could not say which.
 */
export const PROCESSING_STATUS = {
  /** Not started. */
  PENDING: 'pending',
  /** Running now. Guards against a second concurrent run. */
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const PROCESSING_STATUS_VALUES = Object.values(PROCESSING_STATUS);

export const RESUME_LIMITS = {
  /**
   * Resume text length.
   *
   * The lower bound rejects an empty paste or a stray line; the upper bound
   * is roughly a very long CV and keeps one document from dominating both
   * storage and an eventual prompt's token budget.
   */
  text: { min: 50, max: 40_000 },

  label: 120,
  fileName: 255,

  /** How many resumes one student may keep. Versions, not a document store. */
  perUser: 10,
};

/**
 * What may be uploaded, keyed by MIME type.
 *
 * An allow-list, not a deny-list: the question "is this dangerous?" has no
 * stable answer, whereas "is this one of the three things we can read?"
 * does. Each entry names the extensions that legitimately carry that type,
 * so a `.exe` renamed to `.pdf` and a `.pdf` renamed to `.exe` are both
 * rejected — the declared type and the file name have to agree, and both
 * have to be on the list.
 *
 * The browser supplies the MIME type, so neither of those is trustworthy on
 * its own. They are a cheap first gate; the real check is whether the
 * extractor can actually read the bytes, which happens afterwards.
 */
export const ACCEPTED_UPLOAD_TYPES = {
  'application/pdf': { extensions: ['.pdf'], label: 'PDF' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extensions: ['.docx'],
    label: 'Word document (.docx)',
  },
  'text/plain': { extensions: ['.txt'], label: 'plain text' },
};

export const ACCEPTED_UPLOAD_MIME_TYPES = Object.keys(ACCEPTED_UPLOAD_TYPES);

/** Human-readable list, for an error message that says what would work. */
export const ACCEPTED_UPLOAD_LABELS = Object.values(ACCEPTED_UPLOAD_TYPES).map(
  (type) => type.label,
);

export const UPLOAD_LIMITS = {
  /**
   * Largest file accepted, in bytes.
   *
   * Five megabytes is generously above any real resume — a text-heavy CV is
   * tens of kilobytes, and a design-heavy one with embedded images rarely
   * passes two megabytes. The bound exists because parsing untrusted
   * documents costs CPU and memory in proportion to their size, and an
   * unbounded upload is the cheapest denial-of-service there is.
   */
  maxBytes: 5 * 1024 * 1024,

  /**
   * Pages read from a PDF.
   *
   * A separate bound from the byte size: a small file can declare thousands
   * of pages, and page count rather than file size is what the extraction
   * time tracks.
   */
  maxPdfPages: 50,

  /** One file per request. A resume is one document. */
  maxFiles: 1,
};

/**
 * Bounds on the structured data an AI provider returns.
 *
 * These are a safety limit on *untrusted* output, not a description of a
 * realistic resume. A model that returns two hundred skills has malfunctioned,
 * and storing them would push the problem downstream into every later phase.
 */
export const PARSED_LIMITS = {
  string: 300,
  description: 2000,
  skills: { maxItems: 100, maxLength: 80 },
  education: { maxItems: 20 },
  projects: { maxItems: 40 },
  experience: { maxItems: 40 },
  certifications: { maxItems: 40 },
  achievements: { maxItems: 40, maxLength: 300 },
  links: { maxItems: 15, maxLength: 500 },
  technologies: { maxItems: 30, maxLength: 60 },
};

/**
 * Version of the parsed-resume shape.
 *
 * Stored alongside the data so a later change to the shape can be detected
 * rather than guessed at. A document parsed under an older version can then
 * be re-analysed deliberately instead of being silently misread.
 */
export const PARSED_SCHEMA_VERSION = 1;

/**
 * Year range accepted in parsed education, experience and certifications.
 *
 * Wide on purpose — this validates a machine's reading of a document, and a
 * tight range would reject a legitimate older qualification. Anything outside
 * it is a misparse rather than an unusual student.
 */
export const PARSED_YEAR_RANGE = { min: 1950, max: 2100 };
