import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import redis from '../config/redis.js';

/**
 * Verify JWT access token from Authorization header.
 * Sets req.user = { id, phone, gender }
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);

    // Check token blacklist (logout)
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new AppError('UNAUTHORIZED', 'Token has been revoked');
    }

    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET);
    req.user = {
      id: payload.sub,
      phone: payload.phone,
      gender: payload.gender,
    };
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    if (err.name === 'TokenExpiredError') return next(new AppError('UNAUTHORIZED', 'Token expired'));
    if (err.name === 'JsonWebTokenError') return next(new AppError('UNAUTHORIZED', 'Invalid token'));
    next(err);
  }
}

/**
 * WebSocket JWT authentication.
 * Parses token from URL query string: /ws/chat/:roomId?token=xxx
 *
 * @param {string} token - JWT token string
 * @returns {object} decoded payload
 */
export async function authenticateWs(token) {
  if (!token) throw new AppError('UNAUTHORIZED', 'Missing token');

  const isBlacklisted = await redis.get(`blacklist:${token}`);
  if (isBlacklisted) throw new AppError('UNAUTHORIZED', 'Token has been revoked');

  const payload = jwt.verify(token, config.JWT_ACCESS_SECRET);
  return { id: payload.sub, phone: payload.phone, gender: payload.gender };
}

/**
 * Optionally authenticate — sets req.user if token present, doesn't fail if absent.
 */
export async function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();
  return authenticate(req, res, next);
}
