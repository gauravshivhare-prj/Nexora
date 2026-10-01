import {
  recordAssessment,
  recordInterview,
  listEvidenceChecks,
  submitClaim,
  submitSupport,
  invalidateEvidence,
  getEvidenceSummary,
  recomputeUserEvidence,
} from '../services/skillEvidence.service.js';
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

export const submitSkillClaim = asyncHandler(async (req, res) => {
  const result = await submitClaim(req.auth.userId, req.body);
  res.status(201).json({ success: true, message: 'Skill claim recorded', data: { evidence: result } });
});

export const submitSkillSupport = asyncHandler(async (req, res) => {
  const result = await submitSupport(req.auth.userId, req.body);
  res.status(201).json({ success: true, message: 'Supporting artifact recorded', data: { evidence: result } });
});

export const invalidateEvidenceCheck = asyncHandler(async (req, res) => {
  const { evidenceId } = req.params;
  const { reason } = req.body;
  const invalidatedBy = req.auth.role === 'admin' ? `admin:${req.auth.userId}` : `user:${req.auth.userId}`;
  const result = await invalidateEvidence(req.auth.userId, evidenceId, { reason, invalidatedBy });
  res.status(200).json({ success: true, message: 'Evidence record invalidated', data: { evidence: result } });
});

export const getSummary = asyncHandler(async (req, res) => {
  const summary = await getEvidenceSummary(req.auth.userId);
  res.status(200).json({ success: true, message: 'Evidence summary retrieved', data: summary });
});

export const recomputeEvidence = asyncHandler(async (req, res) => {
  const result = await recomputeUserEvidence(req.auth.userId);
  res.status(200).json({ success: true, message: 'Evidence ledger recomputed', data: result });
});
