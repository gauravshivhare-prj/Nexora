import mongoose from 'mongoose';

import {
  CHECK_KINDS,
  CHECK_OUTCOMES,
  INTERVIEW_PASS_MARK,
} from '../domain/evidence/skillEvidenceCheck.js';

const skillEvidenceCheckSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
      index: true,
    },
    kind: { type: String, enum: Object.values(CHECK_KINDS), required: true },
    skillKey: { type: String, required: true },
    skillName: { type: String, required: true },
    score: { type: Number, min: 0, max: 1, required: true },
    passMark: { type: Number, min: 0, max: 1, required: true },
    outcome: {
      type: String,
      enum: Object.values(CHECK_OUTCOMES),
      required: true,
      validate: {
        validator: function (val) {
          const update = typeof this.getUpdate === 'function' ? this.getUpdate() : null;
          const kind = this.kind ?? update?.$set?.kind ?? update?.kind;
          const evaluatedBy = this.evaluatedBy ?? update?.$set?.evaluatedBy ?? update?.evaluatedBy;
          const score = this.score ?? update?.$set?.score ?? update?.score;
          const passMark = this.passMark ?? update?.$set?.passMark ?? update?.passMark;

          if (kind === CHECK_KINDS.INTERVIEW && evaluatedBy === 'ai' && val === CHECK_OUTCOMES.PASS) {
            return false;
          }
          if (
            val === CHECK_OUTCOMES.PASS &&
            typeof score === 'number' &&
            typeof passMark === 'number' &&
            score < passMark
          ) {
            return false;
          }
          return true;
        },
        message: 'Invalid outcome for the check kind, evaluator, or score.',
      },
    },
    eligibleForVerified: {
      type: Boolean,
      required: true,
      validate: {
        validator: function (val) {
          const update = typeof this.getUpdate === 'function' ? this.getUpdate() : null;
          const kind = this.kind ?? update?.$set?.kind ?? update?.kind;
          const evaluatedBy = this.evaluatedBy ?? update?.$set?.evaluatedBy ?? update?.evaluatedBy;
          const outcome = this.outcome ?? update?.$set?.outcome ?? update?.outcome;
          const score = this.score ?? update?.$set?.score ?? update?.score;
          const passMark = this.passMark ?? update?.$set?.passMark ?? update?.passMark;

          if (val === true) {
            if (evaluatedBy === 'ai') {
              return false;
            }
            if (outcome !== CHECK_OUTCOMES.PASS) {
              return false;
            }
            if (
              typeof score === 'number' &&
              typeof passMark === 'number' &&
              score < passMark
            ) {
              return false;
            }
          }
          return true;
        },
        message: 'AI evaluations and non-passing outcomes cannot be eligible for verified evidence.',
      },
    },
    evaluatedBy: { type: String, required: true },
    reference: { type: String, required: true, maxlength: 200 },
    completedAt: { type: Date, required: true },

    // --- Task 04 Lifecycle & Provenance Enhancements ---
    canonicalSkillId: { type: String, default: null, trim: true },
    strength: {
      type: String,
      enum: ['claimed', 'supported', 'verified'],
      default: 'claimed',
    },
    status: {
      type: String,
      enum: ['active', 'stale', 'disputed', 'invalidated', 'superseded'],
      default: 'active',
      index: true,
    },
    confidence: { type: Number, min: 0, max: 1, default: 0.35 },
    detail: { type: String, default: '', maxlength: 500 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    isAdvisory: { type: Boolean, default: false },
    isStale: { type: Boolean, default: false },
    isDisputed: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null, index: true },
    invalidatedAt: { type: Date, default: null },
    invalidatedBy: { type: String, default: null },
    invalidationReason: { type: String, default: null, maxlength: 500 },
    auditTrail: [
      {
        action: { type: String, required: true },
        performedBy: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        details: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true },
);

/**
 * Pre-validation institutional policy check.
 *
 * Guarantees that AI-only evaluations can NEVER bypass verification policies:
 * - AI interviews must always have outcome: 'uncertain' and eligibleForVerified: false.
 * - Human interviews must meet or exceed INTERVIEW_PASS_MARK (0.75) to pass or be verified.
 * - Assessments must meet or exceed their passMark to pass or be verified.
 */
skillEvidenceCheckSchema.pre('validate', function enforceEvidencePolicy() {
  if (this.kind === CHECK_KINDS.INTERVIEW) {
    if (this.evaluatedBy === 'ai') {
      if (this.eligibleForVerified === true) {
        throw new Error('AI-evaluated interview evidence cannot be eligible for verified status.');
      }
      if (this.outcome === CHECK_OUTCOMES.PASS) {
        throw new Error('AI-evaluated interview evidence cannot have outcome "pass" (must be "uncertain").');
      }
    } else if (this.evaluatedBy === 'human') {
      const isPassing =
        typeof this.score === 'number' &&
        typeof this.passMark === 'number' &&
        this.score >= this.passMark &&
        this.passMark >= INTERVIEW_PASS_MARK;

      if (!isPassing) {
        if (this.eligibleForVerified === true) {
          throw new Error('Failing human interview evaluation cannot be eligible for verified status.');
        }
        if (this.outcome === CHECK_OUTCOMES.PASS) {
          throw new Error('Failing human interview evaluation cannot have outcome "pass".');
        }
      }
    }
  } else if (this.kind === CHECK_KINDS.ASSESSMENT) {
    const isPassing =
      typeof this.score === 'number' &&
      typeof this.passMark === 'number' &&
      this.score >= this.passMark;

    if (!isPassing) {
      if (this.eligibleForVerified === true) {
        throw new Error('Failing assessment evidence cannot be eligible for verified status.');
      }
      if (this.outcome === CHECK_OUTCOMES.PASS) {
        throw new Error('Failing assessment evidence cannot have outcome "pass".');
      }
    }
  }
});

// Cover the read paths per user
skillEvidenceCheckSchema.index({ user: 1, completedAt: -1 });
skillEvidenceCheckSchema.index({ user: 1, eligibleForVerified: 1, completedAt: -1 });
skillEvidenceCheckSchema.index({ user: 1, skillKey: 1, status: 1 });
skillEvidenceCheckSchema.index({ user: 1, status: 1, completedAt: -1 });

export function toPublicSkillEvidenceCheck(check) {
  return {
    id: String(check._id ?? check.id),
    kind: check.kind,
    canonicalSkillId: check.canonicalSkillId || null,
    skillKey: check.skillKey,
    skillName: check.skillName,
    strength: check.strength || (check.eligibleForVerified ? 'verified' : 'claimed'),
    status: check.status || 'active',
    confidence: check.confidence !== undefined ? check.confidence : (check.eligibleForVerified ? 0.95 : 0.35),
    score: check.score,
    passMark: check.passMark,
    outcome: check.outcome,
    eligibleForVerified: check.eligibleForVerified,
    isAdvisory: Boolean(check.isAdvisory),
    isStale: Boolean(check.isStale),
    isDisputed: Boolean(check.isDisputed),
    evaluatedBy: check.evaluatedBy,
    reference: check.reference,
    detail: check.detail || '',
    completedAt: check.completedAt,
    expiresAt: check.expiresAt || null,
    metadata: check.metadata || {},
    invalidatedAt: check.invalidatedAt || null,
    invalidationReason: check.invalidationReason || null,
  };
}

export const SkillEvidenceCheck =
  mongoose.models.SkillEvidenceCheck ?? mongoose.model('SkillEvidenceCheck', skillEvidenceCheckSchema);
