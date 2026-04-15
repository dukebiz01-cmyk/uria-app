import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Global Express error handler.
 * Returns a consistent JSON error response: { code, message, status }
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Log all errors (with stack in non-production)
  const logPayload = {
    err: {
      message: err.message,
      code: err.code,
      status: err.status,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    },
    req: {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    },
  };

  if (err.isOperational) {
    logger.warn(logPayload, 'Operational error');
  } else {
    logger.error(logPayload, 'Unexpected error');
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      status: 400,
      errors: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  // PostgreSQL errors
  if (err.code === '23505') {
    // Unique constraint violation
    return res.status(409).json({
      code: 'CONFLICT',
      message: 'Resource already exists',
      status: 409,
    });
  }

  if (err.code === '23503') {
    // Foreign key violation
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Referenced resource does not exist',
      status: 400,
    });
  }

  // Our operational errors
  if (err instanceof AppError) {
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      status: err.status,
    });
  }

  // JWT errors (if not caught earlier)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired token',
      status: 401,
    });
  }

  // Fallback — don't leak internals in production
  const status = err.status || err.statusCode || 500;
  return res.status(status).json({
    code: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    status,
  });
}
