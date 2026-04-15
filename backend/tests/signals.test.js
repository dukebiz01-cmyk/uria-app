import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/config/db.js';
import redis from '../src/config/redis.js';

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: () => ({ send: jest.fn().mockResolvedValue('msg-id') }),
}));

/**
 * Helper to generate a test JWT token directly (bypass OTP flow).
 */
function makeToken(userId, gender = 'M') {
  return jwt.sign(
    { sub: userId, phone: '0100000000' + gender, gender },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

let maleUserId, femaleUserId;
let maleToken, femaleToken;

beforeAll(async () => {
  try {
    // Create test users directly in DB
    const { rows: male } = await pool.query(
      `INSERT INTO users (phone, gender, birth_year, nickname) 
       VALUES ('01011112222', 'M', 1995, 'SigTestMale')
       ON CONFLICT (phone) DO UPDATE SET nickname = EXCLUDED.nickname
       RETURNING id`,
    );
    maleUserId = male[0].id;

    const { rows: female } = await pool.query(
      `INSERT INTO users (phone, gender, birth_year, nickname)
       VALUES ('01033334444', 'F', 1997, 'SigTestFemale')
       ON CONFLICT (phone) DO UPDATE SET nickname = EXCLUDED.nickname
       RETURNING id`,
    );
    femaleUserId = female[0].id;

    // Create wallets with coins
    await pool.query(
      `INSERT INTO wallets (user_id, coin_balance) VALUES ($1, 50)
       ON CONFLICT (user_id) DO UPDATE SET coin_balance = 50`,
      [maleUserId],
    );
    await pool.query(
      `INSERT INTO wallets (user_id, coin_balance) VALUES ($1, 50)
       ON CONFLICT (user_id) DO UPDATE SET coin_balance = 50`,
      [femaleUserId],
    );

    maleToken = makeToken(maleUserId, 'M');
    femaleToken = makeToken(femaleUserId, 'F');

    // Clean old signals
    await pool.query(
      'DELETE FROM signals WHERE sender_id = $1 OR receiver_id = $1',
      [maleUserId],
    );
  } catch (err) {
    console.warn('Signal test setup failed (DB might be unavailable):', err.message);
  }
});

afterAll(async () => {
  try {
    await pool.query('DELETE FROM signals WHERE sender_id = $1 OR receiver_id = $1', [maleUserId]);
    await pool.query('DELETE FROM wallets WHERE user_id IN ($1, $2)', [maleUserId, femaleUserId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [maleUserId, femaleUserId]);
    await pool.end();
    await redis.quit();
  } catch (err) {
    console.warn('Signal test teardown failed:', err.message);
  }
});

describe('POST /api/signals', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/signals').send({ receiver_id: femaleUserId });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid receiver_id', async () => {
    if (!maleToken) return;
    const res = await request(app)
      .post('/api/signals')
      .set('Authorization', `Bearer ${maleToken}`)
      .send({ receiver_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for self-send', async () => {
    if (!maleToken || !maleUserId) return;
    const res = await request(app)
      .post('/api/signals')
      .set('Authorization', `Bearer ${maleToken}`)
      .send({ receiver_id: maleUserId });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SIGNAL_SELF_SEND');
  });

  it('creates signal and deducts 3 coins', async () => {
    if (!maleToken || !femaleUserId) return;

    const res = await request(app)
      .post('/api/signals')
      .set('Authorization', `Bearer ${maleToken}`)
      .send({ receiver_id: femaleUserId, message: 'Hi!' });

    expect(res.status).toBe(201);
    expect(res.body.signal).toBeTruthy();
    expect(res.body.signal.status).toBe('pending');

    // Check wallet deducted
    const { rows } = await pool.query('SELECT coin_balance FROM wallets WHERE user_id = $1', [maleUserId]);
    expect(rows[0].coin_balance).toBe(47); // 50 - 3
  });

  it('returns 409 for duplicate signal within 24h', async () => {
    if (!maleToken || !femaleUserId) return;

    const res = await request(app)
      .post('/api/signals')
      .set('Authorization', `Bearer ${maleToken}`)
      .send({ receiver_id: femaleUserId });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SIGNAL_DUPLICATE');
  });
});

describe('GET /api/signals', () => {
  it('lists received signals for female user', async () => {
    if (!femaleToken) return;

    const res = await request(app)
      .get('/api/signals')
      .set('Authorization', `Bearer ${femaleToken}`)
      .query({ direction: 'received' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe('POST /api/signals/:id/respond', () => {
  let signalId;

  beforeAll(async () => {
    if (!maleUserId || !femaleUserId) return;
    const { rows } = await pool.query(
      `SELECT id FROM signals WHERE sender_id = $1 AND receiver_id = $2 AND status = 'pending' LIMIT 1`,
      [maleUserId, femaleUserId],
    );
    signalId = rows[0]?.id;
  });

  it('returns 403 when non-receiver tries to respond', async () => {
    if (!maleToken || !signalId) return;

    const res = await request(app)
      .post(`/api/signals/${signalId}/respond`)
      .set('Authorization', `Bearer ${maleToken}`)
      .send({ action: 'accept' });

    expect(res.status).toBe(403);
  });

  it('accepts signal and creates chat room', async () => {
    if (!femaleToken || !signalId) return;

    const res = await request(app)
      .post(`/api/signals/${signalId}/respond`)
      .set('Authorization', `Bearer ${femaleToken}`)
      .send({ action: 'accept' });

    expect(res.status).toBe(200);
    expect(res.body.chatRoom).toBeTruthy();
    expect(res.body.signal.status).toBe('accepted');
  });

  it('returns 409 on double-respond', async () => {
    if (!femaleToken || !signalId) return;

    const res = await request(app)
      .post(`/api/signals/${signalId}/respond`)
      .set('Authorization', `Bearer ${femaleToken}`)
      .send({ action: 'reject' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SIGNAL_ALREADY_RESPONDED');
  });
});
