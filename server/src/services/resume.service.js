import mongoose from 'mongoose';

import {
  ACCEPTED_RESUME_SOURCES,
  PARSED_SCHEMA_VERSION,
  PROCESSING_STALE_AFTER_MS,
  PROCESSING_STATUS,
  RESUME_LIMITS,
  RESUME_SOURCES,
} from '../constants/resumePolicy.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { Resume, toPublicResume, toResumeSummary } from '../models/index.js';
import { checkUploadedFile, extractTextFromFile } from '../domain/resume/extractText.js';
import { groundParsedResume } from '../domain/resume/groundParsedResume.js';
import { validateParsedResume } from '../domain/resume/parsedResumeSchema.js';
import { buildResumeExtractionRequest } from '../domain/resume/resumePrompt.js';
import { parseJsonObject } from './ai/aiJson.js';
import { requestCompletion, resolveAiProvider } from './ai/aiProvider.js';
import { ApiError } from '../utils/ApiError.js';
import { checkString, isBlank, isPlainObject, unknownKeyPaths } from '../utils/fieldTypes.js';
import { logger } from '../utils/logger.js';
import { ValidationCollector } from '../utils/validation.js';

/**
 * Resume business logic.
 *
 * Ownership works exactly as it does for profiles: every query is scoped by
 * the `userId` that requireAuth derived from a verified token. Unlike the
 * profile, a resume has an id in the URL — so the scoping is what stops one
 * student reading another's document, and it is applied in one place
 * (`findOwned`) rather than at each call site.
 */

const CREATE_KEYS = ['label', 'source', 'text'];

// ---------------------------------------------------------------- creation

/**
 * Validates a create-resume payload.
 *
 * Only pasted text is accepted today. File upload is rejected explicitly
 * rather than silently ignored, so a client that tries it is told the feature
 * does not exist yet instead of receiving an empty resume.
 *
 * @returns {{ label: string|null, source: string, text: string }}
 * @throws {ApiError} 400
 */
export function validateResumeInput(payload) {
  const collector = new ValidationCollector();

  if (!isPlainObject(payload)) {
    collector.add('body', 'Must be a resume object');
    collector.throwIfInvalid();
  }

  for (const path of unknownKeyPaths(payload, CREATE_KEYS, null)) {
    collector.add(path, 'Is not a recognised field');
  }

  let label = null;
  if (!isBlank(payload.label)) {
    const checked = checkString(payload.label, { max: RESUME_LIMITS.label });
    if (checked.error) collector.add('label', checked.error);
    else label = checked.value;
  }

  const source = isBlank(payload.source) ? RESUME_SOURCES.PASTED_TEXT : payload.source;
  if (!ACCEPTED_RESUME_SOURCES.includes(source)) {
    collector.add(
      'source',
      `Must be one of: ${ACCEPTED_RESUME_SOURCES.join(', ')}. File upload is not available yet.`,
    );
  }

  // Not trimmed to a single line: a resume's layout is part of its text, and
  // the grounding check reads the same string the model was given.
  const text = typeof payload.text === 'string' ? payload.text.trim() : null;
  if (!text) {
    collector.add('text', 'Resume text is required');
  } else if (text.length < RESUME_LIMITS.text.min) {
    collector.add('text', `Must be at least ${RESUME_LIMITS.text.min} characters`);
  } else if (text.length > RESUME_LIMITS.text.max) {
    collector.add('text', `Must be at most ${RESUME_LIMITS.text.max} characters`);
  }

  collector.throwIfInvalid();

  return { label, source, text };
}

/**
 * Stores a new resume.
 *
 * Extraction is marked complete immediately: for pasted text there is no
 * file to read, and pretending otherwise would leave every resume stuck in a
 * pending state that nothing would ever advance. Analysis stays pending — it
 * is a separate, explicit request.
 *
 * @param {string} userId From requireAuth.
 * @throws {ApiError} 400 on invalid input, 409 when the per-user limit is hit.
 */
