/**
 * Wraps an async route handler and forwards errors to Express error middleware.
 * Eliminates try/catch boilerplate in route handlers.
 *
 * @param {Function} fn - Async route handler (req, res, next)
 * @returns {Function} Express middleware
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
