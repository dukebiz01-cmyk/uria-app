import axios from 'axios';
import crypto from 'crypto';
import config from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

const portoneApi = axios.create({
  baseURL: config.PORTONE_BASE_URL,
  headers: { Authorization: `PortOne ${config.PORTONE_API_SECRET}`, 'Content-Type': 'application/json' },
  timeout: 10000,
});

export const COIN_PACKAGES = {
  coin_10: { code: 'c10', coins: 10, amountKRW: 1900 },
  coin_30: { code: 'c30', coins: 30, amountKRW: 4900 },
  coin_100: { code: 'c100', coins: 100, amountKRW: 12900 },
};

export function listCoinPackages() {
  return Object.values(COIN_PACKAGES).map((pkg) => ({ code: pkg.code, coins: pkg.coins, amount: pkg.amountKRW }));
}

export async function verifyPayment(paymentId, merchantUid, expectedAmount) {
  try {
    const { data } = await portoneApi.get(`/payments/${paymentId}`);
    if (data.status !== 'PAID') throw new AppError('PAYMENT_INVALID', `Payment status is ${data.status}, expected PAID`);
    if (Number(data.amount?.total) !== Number(expectedAmount)) throw new AppError('PAYMENT_INVALID', `Amount mismatch: expected ${expectedAmount}, got ${data.amount?.total}`);
    const packageKey = Object.keys(COIN_PACKAGES).find((k) => merchantUid.startsWith(k));
    if (!packageKey) throw new AppError('PAYMENT_INVALID', `Unknown package for merchant_uid: ${merchantUid}`);
    const pkg = COIN_PACKAGES[packageKey];
    if (pkg.amountKRW !== Number(expectedAmount)) throw new AppError('PAYMENT_INVALID', 'Merchant UID amount mismatch');
    return { paymentId, merchantUid, amount: Number(data.amount.total), coins: pkg.coins, package_code: pkg.code, status: data.status };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, paymentId }, 'PortOne API error');
    throw new AppError('PAYMENT_INVALID', 'Could not verify payment with PortOne');
  }
}

export function validateWebhookSignature(rawBody, signature) {
  if (!config.PORTONE_WEBHOOK_SECRET) {
    // FIX #15: fail-closed in production. Demo only allows when explicitly dev.
    if (config.NODE_ENV === 'production') {
      logger.error('PORTONE_WEBHOOK_SECRET not configured in production — webhook rejected');
      return false;
    }
    logger.warn('PORTONE_WEBHOOK_SECRET not set — webhook accepted (dev mode only)');
    return true;
  }
  if (!signature) return false;
  try {
    const expected = crypto.createHmac('sha256', config.PORTONE_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf-8');
    const sigBuf = Buffer.from(signature, 'utf-8');
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}

export function parseWebhookBody(body) {
  return {
    paymentId: body.payment_id || body.imp_uid,
    merchantUid: body.merchant_uid || body.order_id,
    status: body.status,
    type: body.type,
  };
}
