import { ERROR_CODES } from '../constants/errorCodes.js';
import { ApiError } from '../utils/ApiError.js';
import { extractBearerToken, verifyAccessToken } from '../utils/jwt.js';

/**
 * Gate for protected routes.
 *
 * Establishes *who* the caller claims to be, using the token alone. It does
 * not load the user: a handler that needs the account reads it itself, so a
 * route that only needs an id costs no database round trip.
 *
 * On success `req.auth = { userId }` — an identifier only. Nothing sensitive
 * is attached, and the raw token is not kept on the request.
 */
export function requireAuth(req, _res, next) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    next(
      ApiError.unauthorized(
        'Authentication required. Provide an Authorization header of the form "Bearer <token>".',
        ERROR_CODES.AUTH_TOKEN_MISSING,
      ),
    );
    return;
  }

  try {
    const { userId } = verifyAccessToken(token);
    req.auth = { userId };
    next();
  } catch (error) {
    next(error);
  }
}
