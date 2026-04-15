import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { apiRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as reportsService from './reports.service.js';

const router = Router();

router.use(authenticate);
router.use(apiRateLimiter);

const reportSchema = z.object({
  target_id: z.string().uuid(),
  category: z.enum(['fake_profile', 'no_show', 'harassment', 'fraud', 'other']),
  description: z.string().max(500).optional(),
});

/**
 * POST /api/reports
 * Submit a report against another user
 */
router.post(
  '/',
  validateBody(reportSchema),
  asyncHandler(async (req, res) => {
    const report = await reportsService.submitReport(req.user.id, req.body);
    res.status(201).json({ report });
  }),
);

export default router;
