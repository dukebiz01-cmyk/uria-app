import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validateParams } from '../../middleware/validate.js';
import { apiRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as reputationService from './reputation.service.js';

const router = Router();
router.use(authenticate);
router.use(apiRateLimiter);

router.get('/me', asyncHandler(async (req, res) => {
  const result = await reputationService.getReputation(req.user.id);
  res.json({ data: result.reputation });
}));

router.get('/:userId', validateParams(z.object({ userId: z.string().uuid() })), asyncHandler(async (req, res) => {
  const result = await reputationService.getReputation(req.params.userId);
  res.json({ data: result });
}));

export default router;
