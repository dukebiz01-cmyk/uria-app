import Redis from 'ioredis';
import config from './index.js';
import logger from '../utils/logger.js';

const redis = new Redis(config.REDIS_URL, {
  keyPrefix: config.REDIS_KEY_PREFIX,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  reconnectOnError: (err) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ENOTFOUND'];
    return targetErrors.some((e) => err.message.includes(e));
  },
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting'));

export default redis;
