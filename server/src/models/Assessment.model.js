import mongoose from 'mongoose';

import {
  ASSESSMENT_GROUP_VALUES,
  DIFFICULTY_LEVEL_VALUES,
  QUESTION_TYPE_VALUES,
} from '../domain/assessment/assessmentContract.js';
import { canonicalSkill } from '../domain/skills/skillKey.js';
import { ASSESSMENT_LIMITS } from '../constants/assessmentPolicy.js';

const SUBDOCUMENT_OPTIONS = { _id: false };

const optionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      minlength: ASSESSMENT_LIMITS.optionId.min,
      maxlength: ASSESSMENT_LIMITS.optionId.max,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      minlength: ASSESSMENT_LIMITS.optionText.min,
      maxlength: ASSESSMENT_LIMITS.optionText.max,
    },
  },
  SUBDOCUMENT_OPTIONS,
);

const questionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    type: {
      type: String,
      required: true,
      enum: QUESTION_TYPE_VALUES,
    },
    prompt: {
      type: String,
      required: true,
      trim: true,
      minlength: ASSESSMENT_LIMITS.prompt.min,
      maxlength: ASSESSMENT_LIMITS.prompt.max,
    },
    weight: {
      type: Number,
      required: true,
      default: 1,
      min: 0.1,
      max: 100,
    },
    codeSnippet: {
      type: String,
      default: null,
      maxlength: ASSESSMENT_LIMITS.codeSnippet.max,
    },
    explanation: {
      type: String,
      default: null,
      maxlength: ASSESSMENT_LIMITS.explanation.max,
    },
    options: {
      type: [optionSchema],
      default: undefined,
      validate: {
        validator(opts) {
          if (!opts) return true;
          return (
            opts.length >= ASSESSMENT_LIMITS.options.minItems &&
            opts.length <= ASSESSMENT_LIMITS.options.maxItems
          );
        },
        message: `Options must contain between ${ASSESSMENT_LIMITS.options.minItems} and ${ASSESSMENT_LIMITS.options.maxItems} items.`,
      },
    },
    expectedAnswer: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  SUBDOCUMENT_OPTIONS,
);

const assessmentSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: ASSESSMENT_LIMITS.id.min,
      maxlength: ASSESSMENT_LIMITS.id.max,
      match: [/^[a-z0-9_-]+$/i, 'Assessment ID must be an alphanumeric slug with hyphens or underscores.'],
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    skillKey: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(val) {
          return Boolean(canonicalSkill(val));
        },
        message: (props) => `Unknown canonical skill: "${props.value}". Must belong to Nexora taxonomy.`,
      },
    },
    skillName: {
      type: String,
      default() {
        return canonicalSkill(this.skillKey)?.name ?? this.skillKey;
      },
      trim: true,
    },
    secondarySkillKeys: {
      type: [String],
      default: [],
      validate: {
        validator(keys) {
          if (!Array.isArray(keys)) return false;
          return keys.every((k) => Boolean(canonicalSkill(k)));
        },
        message: 'All secondarySkillKeys must belong to Nexora canonical taxonomy.',
      },
    },
    difficulty: {
      type: String,
      required: true,
      enum: DIFFICULTY_LEVEL_VALUES,
    },
    group: {
      type: String,
      enum: [...ASSESSMENT_GROUP_VALUES, null],
      default: null,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: ASSESSMENT_LIMITS.title.min,
      maxlength: ASSESSMENT_LIMITS.title.max,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: ASSESSMENT_LIMITS.description.min,
      maxlength: ASSESSMENT_LIMITS.description.max,
    },
    passMark: {
      type: Number,
      required: true,
      default: 0.7,
      min: ASSESSMENT_LIMITS.passMark.min,
      max: ASSESSMENT_LIMITS.passMark.max,
    },
    timeLimitMinutes: {
      type: Number,
      default: null,
      validate: {
        validator(val) {
          if (val === null || val === undefined) return true;
          return (
            Number.isInteger(val) &&
            val >= ASSESSMENT_LIMITS.timeLimitMinutes.min &&
            val <= ASSESSMENT_LIMITS.timeLimitMinutes.max
          );
        },
        message: `timeLimitMinutes must be an integer between ${ASSESSMENT_LIMITS.timeLimitMinutes.min} and ${ASSESSMENT_LIMITS.timeLimitMinutes.max}.`,
      },
    },
    questions: {
      type: [questionSchema],
      required: true,
      validate: {
        validator(qs) {
          if (!Array.isArray(qs)) return false;
          return (
            qs.length >= ASSESSMENT_LIMITS.questions.minItems &&
            qs.length <= ASSESSMENT_LIMITS.questions.maxItems
          );
        },
        message: `Assessment must contain between ${ASSESSMENT_LIMITS.questions.minItems} and ${ASSESSMENT_LIMITS.questions.maxItems} questions.`,
      },
    },
    isPractice: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

// Indexes
assessmentSchema.index({ skillKey: 1, difficulty: 1, isActive: 1 });
assessmentSchema.index({ isActive: 1, title: 1 });
assessmentSchema.index({ isActive: 1, skillKey: 1, difficulty: 1 });
assessmentSchema.index({ group: 1, isActive: 1 });

/**
 * Strips answers and explanations before exposing assessment to students.
 */
export function toPublicAssessment(doc) {
  if (!doc) return null;
  const raw = doc.toObject ? doc.toObject() : doc;
  const id = raw.assessmentId ?? raw.id;

  return {
    id,
    assessmentId: id,
    slug: id,
    version: raw.version,
    skillKey: raw.skillKey,
    skillName: raw.skillName,
    canonicalSkill: raw.skillName ?? raw.skillKey,
    secondarySkillKeys: raw.secondarySkillKeys ?? [],
    difficulty: raw.difficulty,
    group: raw.group ?? null,
    isPractice: raw.isPractice === true,
    isAvailable: raw.isActive !== false,
    title: raw.title,
    description: raw.description,
    passMark: raw.passMark,
    timeLimitMinutes: raw.timeLimitMinutes,
    durationMinutes: raw.timeLimitMinutes ?? 0,
    totalQuestions: raw.questions?.length ?? 0,
    questions: (raw.questions ?? []).map((q) => {
      const pub = {
        id: q.id,
        questionId: q.id,
        type: q.type,
        prompt: q.prompt,
        weight: q.weight,
        codeSnippet: q.codeSnippet,
      };
      if (q.options) {
        pub.options = q.options.map((opt) => ({
          id: opt.id,
          text: opt.text,
        }));
      }
      return pub;
    }),
  };
}

/**
 * Complete assessment view including expected answers (for internal/admin/test use).
 */
export function toAdminAssessment(doc) {
  if (!doc) return null;
  const raw = doc.toObject ? doc.toObject() : doc;

  return {
    id: raw.assessmentId ?? raw.id,
    version: raw.version,
    skillKey: raw.skillKey,
    skillName: raw.skillName,
    secondarySkillKeys: raw.secondarySkillKeys ?? [],
    difficulty: raw.difficulty,
    group: raw.group ?? null,
    isPractice: raw.isPractice === true,
    title: raw.title,
    description: raw.description,
    passMark: raw.passMark,
    timeLimitMinutes: raw.timeLimitMinutes,
    isActive: raw.isActive,
    questions: raw.questions,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export const Assessment =
  mongoose.models.Assessment ?? mongoose.model('Assessment', assessmentSchema);
