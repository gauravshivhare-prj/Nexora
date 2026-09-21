/**
 * Stable, machine-readable error codes returned to API clients.
 * Clients branch on `errorCode`, never on the human-readable message.
 */
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
};
