import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * Error type for failures we anticipate and describe deliberately
 * (bad input, missing route, unavailable dependency).
 *
 * `isOperational` distinguishes these from unexpected programmer errors,
 * which the error middleware reports as a generic 500.
 */
export class ApiError extends Error {
  constructor(statusCode, message, errorCode = ERROR_CODES.INTERNAL_SERVER_ERROR) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, errorCode = ERROR_CODES.BAD_REQUEST) {
    return new ApiError(400, message, errorCode);
  }

  static notFound(message, errorCode = ERROR_CODES.NOT_FOUND) {
    return new ApiError(404, message, errorCode);
  }

  static unauthorized(message, errorCode = ERROR_CODES.AUTH_TOKEN_INVALID) {
    return new ApiError(401, message, errorCode);
  }

  static forbidden(message, errorCode = ERROR_CODES.FORBIDDEN) {
    return new ApiError(403, message, errorCode);
  }

  static conflict(message, errorCode = ERROR_CODES.CONFLICT) {
    return new ApiError(409, message, errorCode);
  }

  static serviceUnavailable(message, errorCode = ERROR_CODES.SERVICE_UNAVAILABLE) {
    return new ApiError(503, message, errorCode);
  }

  static tooManyRequests(message, errorCode = ERROR_CODES.RATE_LIMIT_EXCEEDED) {
    return new ApiError(429, message, errorCode);
  }
}
