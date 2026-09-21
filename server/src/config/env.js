import 'dotenv/config';

/**
 * Single source of truth for environment configuration.
 *
 * Nothing else in the codebase reads `process.env` for app config, so a missing
 * or malformed variable fails loudly here at startup instead of surfacing as a
 * confusing runtime error later.
 */

const REQUIRED_VARIABLES = ['MONGODB_URI'];

function assertRequiredVariables() {
  const missing = REQUIRED_VARIABLES.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy server/.env.example to server/.env and fill in the values.',
    );
  }
}

function parsePort(value, fallback) {
  if (!value) return fallback;

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: "${value}". Expected an integer between 1 and 65535.`);
  }
  return port;
}

assertRequiredVariables();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parsePort(process.env.PORT, 5000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  mongodbUri: process.env.MONGODB_URI.trim(),
};

export const isProduction = env.nodeEnv === 'production';
