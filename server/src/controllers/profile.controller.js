import { confirmField, getProfile, reconcileProfile, updateProfile } from '../services/profile.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/profile
 *
 * Returns the signed-in student's profile. `exists` tells the client whether
 * anything has been saved yet, so the page can choose between its empty state
 * and its filled state without guessing from blank fields.
 */
export const readProfile = asyncHandler(async (req, res) => {
  const { profile, exists } = await getProfile(req.auth.userId);

  res.status(200).json({
    success: true,
    message: exists ? 'Profile retrieved' : 'No profile saved yet',
    data: { profile, exists },
  });
});

/**
 * PATCH /api/profile
 *
 * Merge semantics: only the fields present in the body are changed. Creates
 * the profile if this is the first save, so the client needs no separate
 * "create" call and no way to get it wrong.
 *
 * The owner comes from `req.auth`, set by requireAuth from a verified token.
 * A `user` or `userId` field in the body is not read — it is rejected as an
 * unrecognised field by the validator.
 */
export const saveProfile = asyncHandler(async (req, res) => {
  const profile = await updateProfile(req.auth.userId, req.body);

  res.status(200).json({
    success: true,
    message: 'Profile saved',
    data: { profile, exists: true },
  });
});

/**
 * GET /api/profile/reconcile
 *
 * Runs deterministic reconciliation between profile facts and newest active resume facts.
 */
export const readProfileReconciliation = asyncHandler(async (req, res) => {
  const report = await reconcileProfile(req.auth.userId);

  res.status(200).json({
    success: true,
    message: 'Profile and resume reconciliation report generated',
    data: report,
  });
});

/**
 * POST /api/profile/confirm-field
 *
 * Explicitly confirms or resolves an AI-suggested or reconciled profile field.
 */
export const confirmProfileField = asyncHandler(async (req, res) => {
  const { field, value, source } = req.body || {};
  const profile = await confirmField(req.auth.userId, { field, value, source });

  res.status(200).json({
    success: true,
    message: `Field ${field} confirmed and updated`,
    data: { profile, exists: true },
  });
});
