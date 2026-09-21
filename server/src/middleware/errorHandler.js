import mongoose from 'mongoose';

import { ERROR_CODES } from '../constants/errorCodes.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { isProduction } from '../config/env.js';

/**
 * Translates an unknown thrown value into a safe client-facing shape.
 * Returns `{ statusCode, message, errorCode }` only — never anything derived
 * from internal state that a client should not see.
 */
function normaliseError(error) {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      errorCode: error.errorCode,
      details: error.details,
    };
  }

  // Unique-index violation. Must be checked before the generic MongoServerError
  // branch below, which would otherwise report a duplicate email as a 503
  // "database unavailable" — misleading to the client and to whoever reads the
  // logs. The offending value is never echoed back.
  if (error.code === 11000 || error.code === 11001) {
    return {
      statusCode: 409,
      message: 'A record with these details already exists',
      errorCode: ERROR_CODES.CONFLICT,
    };
  }

  // Malformed JSON body — express.json() throws a SyntaxError with `body` set.
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return {
      statusCode: 400,
      message: 'Malformed JSON in request body',
      errorCode: ERROR_CODES.MALFORMED_REQUEST,
    };
  }

  // Request body exceeded the configured size limit.
  if (error.type === 'entity.too.large') {
    return {
      statusCode: 413,
      message: 'Request body is too large',
      errorCode: ERROR_CODES.BAD_REQUEST,
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 400,
      message: 'Request data failed validation',
      errorCode: ERROR_CODES.VALIDATION_ERROR,
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: 400,
      message: 'Invalid identifier supplied',
      errorCode: ERROR_CODES.BAD_REQUEST,
    };
  }

  // Any other database-layer failure.
  //
  // The driver raises more than MongoServerError: a lost connection surfaces
  // as MongoNotConnectedError, an unreachable host as MongoServerSelectionError
  // and so on. Matching only the one name let an outage — the most likely
  // database failure in production — fall through to a generic 500, so every
  // Mongo* error is treated as "database unavailable" instead.
  if (error instanceof mongoose.Error || error.name?.startsWith('Mongo')) {
    return {
      statusCode: 503,
      message: 'Database is currently unavailable',
      errorCode: ERROR_CODES.DATABASE_ERROR,
    };
  }

  return {
    statusCode: 500,
    message: 'Something went wrong',
    errorCode: ERROR_CODES.INTERNAL_SERVER_ERROR,
  };
}

/**
 * Centralised error middleware — the only place that writes an error response.
 *
 * Every failure is logged with its real cause; the client receives a consistent
 * envelope, and stack traces are attached only outside production.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity.
export function errorHandler(error, req, res, next) {
  const { statusCode, message, errorCode, details } = normaliseError(error);

  const logContext = `${req.method} ${req.originalUrl} → ${statusCode} ${errorCode}`;
  if (statusCode >= 500) {
    logger.error(`Unhandled request failure: ${logContext}`, error);
  } else {
    logger.warn(`Request rejected: ${logContext} — ${error.message}`);
  }

  const body = { success: false, message, errorCode };

  // Per-field validation failures. Safe in production: these are the caller's
  // own field names and our own policy messages, never internal state.
  if (Array.isArray(details) && details.length > 0) {
    body.details = details;
  }

  if (!isProduction && error.stack) {
    body.stack = error.stack;
  }

  res.status(statusCode).json(body);
}
