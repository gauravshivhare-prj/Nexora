import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { getAiProviderHealth } from './ai/aiProvider.js';

/**
 * Builds the deep health payload. Probes database connectivity,
 * AI provider status, uptime, and runtime environment.
 */
export function getHealthStatus() {
  const isDbConnected = mongoose.connection.readyState === 1;
  const aiHealth = getAiProviderHealth();

  const isHealthy = isDbConnected;
  const status = isHealthy ? 'healthy' : 'degraded';

  return {
    success: true,
    status,
    message: isHealthy ? 'Nexora API is healthy' : 'Nexora API is degraded',
    environment: env.nodeEnv,
    database: isDbConnected ? 'connected' : 'disconnected',
    ai: aiHealth.status,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

