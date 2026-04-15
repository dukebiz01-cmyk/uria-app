import redis from '../config/redis.js';
import logger from './logger.js';

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

/**
 * Check if an idempotency key has been used.
 * Returns cached response if found, otherwise sets a processing lock.
 *
 * Usage pattern:
 *   const cached = await checkIdempotency(key);
 *   if (cached) return res.status(cached.status).json(cached.body);
 *   // ... process ...
 *   await saveIdempotencyResult(key, { status: 200, body: result });
 *
 * @param {string} key - Idempotency key
 * @returns {object|null} Cached { status, body } or null
 */
export async function checkIdempotency(key) {
  try {
    const data = await redis.get(`idempotency:${key}`);
    if (data) {
      logger.info({ key }, 'Idempotency cache hit');
      return JSON.parse(data);
    }
    return null;
  } catch (err) {
    logger.error({ err, key }, 'Idempotency check failed');
    return null; // Fail open — allow processing
  }
}

/**
 * Save the result of a successfully processed idempotent request.
 *
 * @param {string} key - Idempotency key
 * @param {{ status: number, body: object }} result
 */
export async function saveIdempotencyResult(key, result) {
  try {
    await redis.setex(
      `idempotency:${key}`,
      IDEMPOTENCY_TTL_SECONDS,
      JSON.stringify(result),
    );
  } catch (err) {
    logger.error({ err, key }, 'Idempotency save failed');
  }
}

/**
 * Generate an idempotency key from components.
 * @param {...string} parts
 * @returns {string}
 */
export function makeIdempotencyKey(...parts) {
  return parts.join(':');
}
