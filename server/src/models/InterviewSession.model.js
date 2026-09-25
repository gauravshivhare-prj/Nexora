import mongoose from 'mongoose';

import {
  EVALUATOR_TYPES,
  EVALUATOR_TYPE_VALUES,
  INTERVIEW_CONTRACT_VERSION,
  INTERVIEW_DIFFICULTY,
  INTERVIEW_DIFFICULTY_VALUES,
  INTERVIEW_LIMITS,
  INTERVIEW_QUESTION_TYPE_VALUES,
  SESSION_STATUS,
  SESSION_STATUS_VALUES,
  canTransitionSession,
} from '../domain/interview/interviewContract.js';
import { canonicalSkill } from '../domain/skills/skillKey.js';

/**
 * Subdocument options disabling synthetic _id for nested value objects.
 */
const SUBDOCUMENT_OPTIONS = { _id: false };

/**
 * Student's recorded answer to a specific interview question.
 */
const answerSchema = new mongoose.Schema(
  {
    answerText: {
      type: String,
      maxlength: [INTERVIEW_LIMITS.studentAnswer.max, 'Answer exceeds maximum character limit'],
      trim: true,
      default: null,
    },
    submittedAt: { type: Date, default: null },
    durationSeconds: {
      type: Number,
      min: [0, 'Duration cannot be negative'],
      max: [INTERVIEW_LIMITS.maxTimePerQuestionSeconds, 'Duration exceeds question time limit'],
      default: null,
    },
    attemptNumber: {
      type: Number,
      min: [1, 'Attempt number must be at least 1'],
      max: [3, 'Exceeded maximum question attempts'],
      default: 1,
    },
  },
  SUBDOCUMENT_OPTIONS,
);

/**
 * Validated evaluation of a single interview question.
 */
const evaluationSchema = new mongoose.Schema(
  {
    dimensions: {
      accuracy: { type: Number, min: 0, max: 1, default: null },
      depth: { type: Number, min: 0, max: 1, default: null },
      clarity: { type: Number, min: 0, max: 1, default: null },
      relevance: { type: Number, min: 0, max: 1, default: null },
    },
    compositeScore: { type: Number, min: 0, max: 1, default: null },
    feedback: {
      type: String,
      maxlength: [INTERVIEW_LIMITS.feedbackSummary.max, 'Feedback exceeds maximum character limit'],
      default: null,
    },
    strengths: { type: [String], default: [] },
    growthAreas: { type: [String], default: [] },
    groundedSkills: { type: [String], default: [] },
    evaluatedAt: { type: Date, default: null },
  },
  SUBDOCUMENT_OPTIONS,
);

/**
 * One question within an interview session.
 */
const questionSchema = new mongoose.Schema(
  {
    questionId: {
      type: String,
      required: [true, 'Question ID is required'],
      trim: true,
    },
    order: {
      type: Number,
      required: [true, 'Question order is required'],
      min: [1, 'Question order must start at 1'],
    },
    type: {
      type: String,
      enum: {
        values: INTERVIEW_QUESTION_TYPE_VALUES,
        message: 'Question type must be one of: ' + INTERVIEW_QUESTION_TYPE_VALUES.join(', '),
      },
      required: [true, 'Question type is required'],
    },
    prompt: {
      type: String,
      required: [true, 'Question prompt is required'],
      minlength: [INTERVIEW_LIMITS.questionPrompt.min, 'Question prompt is too short'],
      maxlength: [INTERVIEW_LIMITS.questionPrompt.max, 'Question prompt is too long'],
      trim: true,
    },
    targetSkill: {
      type: String,
      required: [true, 'Question target skill is required'],
      validate: {
        validator: (val) => Boolean(canonicalSkill(val)),
        message: 'Question target skill must be a recognized canonical skill',
      },
    },
    difficulty: {
      type: String,
      enum: {
        values: INTERVIEW_DIFFICULTY_VALUES,
        message: 'Difficulty must be one of: ' + INTERVIEW_DIFFICULTY_VALUES.join(', '),
      },
      default: INTERVIEW_DIFFICULTY.INTERMEDIATE,
    },
    rubricCriteria: {
      type: [String],
      default: [],
    },
    answer: {
      type: answerSchema,
      default: null,
    },
    evaluation: {
      type: evaluationSchema,
      default: null,
    },
  },
  SUBDOCUMENT_OPTIONS,
);

/**
 * Provider audit metrics envelope.
 *
 * Strictly captures model name, token metrics, and latency for auditability.
 * NEVER stores API keys, access tokens, or raw credentials.
 */
const providerAuditSchema = new mongoose.Schema(
  {
    provider: { type: String, default: null, maxlength: 64 },
    model: { type: String, default: null, maxlength: 64 },
    promptTokens: { type: Number, default: null, min: 0 },
    completionTokens: { type: Number, default: null, min: 0 },
    latencyMs: { type: Number, default: null, min: 0 },
    contractVersion: { type: Number, default: INTERVIEW_CONTRACT_VERSION },
  },
  SUBDOCUMENT_OPTIONS,
);

