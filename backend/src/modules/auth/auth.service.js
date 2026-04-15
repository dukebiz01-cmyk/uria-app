import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../../config/index.js';
import redis from '../../config/redis.js';
import { query } from '../../config/db.js';
import { AppError } from '../../utils/AppError.js';
import logger from '../../utils/logger.js';

const OTP_TTL_SECONDS = 300; // 5 minutes
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600; // 30 days

/**
 * Generate a 6-digit OTP and store in Redis.
 * In production, this would call KMC PASS API to send the actual SMS.
 *
 * @param {string} phone - Korean phone number
 * @returns {{ otp: string }} - In prod, don't return OTP
 */
export async function requestOtp(phone) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const key = `otp:${phone}`;

  // Throttle: max 3 OTP requests per 10 minutes per phone
  const attempts = await redis.incr(`otp_attempts:${phone}`);
  if (attempts === 1) {
    await redis.expire(`otp_attempts:${phone}`, 600);
  }
  if (attempts > 3) {
    throw new AppError('RATE_LIMIT_EXCEEDED', 'Too many OTP requests. Try again in 10 minutes.');
  }

  await redis.setex(key, OTP_TTL_SECONDS, otp);

  // TODO: Call KMC PASS API here
  // await kmcPassService.sendSms(phone, otp);

  logger.info({ phone: phone.replace(/.(?=.{4})/g, '*') }, 'OTP sent');

  // In development, return OTP for testing
  if (config.NODE_ENV !== 'production') {
    return { message: 'OTP sent', otp };
  }
  return { message: 'OTP sent to your phone number' };
}

/**
 * Verify OTP, create user if new, and issue JWT tokens.
 *
 * @param {object} params
 * @returns {{ access_token: string, refresh_token: string, user: object, is_new_user: boolean }}
 */
export async function verifyOtp({ phone, otp, gender, birth_year, nickname }) {
  const key = `otp:${phone}`;
  const storedOtp = await redis.get(key);

  if (!storedOtp || storedOtp !== otp) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired OTP');
  }

  // Consume OTP (one-time use)
  await redis.del(key);
  await redis.del(`otp_attempts:${phone}`);

  // Find or create user
  let { rows } = await query('SELECT * FROM users WHERE phone = $1', [phone]);
  let isNewUser = false;

  if (!rows.length) {
    // New user — require registration fields
    if (!gender || !birth_year || !nickname) {
      throw new AppError(
        'VALIDATION_ERROR',
        'New users must provide gender, birth_year, and nickname',
      );
    }

    // Create user + wallet in one go
    const result = await query(
      `WITH new_user AS (
        INSERT INTO users (phone, gender, birth_year, nickname)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      ),
      wallet AS (
        INSERT INTO wallets (user_id)
        SELECT id FROM new_user
      )
      SELECT * FROM new_user`,
      [phone, gender, birth_year, nickname],
    );
    rows = result.rows;
    isNewUser = true;
    logger.info({ userId: rows[0].id }, 'New user created');
  }

  const user = rows[0];

  if (user.status === 'banned' || user.status === 'suspended') {
    throw new AppError('FORBIDDEN', `Account is ${user.status}`);
  }

  // Update last_active_at
  await query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [user.id]);

  const { access_token, refresh_token } = issueTokens(user);

  // Store refresh token in Redis
  await redis.setex(
    `refresh:${refresh_token}`,
    REFRESH_TOKEN_TTL_SECONDS,
    user.id,
  );

  return {
    access_token,
    refresh_token,
    is_new_user: isNewUser,
    user: sanitizeUser(user),
  };
}

/**
 * Refresh access token using a valid refresh token.
 */
export async function refreshAccessToken(refreshToken) {
  const userId = await redis.get(`refresh:${refreshToken}`);
  if (!userId) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!rows.length) {
    throw new AppError('UNAUTHORIZED', 'User not found');
  }

  const user = rows[0];
  if (user.status === 'banned' || user.status === 'suspended') {
    throw new AppError('FORBIDDEN', `Account is ${user.status}`);
  }

  const { access_token } = issueTokens(user);
  return { access_token };
}

/**
 * Logout: revoke refresh token and blacklist access token.
 */
export async function logout(refreshToken, accessToken) {
  // Remove refresh token
  await redis.del(`refresh:${refreshToken}`);

  // Blacklist access token (until it expires)
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken);
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redis.setex(`blacklist:${accessToken}`, ttl, '1');
        }
      }
    } catch {
      // Ignore decode errors
    }
  }
}

function issueTokens(user) {
  const payload = {
    sub: user.id,
    phone: user.phone,
    gender: user.gender,
  };

  const access_token = jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN,
  });

  const refresh_token = jwt.sign(
    { sub: user.id, type: 'refresh', jti: crypto.randomUUID() },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_EXPIRES_IN },
  );

  return { access_token, refresh_token };
}

export function sanitizeUser(user) {
  const { phone, ...safe } = user;
  return safe;
}
