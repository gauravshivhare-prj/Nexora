import mongoose from 'mongoose';

import {
  CGPA_LIMITS,
  GENDER_VALUES,
  PROFILE_LIMITS,
  SEMESTER_LIMITS,
  SKILL_LEVEL_VALUES,
} from '../constants/profilePolicy.js';

/**
 * Everything a student tells Nexora about themselves.
 *
 * A separate document from User, not extra fields on it, for two reasons.
 * First, blast radius: an authentication change can never put profile data at
 * risk, and a profile migration can never lock anyone out. Second, read cost —
 * every authenticated request loads a User, and none of them need a hundred
 * skills and thirty projects to check who is calling.
 *
 * This document is the source of truth for *student-entered* data only. Data
 * derived from a resume lives on the Resume document, and data derived from
 * either lives on CareerTwin. Nothing is copied between them.
 */

/** Schema options shared by every subdocument: no separate _id, no __v noise. */
const SUBDOCUMENT_OPTIONS = { _id: false };

/**
 * A claimed skill.
 *
 * `level` is self-reported and carries no evidential weight on its own. The
 * Skill Gap phase treats these as CLAIMED and looks to projects, assessments
 * and interviews for anything stronger.
 */
const skillSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: PROFILE_LIMITS.skills.name,
    },
    level: {
      type: String,
      required: true,
      enum: SKILL_LEVEL_VALUES,
    },
  },
  SUBDOCUMENT_OPTIONS,
);

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: PROFILE_LIMITS.projects.title },
    description: { type: String, trim: true, maxlength: PROFILE_LIMITS.projects.description },
    technologies: {
      type: [String],
      default: [],
      validate: {
        validator: (list) => list.length <= PROFILE_LIMITS.projects.technologies.maxItems,
        message: `A project may list at most ${PROFILE_LIMITS.projects.technologies.maxItems} technologies`,
      },
    },
    projectUrl: { type: String, trim: true, maxlength: PROFILE_LIMITS.url },
    githubUrl: { type: String, trim: true, maxlength: PROFILE_LIMITS.url },
  },
  SUBDOCUMENT_OPTIONS,
);

const certificationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: PROFILE_LIMITS.certifications.name,
    },
    issuer: { type: String, trim: true, maxlength: PROFILE_LIMITS.certifications.issuer },
    issueDate: { type: Date },
    credentialUrl: { type: String, trim: true, maxlength: PROFILE_LIMITS.url },
  },
  SUBDOCUMENT_OPTIONS,
);

const studentProfileSchema = new mongoose.Schema(
  {
    /**
     * Owner. The unique index is what actually enforces "at most one profile
     * per user" — an application-level findOne() check would still let two
     * concurrent first-time saves both create one.
     */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      immutable: true,
    },

    personal: {
      phone: { type: String, trim: true, maxlength: PROFILE_LIMITS.phone },
      dateOfBirth: { type: Date },
      gender: { type: String, enum: [...GENDER_VALUES, null] },
      city: { type: String, trim: true, maxlength: PROFILE_LIMITS.city },
      state: { type: String, trim: true, maxlength: PROFILE_LIMITS.state },
    },

    academic: {
      collegeName: { type: String, trim: true, maxlength: PROFILE_LIMITS.collegeName },
      degree: { type: String, trim: true, maxlength: PROFILE_LIMITS.degree },
      branch: { type: String, trim: true, maxlength: PROFILE_LIMITS.branch },
      currentSemester: { type: Number, min: SEMESTER_LIMITS.min, max: SEMESTER_LIMITS.max },
      graduationYear: { type: Number },
      cgpa: { type: Number, min: CGPA_LIMITS.min, max: CGPA_LIMITS.max },
    },

    career: {
      targetRole: { type: String, trim: true, maxlength: PROFILE_LIMITS.targetRole },
      preferredLocation: { type: String, trim: true, maxlength: PROFILE_LIMITS.preferredLocation },
      careerInterests: { type: [String], default: [] },
      bio: { type: String, trim: true, maxlength: PROFILE_LIMITS.bio },
    },

    skills: { type: [skillSchema], default: [] },
    projects: { type: [projectSchema], default: [] },
    certifications: { type: [certificationSchema], default: [] },
  },
  { timestamps: true },
);

/**
 * The public shape of a profile.
 *
 * An allow-list, like toPublicUser: a field added to the schema later stays
 * invisible to clients until someone deliberately exposes it here. The owning
 * user id is deliberately *not* included — the caller already knows who they
 * are, and echoing it invites a client to start passing it back as ownership.
 *
 * Dates are emitted as YYYY-MM-DD rather than full timestamps because that is
 * what they are: calendar facts, and what an <input type="date"> expects.
 */
export function toPublicProfile(profile) {
  return {
    personal: {
      phone: profile.personal?.phone ?? null,
      dateOfBirth: toCalendarDate(profile.personal?.dateOfBirth),
      gender: profile.personal?.gender ?? null,
      city: profile.personal?.city ?? null,
      state: profile.personal?.state ?? null,
    },
    academic: {
      collegeName: profile.academic?.collegeName ?? null,
      degree: profile.academic?.degree ?? null,
      branch: profile.academic?.branch ?? null,
      currentSemester: profile.academic?.currentSemester ?? null,
      graduationYear: profile.academic?.graduationYear ?? null,
      cgpa: profile.academic?.cgpa ?? null,
    },
    career: {
      targetRole: profile.career?.targetRole ?? null,
      preferredLocation: profile.career?.preferredLocation ?? null,
      careerInterests: profile.career?.careerInterests ?? [],
      bio: profile.career?.bio ?? null,
    },
    skills: (profile.skills ?? []).map((skill) => ({ name: skill.name, level: skill.level })),
    projects: (profile.projects ?? []).map((project) => ({
      title: project.title,
      description: project.description ?? null,
      technologies: project.technologies ?? [],
      projectUrl: project.projectUrl ?? null,
      githubUrl: project.githubUrl ?? null,
    })),
    certifications: (profile.certifications ?? []).map((certification) => ({
      name: certification.name,
      issuer: certification.issuer ?? null,
      issueDate: toCalendarDate(certification.issueDate),
      credentialUrl: certification.credentialUrl ?? null,
    })),
    updatedAt: profile.updatedAt ?? null,
  };
}

/**
 * The shape returned before a student has saved anything.
 *
 * A profile that does not exist yet is an empty profile, not an error: the
 * GET endpoint answers 200 with this rather than 404, so the page renders its
 * empty state instead of an error state. Built from the same function as a
 * real profile so the two can never drift apart.
 */
export function emptyProfile() {
  return toPublicProfile({});
}

/** Date → "YYYY-MM-DD", or null. */
function toCalendarDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : null;
}

export const StudentProfile =
  mongoose.models.StudentProfile ?? mongoose.model('StudentProfile', studentProfileSchema);
