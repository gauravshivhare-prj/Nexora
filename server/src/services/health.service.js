import { env } from '../config/env.js';

/**
 * Builds the health payload. Business logic lives here rather than in the
 * controller so the controller stays a thin HTTP adapter.
 */
export function getHealthStatus() {
  return {
    success: true,
    message: 'Nexora API is healthy',
    environment: env.nodeEnv,
  };
}
