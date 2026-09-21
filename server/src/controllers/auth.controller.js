import { registerUser } from '../services/auth.service.js';
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
