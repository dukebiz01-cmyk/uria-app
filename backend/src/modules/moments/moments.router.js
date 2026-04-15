import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { apiRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { createMomentSchema, checkinSchema, reviewSchema, momentIdParamSchema } from './moments.schema.js';
import * as momentsService from './moments.service.js';

const router = Router();
router.use(authenticate);
router.use(apiRateLimiter);

router.post('/', validateBody(createMomentSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await momentsService.createMoment(req.user.id, req.body) });
}));

router.get('/:id', validateParams(momentIdParamSchema), asyncHandler(async (req, res) => {
  res.json({ data: await momentsService.getMoment(req.user.id, req.params.id) });
}));

router.post('/:id/checkin', validateParams(momentIdParamSchema), validateBody(checkinSchema), asyncHandler(async (req, res) => {
  res.json({ data: await momentsService.checkinMoment(req.user.id, req.params.id, req.body) });
}));

router.post('/:id/review', validateParams(momentIdParamSchema), validateBody(reviewSchema), asyncHandler(async (req, res) => {
  res.json({ data: await momentsService.submitReview(req.user.id, req.params.id, req.body) });
}));

export default router;
