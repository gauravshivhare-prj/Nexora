import mongoose from 'mongoose';

import { env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * MongoDB connection lifecycle & query performance auditing.
 */

// Fail fast rather than letting the driver buffer operations for 30s.
export const CONNECTION_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: env.mongodbPoolSize ?? 20,
  minPoolSize: env.mongodbMinPoolSize ?? 5,
};

/** Slow query logging threshold in milliseconds (500ms). */
export const SLOW_QUERY_THRESHOLD_MS = 500;

/**
 * Checks whether a MongoDB connection string utilizes TLS/SSL.
 *
 * @param {string} uri
 * @returns {boolean}
 */
export function isTlsMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  return (
    uri.startsWith('mongodb+srv://') ||
    /[?&](?:ssl|tls)=true\b/i.test(uri)
  );
}

/**
 * Checks whether a MongoDB URI points to a local or test instance.
 *
 * @param {string} uri
 * @returns {boolean}
 */
export function isLocalMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  return (
    uri.includes('127.0.0.1') ||
    uri.includes('localhost') ||
    uri.endsWith('_test')
  );
}

/**
 * Validates connection security policy.
 *
 * In production, connections to external databases MUST enforce TLS.
 * In development, non-TLS connections log a clear observability warning.
 *
 * @param {string} uri
 * @param {string} [nodeEnv]
 * @throws {Error} If production connects without TLS to a non-local database
 */
export function validateMongoUriSecurity(uri, nodeEnv = env.nodeEnv) {
  if (!uri) return;
  const isTls = isTlsMongoUri(uri);
  const isLocal = isLocalMongoUri(uri);

  if (nodeEnv === 'production') {
    if (!isTls && !isLocal) {
      throw new Error(
        'Insecure production database connection: MONGODB_URI must use TLS encryption (mongodb+srv:// or ssl=true / tls=true).',
      );
    }
  } else if (!isTls && !isLocal) {
    logger.warn(
      'MongoDB connection is not using TLS encryption. Ensure production environments configure mongodb+srv:// or ssl=true.',
    );
  }
}

/**
 * Enables slow query performance tracking across Mongoose queries.
 *
 * Emits logger.warn whenever an operation takes >= 500ms.
 */
let queryTimingPluginRegistered = false;
export function configureMongooseSlowQueryLogging() {
  if (queryTimingPluginRegistered) return;
  queryTimingPluginRegistered = true;

  mongoose.plugin((schema) => {
    schema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments'], function () {
      this._queryStartTime = process.hrtime.bigint();
    });

    schema.post(['find', 'findOne', 'findOneAndUpdate', 'countDocuments'], function () {
      if (this._queryStartTime) {
        const durationMs = Number(process.hrtime.bigint() - this._queryStartTime) / 1e6;
        if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
          logger.warn(
            `Slow query detected: ${this.model?.modelName || 'UnknownModel'}.${this.op} took ${durationMs.toFixed(1)}ms`,
          );
        }
      }
    });
  });
}

function registerConnectionListeners() {
  const { connection } = mongoose;

  connection.on('error', (error) => {
    logger.error('MongoDB connection error', error.message);
  });

  connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
}

export async function connectDatabase() {
  validateMongoUriSecurity(env.mongodbUri, env.nodeEnv);
  configureMongooseSlowQueryLogging();
  registerConnectionListeners();

  await mongoose.connect(env.mongodbUri, CONNECTION_OPTIONS);
  logger.info(`MongoDB connected — database "${mongoose.connection.name}"`);
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) return;

  await mongoose.disconnect();
  logger.info('MongoDB connection closed');
}
