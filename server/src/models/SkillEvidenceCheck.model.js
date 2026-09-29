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
            if (kind === CHECK_KINDS.INTERVIEW && evaluatedBy === 'ai') {
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
        message: 'Check is not eligible for verified status under institutional evidence policy.',
      },
    },
    evaluatedBy: { type: String, required: true },
    reference: { type: String, required: true, maxlength: 200 },
    completedAt: { type: Date, required: true },
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

// Cover the two read paths, both newest-first per user: the evidence list
// and the verified-only load that feeds every CareerTwin build.
skillEvidenceCheckSchema.index({ user: 1, completedAt: -1 });
skillEvidenceCheckSchema.index({ user: 1, eligibleForVerified: 1, completedAt: -1 });

export function toPublicSkillEvidenceCheck(check) {
  return {
    id: String(check._id ?? check.id),
    kind: check.kind,
    skillKey: check.skillKey,
    skillName: check.skillName,
    score: check.score,
    passMark: check.passMark,
    outcome: check.outcome,
    eligibleForVerified: check.eligibleForVerified,
    evaluatedBy: check.evaluatedBy,
    reference: check.reference,
    completedAt: check.completedAt,
  };
}

export const SkillEvidenceCheck =
  mongoose.models.SkillEvidenceCheck ?? mongoose.model('SkillEvidenceCheck', skillEvidenceCheckSchema);
