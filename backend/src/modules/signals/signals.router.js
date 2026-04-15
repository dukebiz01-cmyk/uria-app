import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate, validateBody, validateParams } from '../../middleware/validate.js';
import { apiRateLimiter, signalRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';
import {
  createSignalSchema,
  respondSignalSchema,
  signalListQuerySchema,
  signalIdParamSchema,
} from './signals.schema.js';
import * as signalsService from './signals.service.js';

const router = Router();

router.use(authenticate);
router.use(apiRateLimiter);

/**
 * POST /api/signals
 * Send a new signal
 */
router.post(
  '/',
  signalRateLimiter,
  validateBody(createSignalSchema),
  asyncHandler(async (req, res) => {
    const signal = await signalsService.sendSignal(req.user.id, req.body);
    res.status(201).json({ signal });
  }),
);

/**
 * GET /api/signals
 * List signals (cursor paginated)
 */
router.get(
  '/',
  validate({ query: signalListQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await signalsService.listSignals(req.user.id, req.query);
    res.json(result);
  }),
);

/**
 * GET /api/signals/:id
 * Get a specific signal
 */
router.get(
  '/:id',
  validateParams(signalIdParamSchema),
  asyncHandler(async (req, res) => {
    const signal = await signalsService.getSignal(req.user.id, req.params.id);
    res.json({ signal });
  }),
);

/**
 * POST /api/signals/:id/respond
 * Accept, reject, or hold a signal
 */
router.post(
  '/:id/respond',
  validateParams(signalIdParamSchema),
  validateBody(respondSignalSchema),
  asyncHandler(async (req, res) => {
    const result = await signalsService.respondToSignal(
      req.user.id,
      req.params.id,
      req.body.action,
    );
    res.json(result);
  }),
);

/**
 * POST /api/signals/:id/cancel
 * Cancel a sent signal
 */
router.post(
  '/:id/cancel',
  validateParams(signalIdParamSchema),
  asyncHandler(async (req, res) => {
    const result = await signalsService.cancelSignal(req.user.id, req.params.id);
    res.json(result);
  }),
);

export default router;
