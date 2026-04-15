import redis from '../config/redis.js';
import config from '../config/index.js';
import { AppError } from '../utils/AppError.js';

/**
 * Redis-based sliding window rate limiter.
 *
 * @param {object} options
 * @param {number} options.windowMs - Window size in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @param {string} [options.keyPrefix] - Key prefix for differentiation
 * @returns {Function} Express middleware
 */
export function rateLimiter({
  windowMs = config.RATE_LIMIT_WINDOW_MS,
  max = config.RATE_LIMIT_MAX_REQUESTS,
  keyPrefix = 'rl',
} = {}) {
  return async (req, res, next) => {
    // Use authenticated user ID if available, otherwise IP
    const identifier = req.user?.id || req.ip;
    const key = `${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Use a pipeline for atomic operations
      const pipeline = redis.pipeline();
      // Remove old entries outside the current window
      pipeline.zremrangebyscore(key, '-inf', windowStart);
      // Count current entries in window
      pipeline.zcard(key);
      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      // Reset TTL
      pipeline.pexpire(key, windowMs);

      const results = await pipeline.exec();
      const count = results[1][1]; // zcard result

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count - 1));
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));

      if (count >= max) {
        res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        return next(new AppError('RATE_LIMIT_EXCEEDED'));
      }

      next();
    } catch (err) {
      // Fail open — if Redis is down, allow the request
      next();
    }
  };
}

/**
 * Stricter rate limiter for auth endpoints (OTP requests etc)
 */
export const authRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  keyPrefix: 'rl:auth',
});

/**
 * Default API rate limiter
 */
export const apiRateLimiter = rateLimiter({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: 'rl:api',
});

/**
 * Signal send rate limiter — 10 per minute
 */
export const signalRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'rl:signal',
});
