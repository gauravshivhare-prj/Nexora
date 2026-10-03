import mongoose from 'mongoose';

/**
 * A historical snapshot of a student's readiness score and evidence status
 * for a specific career role.
 *
 * Persisted when readiness is computed with score evaluation or when
 * CareerTwin is updated, enabling students to track progress over time.
 * Scoped strictly to the owning user.
 */
const readinessSnapshotSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    roleId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    evidenceStatus: {
      type: String,
      required: true,
      enum: ['verified', 'supported', 'partial', 'insufficient_data'],
    },
    band: {
      type: String,
      default: 'beginning',
    },
    confidence: {
      type: String,
      default: 'low',
    },
    requiredScore: {
      type: Number,
      default: 0,
    },
    preferredScore: {
      type: Number,
      default: 0,
    },
    blockingSkillsCount: {
      type: Number,
      default: 0,
    },
    interviewBoostApplied: {
      type: Boolean,
      default: false,
    },
    skillStates: {
      type: [
        {
          _id: false,
          skillKey: { type: String, required: true },
          name: { type: String, required: true },
          tier: { type: String, enum: ['required', 'preferred'], default: 'required' },
          status: {
            type: String,
            enum: ['verified', 'supported', 'claimed', 'missing'],
            default: 'missing',
          },
        },
      ],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

// Compound index for querying user's history for a specific role in reverse chronological order
readinessSnapshotSchema.index({ user: 1, roleId: 1, createdAt: -1 });

export function toPublicReadinessSnapshot(doc) {
  if (!doc) return null;
  const snapshot = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: snapshot._id?.toString(),
    roleId: snapshot.roleId,
    score: snapshot.score,
    evidenceStatus: snapshot.evidenceStatus,
    band: snapshot.band,
    confidence: snapshot.confidence,
    requiredScore: snapshot.requiredScore,
    preferredScore: snapshot.preferredScore,
    blockingSkillsCount: snapshot.blockingSkillsCount,
    interviewBoostApplied: Boolean(snapshot.interviewBoostApplied),
    skillStates: Array.isArray(snapshot.skillStates) ? snapshot.skillStates : [],
    createdAt: snapshot.createdAt,
  };
}

export const ReadinessSnapshot = mongoose.model('ReadinessSnapshot', readinessSnapshotSchema);
