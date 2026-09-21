/**
 * Wraps an async route handler so a rejected promise reaches the centralised
 * error middleware instead of being silently swallowed by Express.
 */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
