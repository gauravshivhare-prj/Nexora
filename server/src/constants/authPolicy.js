/**
 * Authentication rules in one place.
 *
 * Validation, the User schema and the tests all read these constants, so the
 * policy cannot drift between the API boundary and the database.
 */

/**
 * bcrypt only considers the first 72 *bytes* of a password and silently
 * ignores the rest. Left unchecked that is a real weakness: two different
 * long passwords sharing a 72-byte prefix would both authenticate. We reject
 * anything longer instead of truncating it behind the user's back.
 */
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export const PASSWORD_POLICY = {
  minLength: 8,
  maxBytes: BCRYPT_MAX_PASSWORD_BYTES,
  /** Rejects single-character-class passwords such as "password" or "12345678". */
  requiresLetter: true,
  requiresDigit: true,
  /**
   * Cost factor 12: ~250ms per hash on typical hardware. High enough to make
   * offline cracking expensive, low enough not to stall the event loop.
   */
  saltRounds: 12,
};

/** Human-readable form of the rules above, returned on a weak password. */
export const PASSWORD_REQUIREMENT_MESSAGE =
  `Password must be at least ${PASSWORD_POLICY.minLength} characters long, ` +
  'contain at least one letter and one number, ' +
  `and be no longer than ${PASSWORD_POLICY.maxBytes} bytes.`;

export const NAME_POLICY = {
  minLength: 2,
  maxLength: 100,
};

/** RFC 5321 limit on a complete address. */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Deliberately pragmatic rather than RFC-complete: one @, no whitespace, a dot
 * in the domain. A fully RFC-5322-compliant pattern accepts addresses no real
 * mail provider issues, and the only true validation is sending mail.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Account roles. Kept minimal — Phase 1 only needs to distinguish students. */
export const USER_ROLES = {
  STUDENT: 'student',
  ADMIN: 'admin',
};

export const USER_ROLE_VALUES = Object.values(USER_ROLES);

// --- Rate limiting --------------------------------------------------------

/**
 * In-memory sliding-window rate limits for authentication endpoints.
 *
 * The numbers are deliberately generous so that local development, automated
 * tests and a small-scale MVP are never hampered, while still throttling real
 * credential-guessing attacks. Login is tighter than registration because
 * login is the credential-guessing surface.
 *
 * `windowMs` is the sliding window length; `maxAttempts` is the number of
 * requests allowed per IP within that window. After hitting the limit the
 * client receives a 429 with a `Retry-After` header.
 */
export const RATE_LIMIT_POLICY = {
  login: {
    windowMs: 15 * 60 * 1000,   // 15 minutes
    maxAttempts: 30,
  },
  register: {
    windowMs: 15 * 60 * 1000,   // 15 minutes
    maxAttempts: 20,
  },
};
