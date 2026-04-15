import express from 'express';
import pinoHttp from 'pino-http';
import logger from './utils/logger.js';
import config from './config/index.js';

import authRouter from './modules/auth/auth.router.js';
import usersRouter from './modules/users/users.router.js';
import signalsRouter from './modules/signals/signals.router.js';
import chatRouter from './modules/chat/chat.router.js';
import momentsRouter from './modules/moments/moments.router.js';
import coinsRouter from './modules/coins/coins.router.js';
import passportRouter from './modules/passport/passport.router.js';
import reportsRouter from './modules/reports/reports.router.js';
import adminRouter from './modules/admin/admin.router.js';
import matchRouter from './modules/match/match.router.js';
import reputationRouter from './modules/reputation/reputation.router.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

const allowedOrigins = config.CORS_ORIGINS.split(',').map((v) => v.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowAll = allowedOrigins.includes('*');
  if (allowAll && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  if (origin) res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(204).send();
  next();
});

app.use((req, res, next) => {
  if (req.path === '/api/coins/webhook') {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      req.rawBody = raw;
      try { req.body = JSON.parse(raw); } catch { req.body = {}; }
      next();
    });
  } else {
    next();
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: { req: (req) => ({ method: req.method, url: req.url, userAgent: req.headers['user-agent'] }) },
  autoLogging: { ignore: (req) => req.url === '/health' },
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/match', matchRouter);
app.use('/api/signals', signalsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/moments', momentsRouter);
app.use('/api/coins', coinsRouter);
app.use('/api/passport', passportRouter);
app.use('/api/reputation', reputationRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin', adminRouter);

app.use((req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found`, status: 404 });
});

app.use(errorHandler);

export default app;
