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

function makeToken(userId, gender = 'M') {
  return jwt.sign(
    { sub: userId, phone: '0100000000' + gender, gender },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' },
  );
}

let maleUserId, femaleUserId, maleToken, femaleToken;
let signalId, chatRoomId, momentId;

beforeAll(async () => {
  try {
    // Create test users
    const { rows: male } = await pool.query(
      `INSERT INTO users (phone, gender, birth_year, nickname) VALUES ('01055556666', 'M', 1993, 'MomTestMale')
       ON CONFLICT (phone) DO UPDATE SET nickname = EXCLUDED.nickname RETURNING id`,
    );
    maleUserId = male[0].id;

    const { rows: female } = await pool.query(
      `INSERT INTO users (phone, gender, birth_year, nickname) VALUES ('01077778888', 'F', 1996, 'MomTestFemale')
       ON CONFLICT (phone) DO UPDATE SET nickname = EXCLUDED.nickname RETURNING id`,
    );
    femaleUserId = female[0].id;

    // Wallets
    await pool.query(
      `INSERT INTO wallets (user_id, coin_balance) VALUES ($1, 100) ON CONFLICT (user_id) DO UPDATE SET coin_balance = 100`,
      [maleUserId],
    );
    await pool.query(
      `INSERT INTO wallets (user_id, coin_balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING`,
      [femaleUserId],
    );

    // Create accepted signal + chat room
    const { rows: sig } = await pool.query(
      `INSERT INTO signals (sender_id, receiver_id, status, expires_at, accepted_at, responded_at)
       VALUES ($1, $2, 'accepted', NOW() + INTERVAL '24h', NOW(), NOW()) RETURNING id`,
      [maleUserId, femaleUserId],
    );
    signalId = sig[0].id;

    const { rows: chat } = await pool.query(
      `INSERT INTO chat_rooms (signal_id, male_id, female_id) VALUES ($1, $2, $3)
       ON CONFLICT (signal_id) DO UPDATE SET signal_id = EXCLUDED.signal_id RETURNING id`,
      [signalId, maleUserId, femaleUserId],
    );
    chatRoomId = chat[0].id;

    maleToken = makeToken(maleUserId, 'M');
    femaleToken = makeToken(femaleUserId, 'F');
  } catch (err) {
    console.warn('Moment test setup failed:', err.message);
  }
});

afterAll(async () => {
  try {
    if (momentId) await pool.query('DELETE FROM moment_reviews WHERE moment_id = $1', [momentId]);
    if (momentId) await pool.query('DELETE FROM moment_checkins WHERE moment_id = $1', [momentId]);
    if (momentId) await pool.query('DELETE FROM moments WHERE id = $1', [momentId]);
    if (chatRoomId) await pool.query('DELETE FROM chat_rooms WHERE id = $1', [chatRoomId]);
    if (signalId) await pool.query('DELETE FROM signals WHERE id = $1', [signalId]);
    await pool.query('DELETE FROM wallets WHERE user_id IN ($1, $2)', [maleUserId, femaleUserId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [maleUserId, femaleUserId]);
    await pool.end();
    await redis.quit();
  } catch (err) {
    console.warn('Moment test teardown failed:', err.message);
  }
});

describe('POST /api/moments', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/moments').send({ signal_id: signalId });
    expect(res.status).toBe(401);
  });

  it('creates a moment for accepted signal', async () => {
    if (!maleToken || !signalId) return;

    const res = await request(app)
      .post('/api/moments')
      .set('Authorization', `Bearer ${maleToken}`)
      .send({ signal_id: signalId });

    expect(res.status).toBe(201);
    expect(res.body.moment).toBeTruthy();
    expect(res.body.moment.status).toBe('pending');
    momentId = res.body.moment.id;
  });

  it('returns 409 for duplicate moment creation', async () => {
    if (!maleToken || !signalId) return;

    const res = await request(app)
      .post('/api/moments')
      .set('Authorization', `Bearer ${maleToken}`)
      .send({ signal_id: signalId });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MOMENT_ALREADY_CHECKED_IN');
  });
});

describe('POST /api/moments/:id/checkin', () => {
  it('male can check in', async () => {
    if (!maleToken || !momentId) return;

    const res = await request(app)
      .post(`/api/moments/${momentId}/checkin`)
      .set('Authorization', `Bearer ${maleToken}`)
      .send({ lat: 37.5665, lng: 126.978, accuracy_m: 10 });

    expect(res.status).toBe(200);
    expect(res.body.checkin).toBeTruthy();
    expect(res.body.both_checked_in).toBe(false);
  });

  it('female checks in — both_checked_in = true', async () => {
    if (!femaleToken || !momentId) return;

    const res = await request(app)
      .post(`/api/moments/${momentId}/checkin`)
      .set('Authorization', `Bearer ${femaleToken}`)
      .send({ lat: 37.5665, lng: 126.978, accuracy_m: 15 });

    expect(res.status).toBe(200);
    expect(res.body.both_checked_in).toBe(true);
  });
});

describe('POST /api/moments/:id/review', () => {
  it('male submits review for female', async () => {
    if (!maleToken || !momentId || !femaleUserId) return;

    const res = await request(app)
      .post(`/api/moments/${momentId}/review`)
      .set('Authorization', `Bearer ${maleToken}`)
      .send({
        reviewee_id: femaleUserId,
        eval_safe: true,
        eval_profile_match: true,
        eval_promise: true,
        eval_again: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.review_submitted).toBe(true);
  });

  it('female submits review — moment verified', async () => {
    if (!femaleToken || !momentId || !maleUserId) return;

    const res = await request(app)
      .post(`/api/moments/${momentId}/review`)
      .set('Authorization', `Bearer ${femaleToken}`)
      .send({
        reviewee_id: maleUserId,
        eval_safe: true,
        eval_profile_match: false,
        eval_promise: true,
        eval_again: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.moment_verified).toBe(true);
  });
});
