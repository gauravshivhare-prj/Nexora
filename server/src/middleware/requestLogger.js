import { logger } from '../utils/logger.js';

/**
 * Logs one line per completed request: method, path, status and duration.
 * Attached on `finish` so the real status code (including error responses) is
 * recorded rather than the intent at request time.
 */
export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const reqId = req.id ? `[${req.id}] ` : '';
    const safeUrl = req.originalUrl?.replace(/([?&](?:token|key|apiKey|secret|password|email|phone)=)[^&]+/gi, '$1[REDACTED]') || req.url || '';
    const message = `${reqId}${req.method} ${safeUrl} ${res.statusCode} — ${durationMs.toFixed(1)}ms`;

    if (res.statusCode >= 500) logger.error(message);
    else if (res.statusCode >= 400) logger.warn(message);
    else logger.info(message);
  });

  next();
}
