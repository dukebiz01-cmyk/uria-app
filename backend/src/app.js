import express from 'express';
import pinoHttp from 'pino-http';
import logger from './utils/logger.js';

// Routers
import authRouter from './modules/auth/auth.router.js';
import usersRouter from './modules/users/users.router.js';
import signalsRouter from './modules/signals/signals.router.js';
import chatRouter from './modules/chat/chat.router.js';
import momentsRouter from './modules/moments/moments.router.js';
import coinsRouter from './modules/coins/coins.router.js';
import passportRouter from './modules/passport/passport.router.js';
import reportsRouter from './modules/reports/reports.router.js';
import adminRouter from './modules/admin/admin.router.js';

// Middleware
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// ============================================================
// CORS — GitHub Pages + 로컬 개발 허용
// ============================================================
const ALLOWED_ORIGINS = [
  'https://dukebiz01-cmyk.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ============================================================
// Body parsing
// Store raw body for webhook signature validation
// ============================================================
app.use((req, res, next) => {
  if (req.path === '/api/coins/webhook') {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      req.rawBody = raw;
      try {
        req.body = JSON.parse(raw);
      } catch {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ============================================================
// HTTP Request logging (pino-http)
// ============================================================
app.use(
  pinoHttp({
    logger,
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
      }),
    },
    // Don't log health checks
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
  }),
);

// ============================================================
// Security headers (minimal, add helmet in production)
// ============================================================
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ============================================================
// Health check
// ============================================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// API Routes
// ============================================================
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/signals', signalsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/moments', momentsRouter);
app.use('/api/coins', coinsRouter);
app.use('/api/passport', passportRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin', adminRouter);

// ============================================================
// 프론트엔드 편의 라우트
// ============================================================

// GET /api/passport/me → 내 passport (userId = req.user.id)
import { authenticate } from './middleware/auth.js';
import asyncHandler from './utils/asyncHandler.js';
import * as passportService from './modules/passport/passport.service.js';
import * as passportCalculator from './services/passport.calculator.js';
import { getBalance } from './services/wallet.service.js';

app.get('/api/passport/me', authenticate, asyncHandler(async (req, res) => {
  const result = await passportService.getPassport(req.user.id);
  res.json(result);
}));

// GET /api/reputation/me → 남성 score (passport calculator 재활용)
app.get('/api/reputation/me', authenticate, asyncHandler(async (req, res) => {
  const score = await passportCalculator.recalculateTrustScore(req.user.id);
  res.json({ score: score ?? 65, level: getRepLevel(score ?? 65) });
}));

function getRepLevel(s) {
  if (s >= 160) return '61°C+';
  if (s >= 100) return '46~60°C';
  if (s >= 40)  return '37~45°C';
  return '36.5°C';
}

// POST /api/match/list → 주변 유저 (users/nearby 래핑)
app.post('/api/match/list', authenticate, asyncHandler(async (req, res) => {
  const { lat, lng, radius_km = 5, page = 1, page_size = 20 } = req.body;
  const { default: usersService } = await import('./modules/users/users.service.js');
  const result = await usersService.getNearbyUsers(req.user.id, {
    lat: parseFloat(lat) || 37.5,
    lng: parseFloat(lng) || 127.0,
    radius_km: parseFloat(radius_km),
    page: parseInt(page),
    page_size: parseInt(page_size),
  });
  res.json(result);
}));

// ============================================================
// 404 handler
// ============================================================
app.use((req, res) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
    status: 404,
  });
});

// ============================================================
// Global error handler (must be last)
// ============================================================
app.use(errorHandler);

export default app;
