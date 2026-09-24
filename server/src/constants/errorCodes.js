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

  // --- Resumes ------------------------------------------------------------
  /** No resume with that id belongs to the caller. Also returned when it
   *  belongs to someone else: "not yours" and "not there" must look identical,
   *  or the API becomes a way to discover which ids exist. */
  RESUME_NOT_FOUND: 'RESUME_NOT_FOUND',
  /** Analysis was requested for a resume that is already being analysed. */
  RESUME_ANALYSIS_IN_PROGRESS: 'RESUME_ANALYSIS_IN_PROGRESS',

  // --- CareerTwin ---------------------------------------------------------
  /**
   * Generation was requested for a student with nothing to build from. An
   * empty twin would report zero skills as a finding about the student, when
   * it is only a finding about how much they have entered.
   */
  CAREER_TWIN_NO_INPUT: 'CAREER_TWIN_NO_INPUT',
  /** No CareerTwin has been generated yet. */
  CAREER_TWIN_NOT_FOUND: 'CAREER_TWIN_NOT_FOUND',

  // --- Career roles -------------------------------------------------------
  /** No role with that id exists in the curated catalogue. */
  CAREER_ROLE_NOT_FOUND: 'CAREER_ROLE_NOT_FOUND',

  // --- AI -----------------------------------------------------------------
  /** No AI provider is configured, so nothing can be analysed. */
  AI_PROVIDER_NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  /** The provider failed: network, rate limit, authentication or timeout. */
  AI_PROVIDER_FAILED: 'AI_PROVIDER_FAILED',
  /**
   * The provider answered, but its output could not be trusted — unparseable
   * JSON, or a shape that failed schema validation. Distinct from
   * AI_PROVIDER_FAILED because the fix is different: this one is a prompt or
   * model problem, not an outage.
   */
  AI_OUTPUT_INVALID: 'AI_OUTPUT_INVALID',

  // --- Interview ----------------------------------------------------------
  INTERVIEW_SESSION_NOT_FOUND: 'INTERVIEW_SESSION_NOT_FOUND',
  INTERVIEW_SESSION_EXPIRED: 'INTERVIEW_SESSION_EXPIRED',
  INTERVIEW_INVALID_STATE: 'INTERVIEW_INVALID_STATE',
  INTERVIEW_ATTEMPT_LIMIT_REACHED: 'INTERVIEW_ATTEMPT_LIMIT_REACHED',
  INTERVIEW_EVALUATION_FAILED: 'INTERVIEW_EVALUATION_FAILED',

  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
};
