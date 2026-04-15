import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate, validateBody, validateParams } from '../../middleware/validate.js';
import { apiRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';
import {
  createMomentSchema,
  checkinSchema,
  reviewSchema,
  momentIdParamSchema,
} from './moments.schema.js';
import * as momentsService from './moments.service.js';

const router = Router();

router.use(authenticate);
router.use(apiRateLimiter);

/**
 * POST /api/moments
 * Create a moment (date request)
 */
router.post(
  '/',
  validateBody(createMomentSchema),
  asyncHandler(async (req, res) => {
    const moment = await momentsService.createMoment(req.user.id, req.body);
    res.status(201).json({ moment });
  }),
);

/**
 * GET /api/moments/:id
 */
router.get(
  '/:id',
  validateParams(momentIdParamSchema),
  asyncHandler(async (req, res) => {
    const moment = await momentsService.getMoment(req.user.id, req.params.id);
    res.json({ moment });
  }),
);

/**
 * POST /api/moments/:id/checkin
 * GPS check-in
 */
router.post(
  '/:id/checkin',
  validateParams(momentIdParamSchema),
  validateBody(checkinSchema),
  asyncHandler(async (req, res) => {
    const result = await momentsService.checkinMoment(req.user.id, req.params.id, req.body);
    res.json(result);
  }),
);

/**
 * POST /api/moments/:id/review
 * Submit post-date review
 */
router.post(
  '/:id/review',
  validateParams(momentIdParamSchema),
  validateBody(reviewSchema),
  asyncHandler(async (req, res) => {
    const result = await momentsService.submitReview(req.user.id, req.params.id, req.body);
    res.json(result);
  }),
);

export default router;