export async function createResume(userId, payload) {
  const { label, source, text } = validateResumeInput(payload);

  const existing = await Resume.countDocuments({ user: userId });
  if (existing >= RESUME_LIMITS.perUser) {
    throw ApiError.conflict(
      `You can keep up to ${RESUME_LIMITS.perUser} resumes. Delete one before adding another.`,
      ERROR_CODES.CONFLICT,
    );
  }

  const resume = await Resume.create({
    user: userId,
    label,
    source,
    extractedText: text,
    extraction: {
      status: PROCESSING_STATUS.COMPLETED,
      startedAt: new Date(),
      completedAt: new Date(),
    },
    analysis: { status: PROCESSING_STATUS.PENDING },
  });

  return toPublicResume(resume);
}

/**
 * Stores a resume from an uploaded file.
 *
 * ```text
 * file → policy check → text extraction → the same pipeline as pasted text
 * ```
 *
 * Deliberately converges on `Resume.create` with the same shape the pasted
 * path produces, so everything downstream — analysis, grounding, the
 * CareerTwin — sees one kind of resume and cannot behave differently for an
 * uploaded one. The only differences are the two things that are genuinely
 * different: `source` says where the text came from, and `file` records
 * what it came from.
 *
 * `source` is set here, from the fact that a file arrived. It is never read
 * from the request: a client that could name its own source could store
 * pasted text labelled as an extracted document.
 *
 * Extraction is recorded as completed because it *did* complete, in this
 * request. A failure never reaches here — it is a 400 before anything is
 * written, since a resume row whose text could not be read has nothing in
 * it worth keeping.
 *
 * @param {string} userId From requireAuth.
 * @param {{ originalname: string, mimetype: string, size: number, buffer: Buffer }} file
 * @param {{ label?: unknown }} [fields] The non-file parts of the form.
 * @throws {ApiError} 400 on a rejected or unreadable file, 409 at the limit.
 */
export async function createResumeFromFile(userId, file, fields = {}) {
  const collector = new ValidationCollector();

  let label = null;
  if (!isBlank(fields.label)) {
    const checked = checkString(fields.label, { max: RESUME_LIMITS.label });
    if (checked.error) collector.add('label', checked.error);
    else label = checked.value;
  }

  const allowed = checkUploadedFile(file);
  if (!allowed.ok) collector.add('file', allowed.reason);

  // Both are reported together: a student who picked the wrong file and
  // typed too long a label should learn that once, not twice.
  collector.throwIfInvalid();

  // Checked before the parser runs. Doing the expensive thing first and
  // then refusing to store the result would burn CPU on an upload that was
  // never going to be kept.
  const existing = await Resume.countDocuments({ user: userId });
  if (existing >= RESUME_LIMITS.perUser) {
    throw ApiError.conflict(
      `You can keep up to ${RESUME_LIMITS.perUser} resumes. Delete one before adding another.`,
      ERROR_CODES.CONFLICT,
    );
  }

  const startedAt = new Date();
  const extracted = await extractTextFromFile(file);

  if (!extracted.ok) {
    // Logged with the cause, returned without it: the parser's own message
    // is derived from bytes the uploader chose.
    if (extracted.cause) {
      logger.warn(`Resume extraction failed for user ${userId}: ${extracted.cause.message}`);
    }

    const failure = new ValidationCollector();
    failure.add('file', extracted.reason);
    failure.throwIfInvalid();
  }

  const resume = await Resume.create({
    user: userId,
    label,
    source: RESUME_SOURCES.FILE_UPLOAD,
    file: {
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size ?? file.buffer.length,
      // Nothing is persisted anywhere, so there is no key to record. Null
      // rather than a made-up path, which would imply a file exists.
      storageKey: null,
    },
    extractedText: extracted.text,
    extraction: {
      status: PROCESSING_STATUS.COMPLETED,
      startedAt,
      completedAt: new Date(),
    },
    analysis: { status: PROCESSING_STATUS.PENDING },
  });

  return toPublicResume(resume);
}

// ----------------------------------------------------------------- reading

/** Lists the caller's resumes, newest first. Summaries only — no full text. */
export async function listResumes(userId) {
  const resumes = await Resume.find({ user: userId })
    .sort({ createdAt: -1 })
    // The two heaviest fields, excluded because a list never renders them.
    .select('-extractedText -parsed');

  return resumes.map(toResumeSummary);
}

