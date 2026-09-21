import { getHealthStatus } from '../services/health.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** GET /api/health */
export const checkHealth = asyncHandler(async (_req, res) => {
  res.status(200).json(getHealthStatus());
});
