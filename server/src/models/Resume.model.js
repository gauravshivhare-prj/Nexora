import mongoose from 'mongoose';

import {
  PARSED_SCHEMA_VERSION,
  PROCESSING_STATUS,
  PROCESSING_STATUS_VALUES,
  RESUME_LIMITS,
  RESUME_SOURCE_VALUES,
} from '../constants/resumePolicy.js';

/**
 * One resume belonging to a student, and whatever Nexora has managed to make
 * of it.
 *
 * A student may hold several: a resume is a document with a date, not a
 * property of a person, and comparing this year's against last year's is the
 * point. So the owner index is non-unique, unlike StudentProfile's.
 *
 * This document is the source of truth for *resume-derived* data. It does not
 * copy anything from StudentProfile and StudentProfile does not copy anything
 * from it. Where a student's own answer and their resume disagree, both are
 * kept and the disagreement stays visible — CareerTwin is the layer that
 * reconciles them, and it cannot do that if one has already overwritten the
 * other.
 */

const SUBDOCUMENT_OPTIONS = { _id: false };

/**
 * The state of one processing step.
 *
 * `error` holds a short reason written for the student. Provider messages are
 * logged but never stored here: they carry request ids, account details and
 * sometimes fragments of the prompt, which means fragments of the resume.
 */
const processingSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: PROCESSING_STATUS_VALUES,
      default: PROCESSING_STATUS.PENDING,
      required: true,
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    error: { type: String, default: null, maxlength: 500 },
  },
  SUBDOCUMENT_OPTIONS,
);

/**
 * Where a resume's text came from.
 *
 * Present but empty for pasted text. It exists now so that adding file upload
 * later is a new value in an existing field rather than a schema migration.
 */
const fileSchema = new mongoose.Schema(
  {
    originalName: { type: String, default: null, maxlength: RESUME_LIMITS.fileName },
    mimeType: { type: String, default: null, maxlength: 128 },
    sizeBytes: { type: Number, default: null, min: 0 },
    /**
     * Reference to the stored original, once there is somewhere to store one.
     * A key, never bytes: resumes do not belong in the document that indexes
     * them.
     */
    storageKey: { type: String, default: null, maxlength: 512 },
  },
  SUBDOCUMENT_OPTIONS,
);

/**
 * What the AI made of the resume.
 *
 * `strict: false` is NOT used. Every field here is one the schema validator
 * allow-lists, so a provider inventing a key cannot get it stored.
 *
 * Skills carry no proficiency. The document shows a student listed a skill,
 * not how good they are at it.
 */
const parsedSchema = new mongoose.Schema(
  {
    basics: {
      fullName: { type: String, default: null },
      email: { type: String, default: null },
      phone: { type: String, default: null },
      location: { type: String, default: null },
      links: { type: [String], default: [] },
    },

    education: {
      type: [
        new mongoose.Schema(
          {
            institution: { type: String, default: null },
            degree: { type: String, default: null },
            field: { type: String, default: null },
            startYear: { type: Number, default: null },
            endYear: { type: Number, default: null },
            grade: { type: String, default: null },
          },
          SUBDOCUMENT_OPTIONS,
        ),
      ],
      default: [],
    },

    skills: {
      type: [new mongoose.Schema({ name: { type: String, required: true } }, SUBDOCUMENT_OPTIONS)],
      default: [],
    },

    projects: {
      type: [
        new mongoose.Schema(
          {
            title: { type: String, default: null },
            description: { type: String, default: null },
            technologies: { type: [String], default: [] },
          },
          SUBDOCUMENT_OPTIONS,
        ),
      ],
      default: [],
    },

    experience: {
      type: [
        new mongoose.Schema(
          {
            organisation: { type: String, default: null },
            title: { type: String, default: null },
            startDate: { type: String, default: null },
            endDate: { type: String, default: null },
            description: { type: String, default: null },
          },
          SUBDOCUMENT_OPTIONS,
        ),
      ],
      default: [],
    },

    certifications: {
      type: [
        new mongoose.Schema(
          {
            name: { type: String, default: null },
            issuer: { type: String, default: null },
            issueYear: { type: Number, default: null },
          },
          SUBDOCUMENT_OPTIONS,
        ),
      ],
      default: [],
    },

    achievements: { type: [String], default: [] },
  },
  SUBDOCUMENT_OPTIONS,
);

const resumeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // Non-unique, and indexed because every read is "my resumes" — the
      // only query shape this collection has.
      index: true,
      immutable: true,
    },

    /** The student's own name for this version: "Internship 2026", "Backend CV". */
    label: { type: String, trim: true, maxlength: RESUME_LIMITS.label, default: null },

    source: { type: String, enum: RESUME_SOURCE_VALUES, required: true, immutable: true },

    file: { type: fileSchema, default: () => ({}) },

    /**
     * The text everything else is derived from, and what grounding checks the
     * AI's output against. Kept verbatim rather than only in parsed form: a
     * re-analysis under a better prompt or a different provider must not
     * require the student to paste their resume again.
     */
    extractedText: { type: String, required: true, maxlength: RESUME_LIMITS.text.max },

    /**
     * Length of `extractedText`, stored rather than measured.
     *
     * The list endpoint projects the text away — ten resumes must not mean
     * ten full documents on the wire to render ten rows — and a summary
     * cannot measure a field it did not load. Kept in sync by the hook below
     * rather than by whoever remembers to set it.
     */
    textLength: { type: Number, default: 0, min: 0 },

    /** File → text. Already complete for pasted text; real work once files land. */
    extraction: { type: processingSchema, default: () => ({}) },

    /** Text → structured data, via an AI provider. */
    analysis: { type: processingSchema, default: () => ({}) },

    /**
     * Which provider and model produced the current parsed data.
     *
     * Recorded so an output can always be traced to what made it — without
     * this, a change in provider quality is invisible after the fact.
     */
    analysedBy: {
      provider: { type: String, default: null },
      model: { type: String, default: null },
      schemaVersion: { type: Number, default: null },
    },

    parsed: { type: parsedSchema, default: null },

    /**
     * What validation had to drop, in the student's words.
     *
     * Kept rather than discarded because it is the honest record of how far
     * the AI's answer could be trusted, and because a student is entitled to
     * know that something was removed from their own document's reading.
     */
    warnings: { type: [String], default: [] },
  },
  { timestamps: true },
);

resumeSchema.index({ user: 1, createdAt: -1 });
resumeSchema.index({ user: 1, 'analysis.status': 1, createdAt: -1 });

/**
 * Keeps the denormalised length honest.
 *
 * On the schema rather than in the service so it holds for every writer,
 * including one added later that forgets this field exists.
 */
resumeSchema.pre('validate', function syncTextLength() {
  if (this.isModified('extractedText')) {
    this.textLength = this.extractedText?.length ?? 0;
  }
});

/**
 * Summary shape, for the list endpoint.
 *
 * Deliberately omits `extractedText` and `parsed`: a list of ten resumes
 * would otherwise transfer the full text of all ten to render ten rows.
 */
export function toResumeSummary(resume) {
  return {
    id: resume._id.toString(),
    label: resume.label ?? null,
    source: resume.source,
    file: {
      originalName: resume.file?.originalName ?? null,
      sizeBytes: resume.file?.sizeBytes ?? null,
    },
    textLength: resume.textLength ?? 0,
    extraction: toProcessing(resume.extraction),
    analysis: toProcessing(resume.analysis),
    hasParsedData: Boolean(resume.parsed),
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  };
}

/**
 * Full shape, for reading one resume.
 *
 * An allow-list like toPublicUser and toPublicProfile. The owning user id is
 * not included: the caller already knows who they are, and echoing it invites
 * a client to start passing it back as ownership.
 */
export function toPublicResume(resume) {
  return {
    ...toResumeSummary(resume),
    extractedText: resume.extractedText,
    analysedBy: resume.parsed
      ? {
          provider: resume.analysedBy?.provider ?? null,
          model: resume.analysedBy?.model ?? null,
          schemaVersion: resume.analysedBy?.schemaVersion ?? null,
        }
      : null,
    parsed: resume.parsed ? toParsed(resume.parsed) : null,
    warnings: resume.warnings ?? [],
  };
}

function toProcessing(step) {
  return {
    status: step?.status ?? PROCESSING_STATUS.PENDING,
    startedAt: step?.startedAt ?? null,
    completedAt: step?.completedAt ?? null,
    error: step?.error ?? null,
  };
}

/** Strips Mongoose internals from the parsed subdocument. */
function toParsed(parsed) {
  return {
    basics: {
      fullName: parsed.basics?.fullName ?? null,
      email: parsed.basics?.email ?? null,
      phone: parsed.basics?.phone ?? null,
      location: parsed.basics?.location ?? null,
      links: parsed.basics?.links ?? [],
    },
    education: (parsed.education ?? []).map((entry) => ({
      institution: entry.institution ?? null,
      degree: entry.degree ?? null,
      field: entry.field ?? null,
      startYear: entry.startYear ?? null,
      endYear: entry.endYear ?? null,
      grade: entry.grade ?? null,
    })),
    skills: (parsed.skills ?? []).map((skill) => ({ name: skill.name })),
    projects: (parsed.projects ?? []).map((entry) => ({
      title: entry.title ?? null,
      description: entry.description ?? null,
      technologies: entry.technologies ?? [],
    })),
    experience: (parsed.experience ?? []).map((entry) => ({
      organisation: entry.organisation ?? null,
      title: entry.title ?? null,
      startDate: entry.startDate ?? null,
      endDate: entry.endDate ?? null,
      description: entry.description ?? null,
    })),
    certifications: (parsed.certifications ?? []).map((entry) => ({
      name: entry.name ?? null,
      issuer: entry.issuer ?? null,
      issueYear: entry.issueYear ?? null,
    })),
    achievements: parsed.achievements ?? [],
    schemaVersion: PARSED_SCHEMA_VERSION,
  };
}

export const Resume = mongoose.models.Resume ?? mongoose.model('Resume', resumeSchema);