/**
 * Loads one resume belonging to the caller.
 *
 * The owner is part of the query, not a check performed afterwards. A
 * document that is not the caller's is never loaded at all, so there is no
 * window in which the wrong resume is in memory and one missing `if` leaks it.
 *
 * A resume owned by someone else produces exactly the same 404 as one that
 * does not exist. Distinguishing them would turn the endpoint into a way to
 * discover which ids are real.
 *
 * @throws {ApiError} 404
 */
async function findOwned(userId, resumeId) {
  // A malformed id would make Mongoose throw a CastError, which the error
  // handler reports as a 400 "invalid identifier" — and that tells a caller
  // their id was merely misspelled rather than not theirs. Treat it as absent.
  if (!mongoose.isValidObjectId(resumeId)) throw resumeNotFound();

  const resume = await Resume.findOne({ _id: resumeId, user: userId });
  if (!resume) throw resumeNotFound();

  return resume;
}

function resumeNotFound() {
  return ApiError.notFound('No resume was found with that id.', ERROR_CODES.RESUME_NOT_FOUND);
}

export async function getResume(userId, resumeId) {
  return toPublicResume(await findOwned(userId, resumeId));
}

/** Deletes one of the caller's resumes. */
export async function deleteResume(userId, resumeId) {
  if (!mongoose.isValidObjectId(resumeId)) throw resumeNotFound();

  const result = await Resume.deleteOne({ _id: resumeId, user: userId });
  if (result.deletedCount === 0) throw resumeNotFound();
}

// ---------------------------------------------------------------- analysis

/**
 * Runs the AI pipeline over one resume and stores the result.
 *
 * ```text
 * resume text → provider → JSON parse → schema validation
 *             → grounding against the source text → persistence
 * ```
 *
 * Every stage can reject, and a rejection at any of them means nothing is
 * stored as parsed data. The failure itself is recorded on the document, with
 * a reason, so the student sees what happened rather than a silent no-op.
 *
 * A failed re-analysis deliberately leaves the previous parsed data in place.
 * The old reading was valid when it was made and `analysedBy` records what
 * produced it; deleting good data because a later attempt failed would be a
 * strictly worse outcome than keeping it alongside a visible failure.
 *
 * Runs inline rather than on a queue. It is one call, the client is waiting
 * for the result, and a job runner would be infrastructure this does not yet
 * need. The `processing` status is what a queue would later hand work from.
 *
 * @param {string} userId From requireAuth.
 * @throws {ApiError} 404 if not the caller's, 409 if already running,
 *   503 if no provider is configured or the provider failed,
 *   502 if the provider's output could not be trusted.
 */
export async function analyseResume(userId, resumeId, { signal } = {}) {
  const resume = await findOwned(userId, resumeId);

  if (isAnalysisRunning(resume.analysis)) {
    throw new ApiError(
      409,
      'This resume is already being analysed. Wait for it to finish.',
      ERROR_CODES.RESUME_ANALYSIS_IN_PROGRESS,
    );
  }

  // Checked before anything is written, so an unconfigured deployment leaves
  // the document exactly as it was rather than marking a failure nobody caused.
  const provider = resolveAiProvider();

  // Claimed with a compare-and-set on the state read above rather than a
  // save(): two concurrent requests would otherwise both pass the running
  // check and both pay for a provider call.
  const claim = { status: PROCESSING_STATUS.PROCESSING, startedAt: new Date(), error: null };
  const claimed = await Resume.updateOne(
    {
      _id: resume._id,
      user: userId,
      'analysis.status': resume.analysis?.status ?? null,
      'analysis.startedAt': resume.analysis?.startedAt ?? null,
    },
    { $set: { analysis: claim } },
  );
  if (claimed.modifiedCount === 0) {
    throw new ApiError(
      409,
      'This resume is already being analysed. Wait for it to finish.',
      ERROR_CODES.RESUME_ANALYSIS_IN_PROGRESS,
    );
  }
  resume.analysis = claim;

  try {
    const result = await runAnalysisPipeline(resume.extractedText, provider, signal);

    resume.parsed = result.parsed;
    resume.warnings = result.warnings;
    resume.analysedBy = {
      provider: provider.name,
      model: result.model,
      schemaVersion: PARSED_SCHEMA_VERSION,
    };
    resume.analysis = {
      status: PROCESSING_STATUS.COMPLETED,
      startedAt: resume.analysis.startedAt,
      completedAt: new Date(),
      error: null,
    };

    const stillExists = await Resume.exists({ _id: resume._id, user: userId });
    if (!stillExists) {
      throw resumeNotFound();
    }

    await resume.save();
    return toPublicResume(resume);
  } catch (error) {
    if (error?.errorCode === ERROR_CODES.RESUME_NOT_FOUND) {
      throw error;
    }
    await recordAnalysisFailure(resume, error);
    throw error;
  }
}

