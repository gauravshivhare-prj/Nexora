import mongoose from 'mongoose';

import {
  ATTEMPT_STATUS,
  ATTEMPT_STATUS_VALUES,
  CHECK_OUTCOMES,
  DIFFICULTY_LEVEL_VALUES,
} from '../domain/assessment/assessmentContract.js';

const SUBDOCUMENT_OPTIONS = { _id: false };

const questionResultSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    prompt: { type: String, required: true },
    weight: { type: Number, required: true },
    studentAnswer: { type: mongoose.Schema.Types.Mixed, default: null },
    isCorrect: { type: Boolean, required: true },
    ratio: { type: Number, required: true, min: 0, max: 1 },
    earnedPoints: { type: Number, required: true, min: 0 },
    maxPoints: { type: Number, required: true, min: 0 },
    explanation: { type: String, default: null },
  },
  SUBDOCUMENT_OPTIONS,
);

const assessmentAttemptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
      index: true,
    },
    assessmentId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    skillKey: {
      type: String,
      required: true,
      trim: true,
    },
    skillName: {
      type: String,
      required: true,
      trim: true,
    },
    difficulty: {
      type: String,
      required: true,
      enum: DIFFICULTY_LEVEL_VALUES,
    },
    status: {
      type: String,
      required: true,
      enum: ATTEMPT_STATUS_VALUES,
      default: ATTEMPT_STATUS.IN_PROGRESS,
      index: true,
    },
    score: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
      validate: {
        validator(val) {
          if (val === null || val === undefined) return true;
          return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 1;
        },
        message: 'Score must be a finite number between 0 and 1.',
      },
    },
    passMark: {
      type: Number,
      required: true,
      min: 0.01,
      max: 1,
    },
    passed: {
      type: Boolean,
      default: null,
    },
    outcome: {
      type: String,
      enum: [CHECK_OUTCOMES.PASS, CHECK_OUTCOMES.FAIL, null],
      default: null,
    },
    earnedPoints: {
      type: Number,
      min: 0,
      default: null,
    },
    maxPoints: {
      type: Number,
      min: 0,
      default: null,
    },
    totalQuestions: {
      type: Number,
      default: 0,
      min: 0,
    },
    correctQuestionsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    answers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    questionResults: {
      type: [questionResultSchema],
      default: [],
    },
    evidenceCheck: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SkillEvidenceCheck',
      default: null,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationSeconds: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  { timestamps: true },
);

// Unique attempt compound index
assessmentAttemptSchema.index(
  { user: 1, assessmentId: 1, attemptNumber: 1 },
  { unique: true },
);

// Lookup index for user attempts
assessmentAttemptSchema.index({ user: 1, assessmentId: 1, createdAt: -1 });
assessmentAttemptSchema.index({ user: 1, createdAt: -1 });
assessmentAttemptSchema.index({ user: 1, assessmentId: 1, status: 1, attemptNumber: -1 });

export function toPublicAssessmentAttempt(doc) {
  if (!doc) return null;
  const raw = doc.toObject ? doc.toObject() : doc;

  const questionBreakdown = (raw.questionResults ?? []).map((qr) => ({
    questionId: qr.questionId,
    prompt: qr.prompt,
    weight: qr.weight,
    studentAnswer: qr.studentAnswer,
    isCorrect: qr.isCorrect,
    ratio: qr.ratio,
    earnedPoints: qr.earnedPoints,
    maxPoints: qr.maxPoints,
  }));

  const hasResult =
    raw.status === ATTEMPT_STATUS.EVALUATED || raw.status === ATTEMPT_STATUS.TIMED_OUT;

  const result = hasResult
    ? {
        assessmentId: raw.assessmentId,
        canonicalSkill: raw.skillName || raw.skillKey,
        difficulty: raw.difficulty,
        score: raw.score,
        earnedPoints: raw.earnedPoints,
        maxPoints: raw.maxPoints,
        passMark: raw.passMark,
        passed: raw.passed,
        outcome: raw.outcome,
        evidenceStatus: raw.evidenceCheck
          ? 'verified'
          : raw.passed
            ? 'supported'
            : 'unsupported',
        completedAt: raw.completedAt,
        questionBreakdown,
      }
    : null;

  return {
    id: String(raw._id ?? raw.id),
    attemptId: String(raw._id ?? raw.id),
    assessmentId: raw.assessmentId,
    attemptNumber: raw.attemptNumber,
    version: raw.version,
    skillKey: raw.skillKey,
    skillName: raw.skillName,
    difficulty: raw.difficulty,
    status: raw.status,
    score: raw.score,
    passMark: raw.passMark,
    passed: raw.passed,
    outcome: raw.outcome,
    earnedPoints: raw.earnedPoints,
    maxPoints: raw.maxPoints,
    totalQuestions: raw.totalQuestions,
    correctQuestionsCount: raw.correctQuestionsCount,
    questionResults: questionBreakdown,
    result,
    evidenceCheckId: raw.evidenceCheck ? String(raw.evidenceCheck) : null,
    startedAt: raw.startedAt,
    completedAt: raw.completedAt,
    durationSeconds: raw.durationSeconds,
  };
}

export const AssessmentAttempt =
  mongoose.models.AssessmentAttempt ??
  mongoose.model('AssessmentAttempt', assessmentAttemptSchema);
