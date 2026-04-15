import { query } from '../../config/db.js';
import { recalculateReputationScore } from '../../services/reputation.calculator.js';
import { AppError } from '../../utils/AppError.js';

export async function getReputation(userId) {
  const { rows: userRows } = await query('SELECT id, nickname, gender, selfie_verified FROM users WHERE id = $1', [userId]);
  if (!userRows.length) throw new AppError('NOT_FOUND', 'User not found');

  let { rows } = await query('SELECT * FROM reputation_metrics WHERE user_id = $1', [userId]);
  if (!rows.length) {
    await query('INSERT INTO reputation_metrics (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    ({ rows } = await query('SELECT * FROM reputation_metrics WHERE user_id = $1', [userId]));
  }

  return {
    user: userRows[0],
    reputation: {
      ...rows[0],
      score: rows[0].rep_score,
      moment_count: rows[0].moment_verified_count,
      report_count: rows[0].valid_report_count,
    },
  };
}

export async function refreshReputation(userId) {
  return recalculateReputationScore(userId);
}
