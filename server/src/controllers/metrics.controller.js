import { metricsCollector } from '../middleware/metrics.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/health/metrics or GET /api/admin/metrics
 *
 * Exposes system telemetry, request counters, latency percentiles, error rates,
 * and AI provider health. Restricted to administrative operators.
 */
export const getSystemMetrics = asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const data = metricsCollector.getSummary();

  res.status(200).json({
    success: true,
    message: 'System metrics retrieved',
    data,
  });
});
