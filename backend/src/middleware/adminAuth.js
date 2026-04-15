import config from '../config/index.js';
import { AppError } from '../utils/AppError.js';

/**
 * Admin authentication middleware.
 * Validates a static bearer token from the ADMIN_SECRET env variable.
 * In production, replace with role-based JWT verification.
 */
export function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHORIZED', 'Missing admin authorization'));
  }

  const token = authHeader.slice(7);
  if (token !== config.ADMIN_SECRET) {
    return next(new AppError('FORBIDDEN', 'Invalid admin token'));
  }

  req.isAdmin = true;
  next();
}
