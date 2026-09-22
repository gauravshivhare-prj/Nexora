import multer from 'multer';

import { ERROR_CODES } from '../constants/errorCodes.js';
import { ACCEPTED_UPLOAD_LABELS, UPLOAD_LIMITS } from '../constants/resumePolicy.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Multipart handling for the one endpoint that accepts a file.
 *
 * Memory storage, deliberately. Nexora has nowhere to put an original yet —
 * `file.storageKey` on the model is the placeholder for when it does — and
 * writing to a temporary directory in the meantime would create a class of
 * problem with no upside: a path to get wrong, files to clean up, and a
 * window where an unvalidated document sits on disk. The size limit below
 * is what makes holding it in memory safe.
 *
 * The limits are enforced by multer before the body is fully read, so an
 * oversized upload is cut off mid-stream rather than buffered and then
 * measured.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_LIMITS.maxBytes,
    files: UPLOAD_LIMITS.maxFiles,
    /**
     * The accompanying text fields — only `label` is read. Bounded so the
     * multipart body cannot be used to smuggle a large payload past the
     * file limit in a field instead.
     */
    fields: 5,
    fieldSize: 1024,
    parts: 10,
  },
}).single('file');

/**
 * Parses one `file` part, translating multer's errors into Nexora's.
 *
 * Wrapped rather than used directly because multer rejects with its own
 * error type and its own messages, which the error handler would report as
 * an unexplained 500. Each case a student can actually cause gets a 400
 * that says what to do instead.
 */
export function uploadResumeFile(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      return next(toApiError(error));
    }

    return next(error);
  });
}

function toApiError(error) {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return ApiError.badRequest(
        `That file is larger than the ${Math.round(UPLOAD_LIMITS.maxBytes / (1024 * 1024))}MB limit.`,
        ERROR_CODES.VALIDATION_ERROR,
      );

    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return ApiError.badRequest(
        'Send exactly one file, in a field named "file".',
        ERROR_CODES.VALIDATION_ERROR,
      );

    case 'LIMIT_FIELD_VALUE':
    case 'LIMIT_FIELD_COUNT':
    case 'LIMIT_PART_COUNT':
      return ApiError.badRequest(
        'That upload carried more form data than this endpoint accepts.',
        ERROR_CODES.VALIDATION_ERROR,
      );

    default:
      // An unrecognised multer code is a bug or a new version, not
      // something the student did. It still must not surface internals.
      return ApiError.badRequest(
        `That upload could not be read. Send one file of type ${ACCEPTED_UPLOAD_LABELS.join(', ')}.`,
        ERROR_CODES.VALIDATION_ERROR,
      );
  }
}
