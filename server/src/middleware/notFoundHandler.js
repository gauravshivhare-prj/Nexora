import { ApiError } from '../utils/ApiError.js';

/**
 * Converts any unmatched route into a controlled 404 so that invalid URLs flow
 * through the same error formatter as every other failure.
 */
export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
