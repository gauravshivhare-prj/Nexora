import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { ApiError } from './ApiError.js';

/**
 * The only place tokens are signed or verified.
 *
 * The secret is read from validated config, never from process.env directly,
 * and never appears in a thrown error or a log line.
 */

/**
 * Pinned explicitly rather than left to the library's default.
 *
 * jsonwebtoken will otherwise accept whatever algorithm the token's own header
 * claims. That is the classic JWT confusion attack: an attacker swaps the
 * header to "none", or to HS256 against a public key, and forges tokens.
 */
const ALGORITHM = 'HS256';

/** Identifies tokens as ours, so a token from another system is rejected. */
const ISSUER = 'nexora-api';
const AUDIENCE = 'nexora-client';

/**
 * Signs an access token for a user.
 *
 * The payload carries an identifier and nothing else. A JWT is signed but not
 * encrypted — anyone holding it can read the payload — so name, email, role
 * and any profile data stay out of it. Authorisation reads the database,
 * which also means a deactivated account stops working immediately rather
 * than when its token happens to expire.
 *
 * @param {{ id: string }} user
 * @returns {string}
 */
export function signAccessToken(user) {
  if (!user?.id) {
    throw new Error('signAccessToken requires a user with an id.');
  }

  return jwt.sign({}, env.jwtSecret, {
    subject: String(user.id),
    expiresIn: env.jwtExpiresIn,
    algorithm: ALGORITHM,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

/**
 * Verifies a token's signature, expiry, issuer and audience.
 *
 * @param {string} token
 * @returns {{ userId: string }}
 * @throws {ApiError} 401, distinguishing expired from otherwise invalid so a
 *   client knows whether logging in again will help.
 */
export function verifyAccessToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    throw ApiError.unauthorized('Authentication token is missing.', ERROR_CODES.AUTH_TOKEN_MISSING);
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized(
        'Authentication token has expired.',
        ERROR_CODES.AUTH_TOKEN_EXPIRED,
      );
    }
    // Bad signature, wrong algorithm, wrong issuer/audience, unparseable.
    // All collapse into one message: telling a caller exactly which check
    // failed only helps someone probing the token format.
    throw ApiError.unauthorized(
      'Authentication token is invalid.',
      ERROR_CODES.AUTH_TOKEN_INVALID,
    );
  }

  if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    throw ApiError.unauthorized(
      'Authentication token is invalid.',
      ERROR_CODES.AUTH_TOKEN_INVALID,
    );
  }

  return { userId: payload.sub.trim() };
}

/**
 * Extracts the token from an Authorization header.
 *
 * @returns {string | null} Null when the header is absent or is not a
 *   well-formed `Bearer <token>` (for example Basic auth).
 */
export function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') return null;

  // Exactly two parts, scheme compared case-insensitively per RFC 7235.
  const parts = authorizationHeader.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== 'bearer') return null;

  return parts[1].length > 0 ? parts[1] : null;
}
