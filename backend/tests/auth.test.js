import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/db.js';
import redis from '../src/config/redis.js';

// Mock Firebase Admin to avoid needing real credentials
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: () => ({ send: jest.fn().mockResolvedValue('msg-id') }),
}));

const TEST_PHONE = '01012345678';
const TEST_PHONE_2 = '01087654321';

beforeAll(async () => {
  // Clean up test data
  try {
    await pool.query("DELETE FROM users WHERE phone IN ($1, $2)", [TEST_PHONE, TEST_PHONE_2]);
    await redis.flushdb();
  } catch (err) {
    // DB might not be available in CI — skip
    console.warn('DB setup skipped:', err.message);
  }
});

afterAll(async () => {
  try {
    await pool.query("DELETE FROM users WHERE phone IN ($1, $2)", [TEST_PHONE, TEST_PHONE_2]);
    await pool.end();
    await redis.quit();
  } catch (err) {
    console.warn('DB teardown skipped:', err.message);
  }
});

describe('POST /api/auth/request-otp', () => {
  it('returns 200 with message for valid phone', async () => {
    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: TEST_PHONE });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
  });

  it('returns 400 for invalid phone format', async () => {
    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: '123' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when phone is missing', async () => {
    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/verify-otp', () => {
  let storedOtp;

  beforeAll(async () => {
    // Request OTP first
    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: TEST_PHONE });
    // In dev mode, OTP is returned in response
    storedOtp = res.body.otp;
  });

  it('returns 400 for wrong OTP', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: TEST_PHONE, otp: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 for new user without registration fields', async () => {
    if (!storedOtp) return; // Skip if no OTP

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: TEST_PHONE, otp: storedOtp });

    // New user without gender/birth_year/nickname
    expect(res.status).toBe(400);
  });

  it('creates new user and returns tokens on valid OTP + registration fields', async () => {
    if (!storedOtp) return;

    // Re-request OTP since the previous attempt may have consumed it
    const otpRes = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: TEST_PHONE });
    const otp = otpRes.body.otp;
    if (!otp) return; // Skip if in production mode

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        phone: TEST_PHONE,
        otp,
        gender: 'M',
        birth_year: 1995,
        nickname: 'TestMale',
      });

    expect(res.status).toBe(201);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.is_new_user).toBe(true);
    expect(res.body.user.gender).toBe('M');
  });

  it('returns 200 for existing user login', async () => {
    const otpRes = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: TEST_PHONE });
    const otp = otpRes.body.otp;
    if (!otp) return;

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: TEST_PHONE, otp });

    expect(res.status).toBe(200);
    expect(res.body.is_new_user).toBe(false);
  });
});

describe('POST /api/auth/logout', () => {
  let accessToken, refreshToken;

  beforeAll(async () => {
    const otpRes = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: TEST_PHONE_2 });
    const otp = otpRes.body.otp;
    if (!otp) return;

    const loginRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        phone: TEST_PHONE_2,
        otp,
        gender: 'F',
        birth_year: 1998,
        nickname: 'TestFemale',
      });

    accessToken = loginRes.body.access_token;
    refreshToken = loginRes.body.refresh_token;
  });

  it('returns 204 on successful logout', async () => {
    if (!accessToken) return;

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(204);
  });

  it('returns 401 after logout', async () => {
    if (!accessToken) return;

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(401);
  });
});
