import {
  getAuthenticatedUser,
  loginUser,
  registerUser,
} from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * POST /api/auth/register
 *
 * Thin HTTP adapter: the controller reads the request and shapes the
 * response. Validation, hashing and persistence belong to the service.
 */
export const register = asyncHandler(async (req, res) => {
  const user = await registerUser(req.body);

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: { user },
  });
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { user, token } = await loginUser(req.body);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: { user, token },
  });
});

/** GET /api/auth/me — requires a valid access token. */
export const me = asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req.auth.userId);

  res.status(200).json({
    success: true,
    message: 'Authenticated user retrieved',
    data: { user },
  });
});

/**
 * POST /api/auth/logout
 *
 * Authentication is stateless: the server holds no session to destroy, so
 * logging out means the client discarding its token. Acknowledging that
 * honestly is better than adding a token blacklist — which would need Redis
 * or a database table, and would make every request stateful — for a token
 * that expires on its own shortly anyway.
 *
 * Deliberately performs no database write.
 */
export const logout = asyncHandler(async (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logout successful',
    data: { instruction: 'Discard the stored access token on the client.' },
  });
});
