/**
 * Pagination parameters and metadata utility for REST API endpoints.
 */

/**
 * Extracts and sanitizes pagination query parameters from Express request.
 *
 * @param {object} [query={}] req.query object
 * @param {number} [defaultLimit=20]
 * @param {number} [maxLimit=100]
 * @returns {{ page: number, limit: number, skip: number }}
 */
export function parsePagination(query = {}, defaultLimit = 20, maxLimit = 100) {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);

  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const limit = Number.isInteger(rawLimit) && rawLimit >= 1
    ? Math.min(rawLimit, maxLimit)
    : defaultLimit;

  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Formats standard pagination metadata.
 *
 * @param {object} params
 * @param {number} params.page Current page (1-indexed)
 * @param {number} params.limit Items per page
 * @param {number} params.total Total items count
 * @returns {{ page: number, limit: number, total: number, totalPages: number, hasNextPage: boolean, hasPrevPage: boolean }}
 */
export function formatPagination({ page, limit, total }) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / limit);

  return {
    page,
    limit,
    total: safeTotal,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Paginates an in-memory array.
 *
 * @template T
 * @param {Array<T>} items
 * @param {object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 * @param {number} [options.skip]
 * @returns {{ data: Array<T>, pagination: object }}
 */
export function paginateArray(items, options = {}) {
  const array = Array.isArray(items) ? items : [];
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.max(1, Number(options.limit) || 20);
  const skip = typeof options.skip === 'number' ? options.skip : (page - 1) * limit;

  const sliced = array.slice(skip, skip + limit);
  return {
    data: sliced,
    pagination: formatPagination({ page, limit, total: array.length }),
  };
}
