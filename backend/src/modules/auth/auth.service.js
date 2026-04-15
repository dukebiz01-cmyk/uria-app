import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../../config/index.js';
import redis from '../../config/redis.js';
import { query, withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/AppError.js';
import logger from '../../utils/logger.js';

const OTP_TTL_SECONDS = 300;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600;
const SIGNUP_BONUS_COINS = 5; // FIX #26: 신규 가입 보너스

export async function requestOtp(phone) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const key = `otp:${phone}`;
  const attempts = await redis.incr(`otp_attempts:${phone}`);
  if (attempts === 1) await redis.expire(`otp_attempts:${phone}`, 600);
  if (attempts > 3) throw new AppError('RATE_LIMIT_EXCEEDED', 'Too many OTP requests. Try again in 10 minutes.');
  await redis.setex(key, OTP_TTL_SECONDS, otp);
  logger.info({ phone: phone.replace(/.(?=.{4})/g, '*') }, 'OTP sent');
  if (config.NODE_ENV !== 'production') return { message: 'OTP sent', otp };
  return { message: 'OTP sent to your phone number' };
}

export async function verifyOtp({ phone, otp, gender, birth_year, nickname }) {
  const key = `otp:${phone}`;
  const storedOtp = await redis.get(key);
  if (!storedOtp || storedOtp !== otp) throw new AppError('UNAUTHORIZED', 'Invalid or expired OTP');

  await redis.del(key);
  await redis.del(`otp_attempts:${phone}`);

  let { rows } = await query('SELECT * FROM users WHERE phone = $1', [phone]);
  let isNewUser = false;

  if (!rows.length) {
    if (!gender || !birth_year || !nickname) {
      throw new AppError('VALIDATION_ERROR', 'New users must provide gender, birth_year, and nickname');
    }
    // FIX #3: explicit transaction (CTE side-effects not guaranteed by PG)
    // FIX #26: signup bonus coins
    rows = await withTransaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO users (phone, gender, birth_year, nickname)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [phone, gender, birth_year, nickname],
      );
      const newUser = userResult.rows[0];
      await client.query(
        `INSERT INTO wallets (user_id, coin_balance) VALUES ($1, $2)`,
        [newUser.id, SIGNUP_BONUS_COINS],
      );
      // ledger entry for the bonus
      await client.query(
        `INSERT INTO wallet_ledger
           (user_id, asset_type, entry_type, amount, balance_after, ref_type, idempotency_key)
         VALUES ($1, 'coin', 'reward', $2, $2, 'signup', $3)`,
        [newUser.id, SIGNUP_BONUS_COINS, `signup_bonus:${newUser.id}`],
      );
      if (gender === 'F') {
        await client.query(
          `INSERT INTO passport_metrics (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
          [newUser.id],
        );
      } else if (gender === 'M') {
        await client.query(
          `INSERT INTO reputation_metrics (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
          [newUser.id],
        );
      }
      return [newUser];
    });
    isNewUser = true;
    logger.info({ userId: rows[0].id, gender, bonus: SIGNUP_BONUS_COINS }, 'New user created with signup bonus');
  }

  const user = rows[0];
  if (user.status === 'banned' || user.status === 'suspended') throw new AppError('FORBIDDEN', `Account is ${user.status}`);

  await query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [user.id]);

  const { access_token, refresh_token } = issueTokens(user);
  await redis.setex(`refresh:${refresh_token}`, REFRESH_TOKEN_TTL_SECONDS, user.id);

  return {
    access_token,
    refresh_token,
    accessToken: access_token,
    refreshToken: refresh_token,
    is_new_user: isNewUser,
    isNewUser,
    user: sanitizeUser(user),
  };
}

export async function refreshAccessToken(refreshToken) {
  const userId = await redis.get(`refresh:${refreshToken}`);
  if (!userId) throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token');
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!rows.length) throw new AppError('UNAUTHORIZED', 'User not found');
  const user = rows[0];
  if (user.status === 'banned' || user.status === 'suspended') throw new AppError('FORBIDDEN', `Account is ${user.status}`);
  const { access_token, refresh_token } = issueTokens(user);
  await redis.setex(`refresh:${refresh_token}`, REFRESH_TOKEN_TTL_SECONDS, user.id);
  await redis.del(`refresh:${refreshToken}`);
  return { access_token, refresh_token, accessToken: access_token, refreshToken: refresh_token };
}

export async function logout(refreshToken, accessToken) {
  await redis.del(`refresh:${refreshToken}`);
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken);
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) await redis.setex(`blacklist:${accessToken}`, ttl, '1');
      }
    } catch {}
  }
}

function issueTokens(user) {
  const payload = { sub: user.id, phone: user.phone, gender: user.gender };
  const access_token = jwt.sign(payload, config.JWT_ACCESS_SECRET, { expiresIn: config.JWT_ACCESS_EXPIRES_IN });
  const refresh_token = jwt.sign({ sub: user.id, type: 'refresh', jti: crypto.randomUUID() }, config.JWT_REFRESH_SECRET, { expiresIn: config.JWT_REFRESH_EXPIRES_IN });
  return { access_token, refresh_token };
}

export function sanitizeUser(user) {
  const { phone, ...safe } = user;
  return safe;
}
