import mongoose from 'mongoose';
import { env } from '../config/env.js';

/**
 * Builds the health payload. Business logic lives here rather than in the
 * controller so the controller stays a thin HTTP adapter.
 */
export function getHealthStatus() {
  const isDbConnected = mongoose.connection.readyState === 1;
  return {
    success: true,
    status: isDbConnected ? 'healthy' : 'degraded',
    message: 'Nexora API is healthy',
    environment: env.nodeEnv,
    database: isDbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  };
}
