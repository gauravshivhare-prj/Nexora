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
]);

function sanitizeMeta(meta, depth = 0) {
  if (meta == null || depth > 4) return meta;
  if (typeof meta === 'string') {
    return meta.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
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
  const label = `${LEVEL_COLOURS[level]}${level.toUpperCase()}${RESET}`;
  const line = `${timestamp} ${label} ${message}`;
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;

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
