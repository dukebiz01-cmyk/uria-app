import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate, validateBody } from '../../middleware/validate.js';
import { apiRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as coinsService from './coins.service.js';

const router = Router();

const purchaseSchema = z.object({
  imp_uid: z.string().min(1),
  merchant_uid: z.string().min(1),
  amount: z.number().positive(),
});

const ledgerQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

/**
 * GET /api/coins/balance
 */
router.get(
  '/balance',
  authenticate,
  apiRateLimiter,
  asyncHandler(async (req, res) => {
    const balance = await coinsService.getWalletBalance(req.user.id);
    res.json(balance);
  }),
);

/**
 * GET /api/coins/ledger
 */
router.get(
  '/ledger',
  authenticate,
  apiRateLimiter,
  validate({ query: ledgerQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await coinsService.getLedger(req.user.id, req.query);
    res.json(result);
  }),
);

/**
 * POST /api/coins/purchase
 * Verify PortOne payment and credit coins
 */
router.post(
  '/purchase',
  authenticate,
  apiRateLimiter,
  validateBody(purchaseSchema),
  asyncHandler(async (req, res) => {
    const result = await coinsService.purchaseCoins(req.user.id, req.body);
    res.status(201).json(result);
  }),
);

/**
 * POST /api/coins/webhook
 * PortOne payment webhook (no auth — signature verified internally)
 * NOTE: This route must have raw body access (configured in app.js)
 */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-portone-signature'] || req.headers['x-imp-webhookkey'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const result = await coinsService.handleWebhook(rawBody, signature, req.body);
    res.json({ ok: true, ...result });
  }),
);

export default router;