/**
 * Whether a run is genuinely still going.
 *
 * `processing` alone is not enough to answer this. Analysis runs inline, so
 * the status can only be left set by a process that died holding it — and a
 * student waiting on a run that no longer exists would wait forever. Past
 * the staleness window the claim is treated as abandoned and a fresh
 * attempt is allowed, which is the only way back for that resume.
 *
 * A missing `startedAt` counts as stale rather than as running. It means the
 * document was written by something that did not follow this path, and the
 * safe reading is the one that leaves the student a way forward.
 */
function isAnalysisRunning(analysis) {
  if (analysis?.status !== PROCESSING_STATUS.PROCESSING) return false;

  const startedAt = analysis.startedAt ? new Date(analysis.startedAt).getTime() : null;
  if (!startedAt || Number.isNaN(startedAt)) return false;

  return Date.now() - startedAt < PROCESSING_STALE_AFTER_MS;
}

/**
 * The untrusted half of analysis, with no database access.
 *
 * Separated so the rule is visible rather than remembered: this function can
 * only return data that has been through both validation steps, and the
 * caller is the only thing that writes.
 *
 * @throws {ApiError} 502 when the output cannot be trusted.
 */
async function runAnalysisPipeline(resumeText, provider, signal) {
  // The signal is the request's own. If the student gave up and closed the
  // tab there is nobody left to receive the answer, and a provider call is
  // the one part of this that costs money to finish for no reason.
  const { text, model } = await requestCompletion({
    ...buildResumeExtractionRequest(resumeText),
    signal,
  });

  const json = parseJsonObject(text);
  if (json.error) throw untrustedOutput(json.error);

  const validated = validateParsedResume(json.value);
  if (validated.errors.length > 0) {
    // The model's structural mistakes are described, not echoed: the response
    // contains the student's resume, and it must not end up in an error.
    throw untrustedOutput(`The AI response had the wrong shape. ${validated.errors.join(' ')}`);
  }

  const grounded = groundParsedResume(validated.value, resumeText);

  const warnings = [...validated.warnings, ...grounded.warnings];
  if (warnings.length > 0) {
    logger.warn(`Resume analysis dropped ${warnings.length} untrusted value(s) from ${provider.name}`);
  }

  return { parsed: grounded.value, warnings, model };
}

/**
 * A provider answered, but its output could not be trusted.
 *
 * 502 rather than 503: the upstream service is reachable and working, it just
 * gave an invalid answer. Retrying immediately will probably fail the same
 * way, which is the opposite of what a 503 tells a client.
 */
function untrustedOutput(reason) {
  return new ApiError(502, reason, ERROR_CODES.AI_OUTPUT_INVALID);
}

/**
 * Records a failed analysis on the document.
 *
 * Wrapped because this runs on an error path: if writing the failure also
 * fails, the original error is what the caller needs to see, and losing it to
 * a secondary database problem would hide the real cause.
 */
async function recordAnalysisFailure(resume, error) {
  try {
    const stillExists = await Resume.exists({ _id: resume._id, user: resume.user });
    if (!stillExists) return;

    resume.analysis = {
      status: PROCESSING_STATUS.FAILED,
      startedAt: resume.analysis?.startedAt ?? null,
      completedAt: new Date(),
      // Only our own ApiError messages are stored. They are written for
      // display; anything else may carry internals.
      error: error instanceof ApiError ? error.message.slice(0, 500) : 'Analysis failed unexpectedly.',
    };
    await resume.save();
  } catch (saveError) {
    logger.error(`Could not record analysis failure for resume ${resume._id}`, saveError);
  }
}
