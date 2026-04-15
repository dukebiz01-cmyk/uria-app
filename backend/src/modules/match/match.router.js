import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { apiRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as usersService from '../users/users.service.js';

const router = Router();
router.use(authenticate);
router.use(apiRateLimiter);

const matchListSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radius_km: z.number().min(1).max(50).default(10),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(50).default(20),
});

router.post('/list', validateBody(matchListSchema), asyncHandler(async (req, res) => {
  const result = await usersService.listUsers(req.user.id, req.body);
  res.json({ data: result });
}));

export default router;
