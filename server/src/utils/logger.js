/**
 * Minimal structured console logger.
 *
 * Kept dependency-free on purpose: Phase 0 only needs readable, level-tagged
 * output. Reads NODE_ENV lazily so it never depends on module load order.
 */

const LEVEL_COLOURS = {
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  debug: '\x1b[90m',
};
const RESET = '\x1b[0m';

const isProduction = () => process.env.NODE_ENV === 'production';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'jwtsecret',
  'apikey',
  'secret',
  'authorization',
  'cookie',
  'sessionsecret',
  'email',
  'phone',
  'phonenumber',
]);

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_PATTERN = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

export function sanitizeLogString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(PHONE_PATTERN, '[REDACTED_PHONE]');
}

function sanitizeMeta(meta, depth = 0) {
  if (meta == null || depth > 4) return meta;
  if (typeof meta === 'string') {
    return sanitizeLogString(meta);
  }
  if (Array.isArray(meta)) {
    return meta.map((item) => sanitizeMeta(item, depth + 1));
  }
  if (typeof meta === 'object') {
    if (meta instanceof Error) {
      return meta;
    }
    const safe = {};
    for (const [key, val] of Object.entries(meta)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        safe[key] = '[REDACTED]';
      } else {
        safe[key] = sanitizeMeta(val, depth + 1);
      }
    }
    return safe;
  }
  return meta;
}

function write(level, message, meta) {
  const timestamp = new Date().toISOString();
  const sanitizedMessage = sanitizeLogString(message);
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;

  // In production, emit machine-parseable structured JSON for log aggregators
  if (isProduction()) {
    const payload = {
      level,
      timestamp,
      message: sanitizedMessage,
    };
    if (meta !== undefined) {
      if (meta instanceof Error) {
        payload.error = {
          name: meta.name,
          message: sanitizeLogString(meta.message),
          stack: sanitizeLogString(meta.stack),
        };
      } else {
        payload.context = sanitizeMeta(meta);
      }
    }
    stream(JSON.stringify(payload));
    return;
  }

  // Development & test environments: human-readable colorized terminal output
  const label = `${LEVEL_COLOURS[level]}${level.toUpperCase()}${RESET}`;
  const line = `${timestamp} ${label} ${sanitizedMessage}`;

  if (meta === undefined) {
    stream(line);
    return;
  }
  stream(line, sanitizeMeta(meta));
}

export const logger = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  /** Suppressed in production to avoid leaking internals into deployment logs. */
  debug: (message, meta) => {
    if (!isProduction()) write('debug', message, meta);
  },
};
