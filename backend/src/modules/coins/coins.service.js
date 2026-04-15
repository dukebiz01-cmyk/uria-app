import * as coinsRepo from './coins.repository.js';
import { getBalance, creditCoins } from '../../services/wallet.service.js';
import { verifyPayment, validateWebhookSignature, parseWebhookBody, listCoinPackages } from '../../services/portone.service.js';
import { AppError } from '../../utils/AppError.js';
import logger from '../../utils/logger.js';

export async function getWalletBalance(userId) {
  return getBalance(userId);
}

export async function getLedger(userId, queryParams) {
  const { cursor, limit = 20 } = queryParams;
  const entries = await coinsRepo.getLedger(userId, { cursor, limit: parseInt(limit) + 1 });
  const hasMore = entries.length > parseInt(limit);
  const items = hasMore ? entries.slice(0, parseInt(limit)) : entries;
  const nextCursor = hasMore ? items[items.length - 1].created_at : null;
  return { items, pagination: { has_more: hasMore, next_cursor: nextCursor } };
}

export function getPackages() {
  return listCoinPackages();
}

export async function purchaseCoins(userId, { imp_uid, merchant_uid, amount }) {
  const idempotencyKey = `purchase:${imp_uid}`;
  const existing = await coinsRepo.findLedgerByIdempotencyKey(idempotencyKey);
  if (existing) return { coins_added: 0, new_balance: existing.balance_after, payment_id: imp_uid, duplicated: true };
  const paymentInfo = await verifyPayment(imp_uid, merchant_uid, amount);
  const result = await creditCoins(userId, paymentInfo.coins, 'purchase', 'payment', null, idempotencyKey);
  logger.info({ userId, coins: paymentInfo.coins, paymentId: imp_uid }, 'Coin purchase processed');
  return { coins_added: paymentInfo.coins, new_balance: result.newBalance, payment_id: imp_uid, package_code: paymentInfo.package_code };
}

export async function handleWebhook(rawBody, signature, body) {
  if (!validateWebhookSignature(rawBody, signature)) throw new AppError('FORBIDDEN', 'Invalid webhook signature');
  const { paymentId, merchantUid, status, type } = parseWebhookBody(body);
  if (status !== 'PAID' && type !== 'Transaction.Paid') return { processed: false };
  const idempotencyKey = `purchase:${paymentId}`;
  const existing = await coinsRepo.findLedgerByIdempotencyKey(idempotencyKey);
  if (existing) return { processed: false, reason: 'duplicate' };
  const parts = merchantUid.split('_');
  const userId = parts[2];
  if (!userId) return { processed: false, reason: 'unknown_user' };
  const paymentInfo = await verifyPayment(paymentId, merchantUid, body.total_amount || body.amount?.total);
  await creditCoins(userId, paymentInfo.coins, 'purchase', 'payment', null, idempotencyKey);
  logger.info({ userId, paymentId, coins: paymentInfo.coins }, 'Webhook: coins credited');
  return { processed: true, coins: paymentInfo.coins };
}
