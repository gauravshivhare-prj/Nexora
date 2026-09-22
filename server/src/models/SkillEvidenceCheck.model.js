import mongoose from 'mongoose';

import { CHECK_KINDS, CHECK_OUTCOMES } from '../domain/evidence/skillEvidenceCheck.js';

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
    outcome: { type: String, enum: Object.values(CHECK_OUTCOMES), required: true },
    eligibleForVerified: { type: Boolean, required: true },
    evaluatedBy: { type: String, required: true },
    reference: { type: String, required: true, maxlength: 200 },
    completedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

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
