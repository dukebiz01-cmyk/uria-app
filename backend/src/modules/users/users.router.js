import { Router } from 'express';
import { z } from 'zod';
import * as usersService from './users.service.js';
import { authenticate } from '../../middleware/auth.js';
import { validate, validateBody, validateParams } from '../../middleware/validate.js';
import { updateProfileSchema, updateLocationSchema, userListQuerySchema, userIdParamSchema } from './users.schema.js';
import { apiRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate);
router.use(apiRateLimiter);

const tonightSchema = z.object({ active: z.boolean() });
const selfieSchema = z.object({ selfie_photo_url: z.string().url() });
const pushTokenSchema = z.object({ token: z.string().min(1), platform: z.enum(['android', 'ios', 'web']), app_version: z.string().optional() });
const reportAliasSchema = z.object({ reason: z.string().min(1), details: z.string().max(500).optional() });

router.get('/me', asyncHandler(async (req, res) => {
  res.json({ data: await usersService.getMe(req.user.id) });
}));

router.patch('/me', validateBody(updateProfileSchema), asyncHandler(async (req, res) => {
  res.json({ data: await usersService.updateProfile(req.user.id, req.body) });
}));

router.patch('/me/location', validateBody(updateLocationSchema), asyncHandler(async (req, res) => {
  res.json({ data: await usersService.updateLocation(req.user.id, req.body) });
}));

router.post('/me/tonight', validateBody(tonightSchema), asyncHandler(async (req, res) => {
  res.json({ data: await usersService.toggleTonightMode(req.user.id, req.body) });
}));
router.post('/me/tonight-mode', validateBody(tonightSchema), asyncHandler(async (req, res) => {
  res.json({ data: await usersService.toggleTonightMode(req.user.id, req.body) });
}));

router.post('/me/selfie', validateBody(selfieSchema), asyncHandler(async (req, res) => {
  res.json({ data: await usersService.requestSelfieVerification(req.user.id, req.body.selfie_photo_url) });
}));

router.post('/me/push-token', validateBody(pushTokenSchema), asyncHandler(async (req, res) => {
  const { token, platform, app_version } = req.body;
  const { query } = await import('../../config/db.js');
  await query(
    `INSERT INTO push_tokens (user_id, raw_token, platform, app_version)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, raw_token) DO UPDATE SET updated_at = NOW(), app_version = EXCLUDED.app_version`,
    [req.user.id, token, platform, app_version || null],
  );
  res.json({ data: { registered: true } });
}));

router.get('/nearby', validate({ query: userListQuerySchema }), asyncHandler(async (req, res) => {
  const params = {
    lat: req.query.lat !== undefined ? Number(req.query.lat) : undefined,
    lng: req.query.lng !== undefined ? Number(req.query.lng) : undefined,
    radius_km: Number(req.query.radius_km),
    cursor: req.query.cursor,
    limit: Number(req.query.limit),
  };
  res.json({ data: await usersService.listUsers(req.user.id, params) });
}));

router.get('/:id', validateParams(userIdParamSchema), asyncHandler(async (req, res) => {
  res.json({ data: await usersService.getUser(req.user.id, req.params.id) });
}));

router.post('/:id/block', validateParams(userIdParamSchema), asyncHandler(async (req, res) => {
  res.json({ data: await usersService.blockUser(req.user.id, req.params.id) });
}));

router.post('/:id/report', validateParams(userIdParamSchema), validateBody(reportAliasSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await usersService.reportUser(req.user.id, req.params.id, req.body) });
}));

export default router;
