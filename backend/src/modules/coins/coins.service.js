import * as coinsRepo from './coins.repository.js';
import { getBalance, creditCoins } from '../../services/wallet.service.js';
import { verifyPayment, validateWebhookSignature, parseWebhookBody } from '../../services/portone.service.js';
import { AppError } from '../../utils/AppError.js';
import logger from '../../utils/logger.js';

export async function getWalletBalance(userId) {
  return getBalance(userId);
}

export async function getLedger(userId, queryParams) {
  const { cursor, limit = 20 } = queryParams;
  const entries = await coinsRepo.getLedger(userId, {
    cursor,
    limit: parseInt(limit) + 1,
  });

  const hasMore = entries.length > parseInt(limit);
  const items = hasMore ? entries.slice(0, parseInt(limit)) : entries;
  const nextCursor = hasMore ? items[items.length - 1].created_at : null;

  return {
    items,
    pagination: { has_more: hasMore, next_cursor: nextCursor },
  };
}

/**
 * Process a coin purchase after payment verification.
 *
 * @param {string} userId
 * @param {{ imp_uid: string, merchant_uid: string, amount: number }} body
 */
export async function purchaseCoins(userId, { imp_uid, merchant_uid, amount }) {
  const idempotencyKey = `purchase:${imp_uid}`;

  // Check for duplicate
  const existing = await coinsRepo.findLedgerByIdempotencyKey(idempotencyKey);
  if (existing) {
    throw new AppError('PAYMENT_DUPLICATE');
  }

  // Verify payment with PortOne
  const paymentInfo = await verifyPayment(imp_uid, merchant_uid, amount);

  // Credit coins
  const result = await creditCoins(
    userId,
    paymentInfo.coins,
    'purchase',
    'payment',
    null,
    idempotencyKey,
  );

  logger.info(
    { userId, coins: paymentInfo.coins, paymentId: imp_uid },
    'Coin purchase processed',
  );

  return {
    coins_added: paymentInfo.coins,
    new_balance: result.newBalance,
    payment_id: imp_uid,
  };
}

/**
 * Handle PortOne webhook.
 * Validates signature, prevents duplicates via idempotency key.
 *
 * @param {string} rawBody - Raw request body string
 * @param {string} signature - X-PortOne-Signature header
 * @param {object} body - Parsed body
 */
export async function handleWebhook(rawBody, signature, body) {
  // Validate webhook signature
  if (!validateWebhookSignature(rawBody, signature)) {
    logger.warn('PortOne webhook signature validation failed');
    throw new AppError('FORBIDDEN', 'Invalid webhook signature');
  }

  const { paymentId, merchantUid, status, type } = parseWebhookBody(body);

  logger.info({ paymentId, merchantUid, status, type }, 'PortOne webhook received');

  // Only process completed payments
  if (status !== 'PAID' && type !== 'Transaction.Paid') {
    logger.info({ status, type }, 'Webhook: non-payment event, ignoring');
    return { processed: false };
  }

  const idempotencyKey = `purchase:${paymentId}`;
  const existing = await coinsRepo.findLedgerByIdempotencyKey(idempotencyKey);
  if (existing) {
    logger.info({ paymentId }, 'Webhook: duplicate payment, ignoring');
    return { processed: false, reason: 'duplicate' };
  }

  // We need to find which user made this payment.
  // The merchant_uid should encode user info: e.g. "coin_10_userId_timestamp"
  // Extract userId from merchant_uid
  const parts = merchantUid.split('_');
  // Expected format: "coin_10_<userId>_<timestamp>"
  // Or simply look up by some stored pending payment record.
  // Here we use a simplified lookup — in production, maintain a payments table.
  const userId = parts[2]; // coin_10_<userId>_<ts>

  if (!userId) {
    logger.error({ merchantUid }, 'Could not extract userId from merchant_uid');
    return { processed: false, reason: 'unknown_user' };
  }

  // Verify with PortOne API
  try {
    const paymentInfo = await verifyPayment(paymentId, merchantUid, body.total_amount || body.amount?.total);
    await creditCoins(userId, paymentInfo.coins, 'purchase', 'payment', null, idempotencyKey);
    logger.info({ userId, paymentId, coins: paymentInfo.coins }, 'Webhook: coins credited');
    return { processed: true, coins: paymentInfo.coins };
  } catch (err) {
    logger.error({ err, paymentId }, 'Webhook: payment processing failed');
    throw err;
  }
}
