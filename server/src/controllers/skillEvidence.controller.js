import { recordAssessment, recordInterview, listEvidenceChecks } from '../services/skillEvidence.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const createAssessment = asyncHandler(async (req, res) => {
  const result = await recordAssessment(req.auth.userId, req.body);
  res.status(201).json({ success: true, message: 'Assessment recorded', data: { assessment: result } });
});

export const createInterview = asyncHandler(async (req, res) => {
  const result = await recordInterview(req.auth.userId, req.body);
  res.status(201).json({ success: true, message: 'Interview result recorded', data: { interview: result } });
});

export const listChecks = asyncHandler(async (req, res) => {
  const checks = await listEvidenceChecks(req.auth.userId);
  res.status(200).json({ success: true, message: 'Evidence checks retrieved', data: { checks } });
});
