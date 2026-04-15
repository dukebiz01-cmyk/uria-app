import express from 'express';
import * as usersService from './users.service.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { body } from 'express-validator';
import { query } from '../../config/db.js';

const router = express.Router();

// 프로필 조회
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await usersService.getMe(req.user.id);
    res.json({ data: user });
  } catch (e) { next(e); }
});

// 프로필 수정
router.patch('/me', authenticate,
  validate([
    body('nickname').optional().isLength({ min: 1, max: 20 }),
    body('bio').optional().isLength({ max: 300 }),
  ]),
  async (req, res, next) => {
    try {
      const user = await usersService.updateMe(req.user.id, req.body);
      res.json({ data: user });
    } catch (e) { next(e); }
  },
);

// Tonight Mode 토글
router.post('/me/tonight', authenticate,
  validate([body('active').isBoolean()]),
  async (req, res, next) => {
    try {
      const result = await usersService.toggleTonightMode(req.user.id, req.body);
      res.json({ data: result });
    } catch (e) { next(e); }
  },
);

// 셀피 인증 요청
router.post('/me/selfie', authenticate,
  validate([body('selfie_photo_url').isURL()]),
  async (req, res, next) => {
    try {
      await usersService.requestSelfieVerification(req.user.id, req.body.selfie_photo_url);
      res.json({ data: { status: 'pending_review' } });
    } catch (e) { next(e); }
  },
);

// ✅ BUG2 수정: push token 등록 (raw token)
router.post('/me/push-token', authenticate,
  validate([
    body('token').isString().notEmpty(),
    body('platform').isIn(['android', 'ios', 'web']),
  ]),
  async (req, res, next) => {
    try {
      const { token, platform, app_version } = req.body;
      await query(
        `INSERT INTO push_tokens (user_id, raw_token, platform, app_version)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, raw_token) DO UPDATE
         SET updated_at = NOW(), app_version = EXCLUDED.app_version`,
        [req.user.id, token, platform, app_version || null],
      );
      res.json({ data: { registered: true } });
    } catch (e) { next(e); }
  },
);

// 주변 유저 리스트 (Tonight Mode 활성 유저)
router.get('/nearby', authenticate, async (req, res, next) => {
  try {
    const { lat, lng, radius_km = 5, page = 1, page_size = 20 } = req.query;
    const users = await usersService.getNearbyUsers(req.user.id, {
      lat: parseFloat(lat), lng: parseFloat(lng),
      radius_km: parseFloat(radius_km),
      page: parseInt(page), page_size: parseInt(page_size),
    });
    res.json({ data: users });
  } catch (e) { next(e); }
});

export default router;
