import {
  analyseResume,
  createResume,
  deleteResume,
  getResume,
  listResumes,
} from '../services/resume.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * POST /api/resumes
 *
 * Stores a resume's text. Analysis is a separate, explicit call — storing a
 * document and spending money on a model are different decisions, and a
 * student who only wanted to keep a copy should not trigger the second.
 */
export const create = asyncHandler(async (req, res) => {
  const resume = await createResume(req.auth.userId, req.body);

  res.status(201).json({
    success: true,
    message: 'Resume saved',
    data: { resume },
  });
});

/** GET /api/resumes — the caller's resumes, newest first. */
export const list = asyncHandler(async (req, res) => {
  const resumes = await listResumes(req.auth.userId);

  res.status(200).json({
    success: true,
    message: resumes.length > 0 ? 'Resumes retrieved' : 'No resumes saved yet',
    data: { resumes, count: resumes.length },
  });
});

/** GET /api/resumes/:resumeId */
export const read = asyncHandler(async (req, res) => {
  const resume = await getResume(req.auth.userId, req.params.resumeId);

  res.status(200).json({
    success: true,
    message: 'Resume retrieved',
    data: { resume },
  });
});

/** DELETE /api/resumes/:resumeId */
export const remove = asyncHandler(async (req, res) => {
  await deleteResume(req.auth.userId, req.params.resumeId);

  res.status(200).json({
    success: true,
    message: 'Resume deleted',
    data: { id: req.params.resumeId },
  });
});

/**
 * POST /api/resumes/:resumeId/analysis
 *
 * A POST, not a PUT: this starts a job with a cost and a side effect, and it
 * is not idempotent — running it twice runs the model twice.
 *
 * 503 when no AI provider is configured. Nexora ships without one, and this
 * endpoint says so rather than returning invented data.
 */
export const analyse = asyncHandler(async (req, res) => {
  const resume = await analyseResume(req.auth.userId, req.params.resumeId);

  res.status(200).json({
    success: true,
    message:
      resume.warnings.length > 0
        ? 'Resume analysed, with some values dropped as unverifiable'
        : 'Resume analysed',
    data: { resume },
  });
});
