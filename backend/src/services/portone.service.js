import axios from 'axios';
import crypto from 'crypto';
import config from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * PortOne v2 REST API service.
 * Handles payment verification and webhook signature validation.
 */

const portoneApi = axios.create({
  baseURL: config.PORTONE_BASE_URL,
  headers: {
    Authorization: `PortOne ${config.PORTONE_API_SECRET}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

/**
 * Coin packages: maps merchant_uid prefix to { coins, amountKRW }
 * In production, fetch from DB/config
 */
const COIN_PACKAGES = {
  'coin_10': { coins: 10, amountKRW: 1100 },
  'coin_30': { coins: 30, amountKRW: 3300 },
  'coin_50': { coins: 50, amountKRW: 5500 },
  'coin_100': { coins: 100, amountKRW: 9900 },
};

/**
 * Verify a PortOne payment by payment_id (imp_uid in v1 / payment_id in v2).
 * Returns { amount, status, coins } if valid.
 *
 * @param {string} paymentId - PortOne payment ID
 * @param {string} merchantUid - Our merchant order ID
 * @param {number} expectedAmount - Expected amount in KRW
 */
export async function verifyPayment(paymentId, merchantUid, expectedAmount) {
  try {
    const { data } = await portoneApi.get(`/payments/${paymentId}`);

    logger.info({ paymentId, merchantUid, status: data.status }, 'PortOne payment fetched');

    // Check payment status
    if (data.status !== 'PAID') {
      throw new AppError('PAYMENT_INVALID', `Payment status is ${data.status}, expected PAID`);
    }

    // Verify amount matches
    if (data.amount.total !== expectedAmount) {
      logger.error(
        { paymentId, expected: expectedAmount, actual: data.amount.total },
        'Payment amount mismatch',
      );
      // In production, cancel the payment here
      throw new AppError(
        'PAYMENT_INVALID',
        `Amount mismatch: expected ${expectedAmount}, got ${data.amount.total}`,
      );
    }

    // Determine coins based on merchant_uid
    const packageKey = Object.keys(COIN_PACKAGES).find((k) => merchantUid.startsWith(k));
    if (!packageKey) {
      throw new AppError('PAYMENT_INVALID', `Unknown package for merchant_uid: ${merchantUid}`);
    }

    const pkg = COIN_PACKAGES[packageKey];
    if (pkg.amountKRW !== expectedAmount) {
      throw new AppError('PAYMENT_INVALID', 'Merchant UID amount mismatch');
    }

    return {
      paymentId,
      merchantUid,
      amount: data.amount.total,
      coins: pkg.coins,
      status: data.status,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, paymentId }, 'PortOne API error');
    throw new AppError('PAYMENT_INVALID', 'Could not verify payment with PortOne');
  }
}

/**
 * Validate PortOne webhook signature.
 * PortOne v2 sends HMAC-SHA256 signature in X-PortOne-Signature header.
 *
 * @param {string} rawBody - Raw request body as string
 * @param {string} signature - From X-PortOne-Signature header
 * @returns {boolean}
 */
export function validateWebhookSignature(rawBody, signature) {
  if (!config.PORTONE_WEBHOOK_SECRET) {
    logger.warn('PORTONE_WEBHOOK_SECRET not configured — skipping signature validation');
    return true;
  }

  const expected = crypto
    .createHmac('sha256', config.PORTONE_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
  } catch {
    return false;
  }
}

/**
 * Parse webhook body and extract payment info.
 * PortOne v2 webhook structure.
 *
 * @param {object} body - Parsed webhook body
 * @returns {{ paymentId: string, merchantUid: string, status: string }}
 */
export function parseWebhookBody(body) {
  return {
    paymentId: body.payment_id || body.imp_uid,
    merchantUid: body.merchant_uid || body.order_id,
    status: body.status,
    type: body.type,
  };
}
