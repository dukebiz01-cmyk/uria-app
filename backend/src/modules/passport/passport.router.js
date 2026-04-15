import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validateParams } from '../../middleware/validate.js';
import { apiRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as passportService from './passport.service.js';

const router = Router();

router.use(authenticate);
router.use(apiRateLimiter);

/**
 * GET /api/passport/:userId
 * Get trust passport for any user
 */
router.get(
  '/:userId',
  validateParams(z.object({ userId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const result = await passportService.getPassport(req.params.userId);
    res.json(result);
  }),
);

export default router;
