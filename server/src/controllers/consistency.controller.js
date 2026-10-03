import { getStudentConsistencyReport } from '../services/consistency.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/student/consistency
 * POST /api/student/consistency/reconcile
 *
 * Scoped strictly to the signed-in student's own account.
 */
export const getOwnConsistencyReport = asyncHandler(async (req, res) => {
  const autoReconcile =
    req.path.endsWith('/reconcile') ||
    req.query.autoReconcile === 'true' ||
    req.body?.autoReconcile === true;

  const report = await getStudentConsistencyReport(req.auth.userId, { autoReconcile });

  res.status(200).json({
    success: true,
    message: report.isConsistent
      ? 'Student data is internally consistent'
      : 'Inconsistencies detected across student intelligence features',
    data: report,
  });
});

/**
 * GET /api/admin/consistency/:userId
 * POST /api/admin/consistency/:userId/reconcile
 *
 * Restricted to users with the 'admin' role.
 */
export const getAdminConsistencyReport = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const autoReconcile =
    req.path.endsWith('/reconcile') ||
    req.query.autoReconcile === 'true' ||
    req.body?.autoReconcile === true;

  const report = await getStudentConsistencyReport(userId, { autoReconcile });

  res.status(200).json({
    success: true,
    message: report.isConsistent
      ? 'Student data is internally consistent'
      : 'Inconsistencies detected across student intelligence features',
    data: report,
  });
});
