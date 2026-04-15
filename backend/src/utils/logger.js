import pino from 'pino';
import config from '../config/index.js';

const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.phone',
      'body.otp',
      '*.phone',
      '*.push_token',
      '*.push_token_hash',
      '*.private_key',
    ],
    censor: '[REDACTED]',
  },
  transport:
    config.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  base: { service: 'uria-backend', env: config.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
