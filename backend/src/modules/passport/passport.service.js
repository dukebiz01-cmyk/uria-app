import { query } from '../../config/db.js';
import { recalculateTrustScore } from '../../services/passport.calculator.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Get passport metrics for a user.
 * Creates a default record if none exists.
 */
export async function getPassport(userId) {
  // Verify user exists
  const { rows: userRows } = await query(
    'SELECT id, nickname, gender, selfie_verified FROM users WHERE id = $1 AND status = $2',
    [userId, 'active'],
  );
  if (!userRows.length) throw new AppError('NOT_FOUND', 'User not found');

  const user = userRows[0];

  // Get or init passport
  let { rows } = await query(
    'SELECT * FROM passport_metrics WHERE user_id = $1',
    [userId],
  );

  if (!rows.length) {
    // Create initial passport entry
    await query(
      'INSERT INTO passport_metrics (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [userId],
    );
    ({ rows } = await query(
      'SELECT * FROM passport_metrics WHERE user_id = $1',
      [userId],
    ));
  }

  const passport = rows[0];

  return {
    user: {
      id: user.id,
      nickname: user.nickname,
      gender: user.gender,
      selfie_verified: user.selfie_verified,
    },
    passport,
  };
}

/**
 * Trigger a trust score recalculation for a user.
 * Typically called after significant events (moment verified, report confirmed, etc.)
 */
export async function refreshPassport(userId) {
  return recalculateTrustScore(userId);
}
