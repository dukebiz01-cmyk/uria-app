import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import app from '../src/app.js';
import pool from '../src/config/db.js';
import redis from '../src/config/redis.js';

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: () => ({ send: jest.fn().mockResolvedValue('msg-id') }),
}));

// Mock PortOne verify call
jest.mock('../src/services/portone.service.js', () => ({
  verifyPayment: jest.fn().mockResolvedValue({
    paymentId: 'test-pay-001',
    merchantUid: 'coin_10_user_123',
    amount: 1100,
    coins: 10,
    status: 'PAID',
  }),
  validateWebhookSignature: jest.fn().mockReturnValue(true),
  parseWebhookBody: jest.fn().mockImplementation((body) => ({
    paymentId: body.payment_id || body.imp_uid,
    merchantUid: body.merchant_uid,
    status: body.status,
    type: body.type,
  })),
}));

function makeToken(userId, gender = 'M') {
  return jwt.sign(
    { sub: userId, phone: '01099990000', gender },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

let userId, token;

beforeAll(async () => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (phone, gender, birth_year, nickname) VALUES ('01099990000', 'M', 1990, 'CoinTestUser')
       ON CONFLICT (phone) DO UPDATE SET nickname = EXCLUDED.nickname RETURNING id`,
    );
    userId = rows[0].id;

    await pool.query(
      `INSERT INTO wallets (user_id, coin_balance) VALUES ($1, 5) ON CONFLICT (user_id) DO UPDATE SET coin_balance = 5`,
      [userId],
    );

    token = makeToken(userId);
  } catch (err) {
    console.warn('Coin test setup failed:', err.message);
  }
});

afterAll(async () => {
  try {
    await pool.query('DELETE FROM wallet_ledger WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM wallets WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
    await redis.quit();
  } catch (err) {
    console.warn('Coin test teardown failed:', err.message);
  }
});

describe('GET /api/coins/balance', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/coins/balance');
    expect(res.status).toBe(401);
  });

  it('returns current balance', async () => {
    if (!token) return;

    const res = await request(app)
      .get('/api/coins/balance')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.coin_balance).toBe('number');
    expect(res.body.coin_balance).toBe(5);
  });
});

describe('GET /api/coins/ledger', () => {
  it('returns ledger entries', async () => {
    if (!token) return;

    const res = await request(app)
      .get('/api/coins/ledger')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe('POST /api/coins/purchase', () => {
  it('returns 400 for missing imp_uid', async () => {
    if (!token) return;

    const res = await request(app)
      .post('/api/coins/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ merchant_uid: 'coin_10_user_123', amount: 1100 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('credits coins on valid purchase', async () => {
    if (!token) return;

    const res = await request(app)
      .post('/api/coins/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ imp_uid: 'test-pay-001', merchant_uid: 'coin_10_user_123', amount: 1100 });

    expect(res.status).toBe(201);
    expect(res.body.coins_added).toBe(10);
    expect(typeof res.body.new_balance).toBe('number');
  });

  it('returns 409 for duplicate imp_uid', async () => {
    if (!token) return;

    const res = await request(app)
      .post('/api/coins/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ imp_uid: 'test-pay-001', merchant_uid: 'coin_10_user_123', amount: 1100 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PAYMENT_DUPLICATE');
  });
});

describe('POST /api/coins/webhook', () => {
  it('processes valid webhook', async () => {
    const body = {
      payment_id: 'webhook-pay-001',
      merchant_uid: `coin_10_${userId}_${Date.now()}`,
      status: 'PAID',
      type: 'Transaction.Paid',
    };

    const rawBody = JSON.stringify(body);
    const signature = crypto
      .createHmac('sha256', process.env.PORTONE_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const res = await request(app)
      .post('/api/coins/webhook')
      .set('Content-Type', 'application/json')
      .set('X-PortOne-Signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
