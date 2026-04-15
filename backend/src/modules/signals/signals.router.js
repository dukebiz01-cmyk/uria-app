import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate, validateBody, validateParams } from '../../middleware/validate.js';
import { apiRateLimiter, signalRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { createSignalSchema, respondSignalSchema, signalListQuerySchema, signalIdParamSchema } from './signals.schema.js';
import * as signalsService from './signals.service.js';

const router = Router();
router.use(authenticate);
router.use(apiRateLimiter);

router.post('/', signalRateLimiter, validateBody(createSignalSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await signalsService.sendSignal(req.user.id, req.body) });
}));

router.get('/', validate({ query: signalListQuerySchema }), asyncHandler(async (req, res) => {
  res.json({ data: await signalsService.listSignals(req.user.id, req.query) });
}));

router.get('/:id', validateParams(signalIdParamSchema), asyncHandler(async (req, res) => {
  res.json({ data: await signalsService.getSignal(req.user.id, req.params.id) });
}));

router.post('/:id/respond', validateParams(signalIdParamSchema), validateBody(respondSignalSchema), asyncHandler(async (req, res) => {
  res.json({ data: await signalsService.respondToSignal(req.user.id, req.params.id, req.body.action) });
}));

router.post('/:id/cancel', validateParams(signalIdParamSchema), asyncHandler(async (req, res) => {
  res.json({ data: await signalsService.cancelSignal(req.user.id, req.params.id) });
}));

export default router;
