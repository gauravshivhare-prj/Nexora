import mongoose from 'mongoose';

import { env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * MongoDB connection lifecycle.
 *
 * Phase 0 scope: establish and verify the connection only. No models are
 * defined yet — those belong to the phases that own the data.
 */

// Fail fast rather than letting the driver buffer operations for 30s.
const CONNECTION_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
};

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
  registerConnectionListeners();

  await mongoose.connect(env.mongodbUri, CONNECTION_OPTIONS);
  logger.info(`MongoDB connected — database "${mongoose.connection.name}"`);
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) return;

  await mongoose.disconnect();
  logger.info('MongoDB connection closed');
}
