import { getOpportunities } from '../services/opportunity.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** GET /api/opportunities */
export const list = asyncHandler(async (req, res) => {
  const data = await getOpportunities(req.auth.userId);

  res.status(200).json({
    success: true,
    message:
      data.opportunities.length > 0
        ? 'Opportunities matched'
        : 'No opportunities matched the available verified evidence',
    data,
  });
});