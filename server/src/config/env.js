import 'dotenv/config';

/**
 * Single source of truth for environment configuration.
 *
 * Nothing else in the codebase reads `process.env` for app config, so a missing
 * or malformed variable fails loudly here at startup instead of surfacing as a
 * confusing runtime error later.
 */

const REQUIRED_VARIABLES = ['MONGODB_URI', 'JWT_SECRET'];

/**
 * A JWT secret shorter than this is brute-forceable offline, and every token
 * the application has ever issued is only as trustworthy as this value. It is
 * enforced in development too: a weak local secret has a habit of being copied
 * into production.
 */
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Placeholder words people pad out to satisfy a length check.
 *
 * Matched as substrings, not exact values: every one of these is shorter than
 * MIN_JWT_SECRET_LENGTH, so an exact-match list could never fire — the length
 * check would always reject first. "changeme-changeme-changeme-changeme" is
 * the case worth catching.
 */
const PLACEHOLDER_FRAGMENTS = [
  'changeme',
  'change-me',
  'change_me',
  'your-secret',
  'yoursecret',
  'placeholder',
  'jwtsecret',
  'jwt_secret',
  'supersecret',
  'mysecret',
  'todo',
  'example',
];

function assertRequiredVariables() {
  const missing = REQUIRED_VARIABLES.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy server/.env.example to server/.env and fill in the values.',
    );
  }

  if (process.env.AI_PROVIDER?.trim() === 'gemini' && !process.env.GEMINI_API_KEY?.trim()) {
    throw new Error(
      'Missing required environment variable: GEMINI_API_KEY. ' +
        'GEMINI_API_KEY is required when AI_PROVIDER is set to "gemini".',
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

/**
 * Validates the JWT signing secret.
 *
 * The error never echoes the configured value, so a misconfiguration cannot
 * print a real secret into a terminal, a CI log or a screenshot.
 */
function parseJwtSecret(value) {
  const secret = value.trim();

  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is too short: it must be at least ${MIN_JWT_SECRET_LENGTH} characters. ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }

  const lowered = secret.toLowerCase();
  const placeholder = PLACEHOLDER_FRAGMENTS.find((fragment) => lowered.includes(fragment));
  if (placeholder) {
    throw new Error(
      `JWT_SECRET looks like a placeholder (it contains "${placeholder}"). Generate a real random secret.`,
    );
  }

  // A long string of one repeated character passes the length check while
  // carrying almost no entropy.
  if (new Set(secret).size < 8) {
    throw new Error(
      'JWT_SECRET has too little variation to be random. Generate a real random secret.',
    );
  }

  return secret;
}

/**
 * Token lifetime, as a duration string accepted by the JWT library
 * (e.g. "15m", "1h", "7d"). Validated here so a typo fails at startup rather
 * than at the first login attempt.
 */
function parseJwtExpiresIn(value, fallback) {
  const expiresIn = value?.trim();
  if (!expiresIn) return fallback;

  if (!/^\d+[smhd]$/.test(expiresIn)) {
    throw new Error(
      `Invalid JWT_EXPIRES_IN value: "${expiresIn}". Expected a number followed by s, m, h or d — for example "1h".`,
    );
  }
  return expiresIn;
}

function parseTimeoutMs(value, fallback = 60000) {
  if (!value) return fallback;

  const ms = Number(value);
  if (!Number.isInteger(ms) || ms <= 0) {
    throw new Error(`Invalid GEMINI_TIMEOUT_MS value: "${value}". Expected a positive integer.`);
  }
  return ms;
}

assertRequiredVariables();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parsePort(process.env.PORT, 5000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  mongodbUri: process.env.MONGODB_URI.trim(),

  // Token lifetime is not sensitive and stays plainly visible.
  jwtExpiresIn: parseJwtExpiresIn(process.env.JWT_EXPIRES_IN, '1h'),

  /**
   * Which registered AI provider to use, or null for none.
   *
   * Optional, and absence is a supported state rather than a misconfiguration:
   * everything except the analysis endpoints works without it, and those
   * answer 503 saying so. Not validated against the registry here — that
   * would make the server refuse to boot over a feature most requests never
   * touch. See services/ai/aiProvider.js.
   */
  aiProviderName: process.env.AI_PROVIDER?.trim() || null,

  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',
  geminiTimeoutMs: parseTimeoutMs(process.env.GEMINI_TIMEOUT_MS, 60000),
};

/**
 * The JWT signing secret. Read once here and never re-read from process.env,
 * so there is a single place to audit.
 *
 * Defined as a non-enumerable property so `JSON.stringify(env)`, a debugger
 * dump or an accidental `logger.info('config', env)` cannot print it. Reading
 * `env.jwtSecret` directly still works.
 */
Object.defineProperty(env, 'jwtSecret', {
  value: parseJwtSecret(process.env.JWT_SECRET),
  enumerable: false,
  writable: false,
});

/**
 * Google AI Studio API key. Stored as a non-enumerable property so it is never
 * leaked into logs or serialized output.
 */
Object.defineProperty(env, 'geminiApiKey', {
  value: process.env.GEMINI_API_KEY?.trim() || null,
  enumerable: false,
  writable: false,
});

export const isProduction = env.nodeEnv === 'production';
