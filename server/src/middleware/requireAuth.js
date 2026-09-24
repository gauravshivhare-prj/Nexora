import { ERROR_CODES } from '../constants/errorCodes.js';
import { ApiError } from '../utils/ApiError.js';
import { extractBearerToken, verifyAccessToken } from '../utils/jwt.js';
import { getAuthenticatedUser } from '../services/auth.service.js';

/**
 * Gate for protected routes.
 *
 * Establishes *who* the caller claims to be, using the token alone. It does
 * not load the user: a handler that needs the account reads it itself, so a
 * route that only needs an id costs no database round trip.
 *
 * On success `req.auth = { userId, role }`. Nothing sensitive is attached,
 * and the raw token is not kept on the request. The role is read from the
 * account loaded below, not from the token, so a demotion applies at once.
 */
export async function requireAuth(req, _res, next) {
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
    const user = await getAuthenticatedUser(userId);
    req.auth = { userId, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Restricts a route to the given roles. Must run after `requireAuth`.
 *
 * @param {...string} roles
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      next(ApiError.forbidden('You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}