/**
 * Mongoose Schema for AI Interview Session.
 *
 * Enforces ownership, strict lifecycle state transitions, canonical skill targeting,
 * bounded attempt limits, and safe provider auditing.
 */
const interviewSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner user id is required'],
      immutable: true,
      index: true,
    },

    status: {
      type: String,
      enum: {
        values: SESSION_STATUS_VALUES,
        message: 'Status must be one of: ' + SESSION_STATUS_VALUES.join(', '),
      },
      default: SESSION_STATUS.INITIALIZED,
      required: true,
      index: true,
    },

    targetRole: {
      type: String,
      required: [true, 'Target role is required'],
      trim: true,
      maxlength: [100, 'Target role is too long'],
    },

    targetSkills: {
      type: [{ type: String, trim: true }],
      validate: [
        {
          validator: function (skills) {
            return (
              Array.isArray(skills) &&
              skills.length >= 1 &&
              skills.length <= INTERVIEW_LIMITS.maxTargetSkills
            );
          },
          message: `Target skills must contain between 1 and ${INTERVIEW_LIMITS.maxTargetSkills} skills`,
        },
        {
          validator: function (skills) {
            if (!Array.isArray(skills)) return false;
            return skills.every((s) => Boolean(canonicalSkill(s)));
          },
          message: 'All target skills must be recognizable canonical skills',
        },
      ],
      required: [true, 'Target skills are required'],
    },

    difficulty: {
      type: String,
      enum: {
        values: INTERVIEW_DIFFICULTY_VALUES,
        message: 'Difficulty must be one of: ' + INTERVIEW_DIFFICULTY_VALUES.join(', '),
      },
      default: INTERVIEW_DIFFICULTY.INTERMEDIATE,
      required: true,
    },

    questionCount: {
      type: Number,
      min: [INTERVIEW_LIMITS.minQuestions, `Question count cannot be less than ${INTERVIEW_LIMITS.minQuestions}`],
      max: [INTERVIEW_LIMITS.maxQuestions, `Question count cannot exceed ${INTERVIEW_LIMITS.maxQuestions}`],
      default: 5,
      required: true,
    },

    currentQuestionIndex: {
      type: Number,
      min: [0, 'Current question index cannot be negative'],
      default: 0,
      required: true,
    },

    timeLimitMinutes: {
      type: Number,
      min: [1, 'Time limit must be at least 1 minute'],
      max: [INTERVIEW_LIMITS.maxSessionMinutes, `Time limit cannot exceed ${INTERVIEW_LIMITS.maxSessionMinutes} minutes`],
      default: 30,
      required: true,
    },

    attemptLimitPerQuestion: {
      type: Number,
      min: [1, 'Attempt limit per question must be at least 1'],
      max: [3, 'Attempt limit per question cannot exceed 3'],
      default: 1,
      required: true,
    },

    maxAttemptsTotal: {
      type: Number,
      min: [1, 'Max total attempts must be at least 1'],
      max: [30, 'Max total attempts cannot exceed 30'],
      default: 10,
      required: true,
    },

    attemptCount: {
      type: Number,
      min: [0, 'Attempt count cannot be negative'],
      default: 0,
      required: true,
    },

    questions: {
      type: [questionSchema],
      default: [],
      validate: [
        {
          validator: function (questions) {
            return (
              !Array.isArray(questions) ||
              questions.length <= this.questionCount
            );
          },
          message: 'Number of questions cannot exceed questionCount',
        },
      ],
    },

    overallScore: {
      type: Number,
      min: [0, 'Overall score cannot be negative'],
      max: [1, 'Overall score cannot exceed 1'],
      default: null,
    },

    evaluatorType: {
      type: String,
      enum: {
        values: EVALUATOR_TYPE_VALUES,
        message: 'Evaluator type must be one of: ' + EVALUATOR_TYPE_VALUES.join(', '),
      },
      default: EVALUATOR_TYPES.AI,
      required: true,
    },

    evidenceCheck: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SkillEvidenceCheck',
      default: null,
    },

    providerMetadata: {
      type: providerAuditSchema,
      default: null,
    },

    contractVersion: {
      type: Number,
      default: INTERVIEW_CONTRACT_VERSION,
      immutable: true,
      required: true,
    },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.user;
        return ret;
      },
    },
  },
);

/**
 * Compound indexes for fast ownership lookup and lifecycle queries.
 */
interviewSessionSchema.index({ user: 1, createdAt: -1 });
interviewSessionSchema.index({ user: 1, status: 1 });
interviewSessionSchema.index({ status: 1, expiresAt: 1 });

/**
 * Track previous status to enforce deterministic lifecycle transitions.
 */
interviewSessionSchema.post('init', function trackOriginalStatus() {
  this._originalStatus = this.status;
});

/**
 * Pre-validation lifecycle state transition and timestamp management.
 */
