import { recordAssessment, recordInterview, listEvidenceChecks } from '../services/skillEvidence.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

function badInput(error) {
  return ApiError.badRequest(error.message, ERROR_CODES.VALIDATION_ERROR);
}

export const createAssessment = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await recordAssessment(req.auth.userId, req.body);
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError)) throw badInput(error);
    throw error;
  }

  res.status(201).json({ success: true, message: 'Assessment recorded', data: { assessment: result } });
});

export const createInterview = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await recordInterview(req.auth.userId, req.body);
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError)) throw badInput(error);
    throw error;
  }

  res.status(201).json({ success: true, message: 'Interview result recorded', data: { interview: result } });
});

export const listChecks = asyncHandler(async (req, res) => {
  const checks = await listEvidenceChecks(req.auth.userId);
  res.status(200).json({ success: true, message: 'Evidence checks retrieved', data: { checks } });
});
