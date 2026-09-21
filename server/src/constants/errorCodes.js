/**
 * Stable, machine-readable error codes returned to API clients.
 * Clients branch on `errorCode`, never on the human-readable message.
 */
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  /** Registration rejected because the email is already registered. */
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',

  // --- Authentication -----------------------------------------------------
  /**
   * Login failed. Deliberately one code for both "no such email" and "wrong
   * password": a client that could tell them apart could enumerate accounts.
   */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** No Authorization header, or not in "Bearer <token>" form. */
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  /** Token was unreadable, had a bad signature, or failed a claim check. */
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  /** Token was well-formed and correctly signed, but has expired. */
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  /** Authenticated successfully, but the account is deactivated. */
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  FORBIDDEN: 'FORBIDDEN',

  // --- Rate limiting ------------------------------------------------------
  /** Too many requests from this client within the configured window. */
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
};