interviewSessionSchema.pre('validate', function validateSessionState() {
  // Enforce session expiration defaults if not set
  if (this.isNew && !this.expiresAt) {
    const minutes = Math.min(
      INTERVIEW_LIMITS.maxSessionMinutes,
      Math.max(1, Number(this.timeLimitMinutes) || 30),
    );
    const sessionDurationMs = minutes * 60 * 1000;
    this.expiresAt = new Date(Date.now() + sessionDurationMs);
  }

  // Prevent attemptCount from exceeding maxAttemptsTotal
  if (this.attemptCount > this.maxAttemptsTotal) {
    throw new Error(
      `Attempt count (${this.attemptCount}) exceeds maximum allowed attempts (${this.maxAttemptsTotal}).`,
    );
  }

  // Validate state transitions on status modification
  if (!this.isNew && this.isModified('status')) {
    const fromStatus = this._originalStatus || SESSION_STATUS.INITIALIZED;
    const toStatus = this.status;
    if (fromStatus !== toStatus && !canTransitionSession(fromStatus, toStatus)) {
      throw new Error(
        `Invalid session lifecycle transition from "${fromStatus}" to "${toStatus}".`,
      );
    }
  }

  // Auto-set lifecycle timestamps
  if (this.status === SESSION_STATUS.IN_PROGRESS && !this.startedAt) {
    this.startedAt = new Date();
  }

  const isTerminal = [
    SESSION_STATUS.COMPLETED,
    SESSION_STATUS.TIMED_OUT,
    SESSION_STATUS.ABANDONED,
    SESSION_STATUS.FAILED,
  ].includes(this.status);

  if (isTerminal && !this.completedAt) {
    this.completedAt = new Date();
  }
});

interviewSessionSchema.post('save', function updateOriginalStatus() {
  this._originalStatus = this.status;
});

/**
 * Check if the session has expired past its allocated time limit.
 *
 * @returns {boolean}
 */
interviewSessionSchema.methods.isExpired = function isExpired() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

/**
 * Check if the session has exhausted its total allocated attempt limit.
 *
 * @returns {boolean}
 */
interviewSessionSchema.methods.hasReachedAttemptLimit = function hasReachedAttemptLimit() {
  return this.attemptCount >= this.maxAttemptsTotal;
};

/**
 * Formats an interview session into a safe public DTO.
 *
 * Guarantees that internal database IDs, Mongoose version keys, and the owner's
 * user ID are never exposed to the client.
 *
 * @param {object} session
 * @returns {object} Public session DTO
 */
export function toPublicInterviewSession(session) {
  if (!session) return null;

  return {
    id: String(session._id ?? session.id),
    status: session.status,
    targetRole: session.targetRole,
    targetSkills: Array.isArray(session.targetSkills) ? [...session.targetSkills] : [],
    difficulty: session.difficulty,
    questionCount: session.questionCount,
    timeLimitMinutes: session.timeLimitMinutes ?? 30,
    currentQuestionIndex: session.currentQuestionIndex,
    attemptCount: session.attemptCount,
    maxAttemptsTotal: session.maxAttemptsTotal,
    attemptLimitPerQuestion: session.attemptLimitPerQuestion,
    questions: (session.questions ?? []).map((q) => ({
      questionId: q.questionId,
      order: q.order,
      type: q.type,
      prompt: q.prompt,
      targetSkill: q.targetSkill,
      difficulty: q.difficulty,
      rubricCriteria: q.rubricCriteria ?? [],
      answer: q.answer
        ? {
            answerText: q.answer.answerText,
            submittedAt: q.answer.submittedAt,
            durationSeconds: q.answer.durationSeconds,
            attemptNumber: q.answer.attemptNumber,
          }
        : null,
      evaluation: q.evaluation
        ? {
            dimensions: q.evaluation.dimensions ? { ...q.evaluation.dimensions } : null,
            compositeScore: q.evaluation.compositeScore,
            feedback: q.evaluation.feedback,
            strengths: q.evaluation.strengths ?? [],
            growthAreas: q.evaluation.growthAreas ?? [],
            groundedSkills: q.evaluation.groundedSkills ?? [],
            evaluatedAt: q.evaluation.evaluatedAt,
          }
        : null,
    })),
    overallScore: session.overallScore ?? null,
    evaluatorType: session.evaluatorType,
    evidenceCheck: session.evidenceCheck ? String(session.evidenceCheck) : null,
    providerMetadata: session.providerMetadata
      ? {
          provider: session.providerMetadata.provider ?? null,
          model: session.providerMetadata.model ?? null,
          latencyMs: session.providerMetadata.latencyMs ?? null,
          contractVersion: session.providerMetadata.contractVersion ?? INTERVIEW_CONTRACT_VERSION,
        }
      : null,
    startedAt: session.startedAt ?? null,
    completedAt: session.completedAt ?? null,
    expiresAt: session.expiresAt ?? null,
    createdAt: session.createdAt ?? null,
    updatedAt: session.updatedAt ?? null,
  };
}

export const InterviewSession =
  mongoose.models.InterviewSession ??
  mongoose.model('InterviewSession', interviewSessionSchema);
