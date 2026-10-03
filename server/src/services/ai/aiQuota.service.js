import { UserAiQuota, toPublicUserAiQuota } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { ERROR_CODES } from '../../constants/errorCodes.js';
import { logger } from '../../utils/logger.js';
import { estimateAiCost } from '../../domain/ai/aiCostEstimator.js';

export const DEFAULT_DAILY_AI_QUOTA = 50;

/**
 * Returns the effective maximum daily AI evaluations allowed per authenticated user.
 * Configurable via AI_DAILY_QUOTA_PER_USER environment variable.
 *
 * @returns {number}
 */
export function getDailyQuota() {
  const parsed = parseInt(process.env.AI_DAILY_QUOTA_PER_USER, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_AI_QUOTA;
}

/**
 * Generates canonical UTC date key (YYYY-MM-DD).
 *
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function getTodayUtcKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * Calculates seconds remaining until the next UTC midnight when quotas reset.
 *
 * @param {Date} [now=new Date()]
 * @returns {number}
 */
export function getSecondsUntilUtcMidnight(now = new Date()) {
  const nextMidnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0,
  ));
  return Math.max(1, Math.ceil((nextMidnight.getTime() - now.getTime()) / 1000));
}

/**
 * Pre-flight check: verifies whether the user has remaining AI quota for today.
 * Throws 429 AI_QUOTA_EXCEEDED with Retry-After if quota is exhausted.
 *
 * @param {string} userId
 * @throws {ApiError} 429 if daily limit is reached
 */
export async function checkUserAiQuota(userId) {
  if (!userId) return;

  const dateKey = getTodayUtcKey();
  const limit = getDailyQuota();

  const record = await UserAiQuota.findOne({ user: userId, dateKey }).lean();
  const currentCount = record?.count ?? 0;

  if (currentCount >= limit) {
    const retryAfter = getSecondsUntilUtcMidnight();
    logger.warn(`Daily AI quota exceeded for user ${userId}: ${currentCount}/${limit} on ${dateKey}`);

    const error = ApiError.tooManyRequests(
      `Daily AI evaluation quota exceeded (${currentCount}/${limit} requests used). AI features will reset in ${Math.ceil(retryAfter / 60)} minutes (00:00 UTC).`,
      ERROR_CODES.AI_QUOTA_EXCEEDED,
    );
    error.retryAfter = retryAfter;
    throw error;
  }
}

/**
 * Atomically records an AI evaluation, increments usage counter and estimated cost.
 *
 * @param {{
 *   userId: string,
 *   contractId?: string,
 *   model?: string,
 *   inputChars?: number,
 *   outputTokens?: number,
 * }} params
 * @returns {Promise<Object|null>}
 */
export async function recordAiUsage({
  userId,
  contractId = null,
  model = 'gemini-1.5-flash',
  inputChars = 0,
  outputTokens = 0,
} = {}) {
  if (!userId) return null;

  const dateKey = getTodayUtcKey();
  const costSummary = estimateAiCost({ contractId, inputChars, outputTokens, model });

  const callRecord = {
    contractId: costSummary.contractId,
    model: costSummary.model,
    inputChars: typeof inputChars === 'number' ? inputChars : 0,
    outputTokens: costSummary.outputTokens,
    costUsd: costSummary.costUsd,
    timestamp: new Date(),
  };

  const updated = await UserAiQuota.findOneAndUpdate(
    { user: userId, dateKey },
    {
      $inc: {
        count: 1,
        estimatedCostUsd: costSummary.costUsd,
      },
      $push: {
        calls: {
          $each: [callRecord],
          $slice: -100, // Retain up to 100 most recent call records per day
        },
      },
      $set: { updatedAt: new Date() },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  logger.info(
    `AI evaluation accounted: user=${userId} count=${updated.count}/${getDailyQuota()} cost=$${costSummary.costUsd.toFixed(6)} model=${model}`,
  );

  return {
    quota: toPublicUserAiQuota(updated, getDailyQuota()),
    cost: costSummary,
  };
}

/**
 * Retrieves the current day's AI quota status for an authenticated student.
 *
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function getUserAiQuotaStatus(userId) {
  const dateKey = getTodayUtcKey();
  const limit = getDailyQuota();

  const record = await UserAiQuota.findOne({ user: userId, dateKey }).lean();
  const publicQuota = toPublicUserAiQuota(record, limit);

  return {
    ...publicQuota,
    resetsInSeconds: getSecondsUntilUtcMidnight(),
  };
}

/**
 * Resets quota counters for a given user. (Useful for tests and administrative resets).
 *
 * @param {string} userId
 */
export async function resetUserAiQuota(userId) {
  if (!userId) return;
  await UserAiQuota.deleteMany({ user: userId });
}
