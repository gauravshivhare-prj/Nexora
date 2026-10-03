import crypto from 'node:crypto';

/**
 * Valid pattern for client-supplied correlation/request IDs:
 * ASCII alphanumeric, underscores, hyphens, up to 64 chars.
 */
const VALID_REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Task 33 — Request ID & Distributed Tracing Middleware
 *
 * Assigns or validates an immutable correlation ID (`req.id`) for every request.
 * Exposes it on the response via `X-Request-Id` header for end-to-end auditability.
 */
export function requestId(req, res, next) {
  const incomingId = req.headers['x-request-id'];

  if (typeof incomingId === 'string' && VALID_REQUEST_ID_PATTERN.test(incomingId.trim())) {
    req.id = incomingId.trim();
  } else {
    req.id = crypto.randomUUID();
  }

  res.setHeader('X-Request-Id', req.id);
  next();
}
