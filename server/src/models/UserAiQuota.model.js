import mongoose from 'mongoose';

const aiCallRecordSchema = new mongoose.Schema(
  {
    contractId: { type: String, default: null },
    model: { type: String, default: 'gemini-1.5-flash' },
    inputChars: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userAiQuotaSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    dateKey: {
      type: String,
      required: true,
      trim: true,
    },
    count: {
      type: Number,
      default: 0,
      min: 0,
    },
    estimatedCostUsd: {
      type: Number,
      default: 0,
      min: 0,
    },
    calls: {
      type: [aiCallRecordSchema],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 30 * 86400, // 30-day automated TTL cleanup
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userAiQuotaSchema.index({ user: 1, dateKey: 1 }, { unique: true });

/**
 * Projects a clean client-safe DTO of user AI quota consumption.
 *
 * @param {Object} doc
 * @param {number} dailyLimit
 * @returns {Object}
 */
export function toPublicUserAiQuota(doc, dailyLimit = 50) {
  const count = doc?.count ?? 0;
  const remaining = Math.max(0, dailyLimit - count);

  return {
    dateKey: doc?.dateKey || new Date().toISOString().slice(0, 10),
    count,
    dailyLimit,
    remaining,
    isExhausted: count >= dailyLimit,
    estimatedCostUsd: Number((doc?.estimatedCostUsd ?? 0).toFixed(6)),
    updatedAt: doc?.updatedAt || new Date(),
  };
}

export const UserAiQuota = mongoose.model('UserAiQuota', userAiQuotaSchema);
