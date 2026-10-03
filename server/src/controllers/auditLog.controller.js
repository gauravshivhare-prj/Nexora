import { listAuditLogs } from '../services/auditLog.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/admin/audit-logs
 *
 * Restricted to administrators. Returns audit log records with optional filtering.
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const { targetUser, actor, action, limit } = req.query;
  const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200) : 50;

  const logs = await listAuditLogs({
    targetUser,
    actor,
    action,
    limit: parsedLimit,
  });

  res.status(200).json({
    success: true,
    data: logs,
  });
});
