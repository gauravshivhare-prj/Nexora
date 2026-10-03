import { env } from '../config/env.js';

/**
 * Builds standard Content-Security-Policy directive list.
 *
 * Protects against cross-site scripting and framing while allowing
 * required fonts, styles, and configured API origins.
 */
export function buildCspHeader(clientUrl = env.clientUrl) {
  const origins = clientUrl?.includes(',')
    ? clientUrl.split(',').map((s) => s.trim()).filter(Boolean).join(' ')
    : clientUrl?.trim() || '';

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${origins}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Security headers middleware.
 *
 * Enforces CSP, Permissions-Policy, COOP, framing restrictions,
 * and MIME sniffing protection across all HTTP responses.
 */
export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': buildCspHeader(),
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  next();
}
