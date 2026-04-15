import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate, validateBody } from '../../middleware/validate.js';
import { apiRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as coinsService from './coins.service.js';

const router = Router();

const purchaseSchema = z.object({ imp_uid: z.string().min(1), merchant_uid: z.string().min(1), amount: z.number().positive() });
const ledgerQuerySchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().min(1).max(50).default(20) });

router.get('/packages', authenticate, apiRateLimiter, asyncHandler(async (req, res) => {
  res.json({ data: coinsService.getPackages() });
}));

router.get('/balance', authenticate, apiRateLimiter, asyncHandler(async (req, res) => {
  const balance = await coinsService.getWalletBalance(req.user.id);
  res.json({ data: { ...balance, balance: balance.coin_balance } });
}));

router.get('/ledger', authenticate, apiRateLimiter, validate({ query: ledgerQuerySchema }), asyncHandler(async (req, res) => {
  res.json({ data: await coinsService.getLedger(req.user.id, req.query) });
}));
router.get('/transactions', authenticate, apiRateLimiter, validate({ query: ledgerQuerySchema }), asyncHandler(async (req, res) => {
  res.json({ data: await coinsService.getLedger(req.user.id, req.query) });
}));

router.post('/purchase', authenticate, apiRateLimiter, validateBody(purchaseSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await coinsService.purchaseCoins(req.user.id, req.body) });
}));

router.post('/webhook', asyncHandler(async (req, res) => {
  const signature = req.headers['x-portone-signature'] || req.headers['x-imp-webhookkey'];
  const rawBody = req.rawBody || JSON.stringify(req.body);
  res.json({ ok: true, ...(await coinsService.handleWebhook(rawBody, signature, req.body)) });
}));

export default router;
