import { query } from '../config/db.js';
import logger from '../utils/logger.js';

/**
 * Trust Score formula:
 *   trust_score =
 *     response_rate  * 0.20 +
 *     promise_rate   * 0.25 +
 *     moment_score   * 0.35 +
 *     profile_score  * 0.10 +
 *     activity_score * 0.10 -
 *     risk_penalty
 *
 * Each rate uses temporal weighting:
 *   recent_30d * 0.5 + recent_90d * 0.3 + all_time * 0.2
 *
 * risk_penalty = valid_report_count * 3 + no_show_count * 5
 */

const WEIGHTS = {
  response_rate: 0.20,
  promise_rate: 0.25,
  moment_score: 0.35,
  profile_score: 0.10,
  activity_score: 0.10,
};

const TEMPORAL = { d30: 0.5, d90: 0.3, all: 0.2 };

/**
 * Calculate temporal weighted rate from 3 values.
 */
function temporalWeight(d30, d90, all) {
  return d30 * TEMPORAL.d30 + d90 * TEMPORAL.d90 + all * TEMPORAL.all;
}

/**
 * Determine tier from trust_score.
 */
function getTier(score) {
  if (score >= 80) return 'Platinum';
  if (score >= 60) return 'Gold';
  if (score >= 40) return 'Silver';
  return 'Starter';
}

/**
 * Calculate response rate for a user.
 * response_rate = accepted / total_received signals (where sender exists)
 */
async function calculateResponseRate(userId) {
  const now = new Date();
  const d30 = new Date(now - 30 * 24 * 3600 * 1000);
  const d90 = new Date(now - 90 * 24 * 3600 * 1000);

  const calc = async (since) => {
    const { rows } = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE responded_at IS NOT NULL) AS responded,
        COUNT(*) AS total
       FROM signals 
       WHERE receiver_id = $1 
         AND status NOT IN ('cancelled','expired')
         AND created_at >= $2`,
      [userId, since],
    );
    const { responded, total } = rows[0];
    return total > 0 ? (responded / total) * 100 : 0;
  };

  const [r30, r90, rAll] = await Promise.all([
    calc(d30),
    calc(d90),
    calc(new Date(0)),
  ]);

  return temporalWeight(r30, r90, rAll);
}

/**
 * Calculate promise_rate: moments created / signals accepted by user.
 */
async function calculatePromiseRate(userId) {
  const now = new Date();
  const d30 = new Date(now - 30 * 24 * 3600 * 1000);
  const d90 = new Date(now - 90 * 24 * 3600 * 1000);

  const calc = async (since) => {
    // Signals where user accepted (receiver accepted or sender accepted)
    const { rows } = await query(
      `SELECT
        COUNT(*) FILTER (WHERE m.id IS NOT NULL) AS with_moment,
        COUNT(*) AS total
       FROM signals s
       LEFT JOIN moments m ON m.signal_id = s.id
       WHERE (s.receiver_id = $1 OR s.sender_id = $1)
         AND s.status = 'accepted'
         AND s.accepted_at >= $2`,
      [userId, since],
    );
    const { with_moment, total } = rows[0];
    return total > 0 ? (with_moment / total) * 100 : 0;
  };

  const [r30, r90, rAll] = await Promise.all([
    calc(d30),
    calc(d90),
    calc(new Date(0)),
  ]);

  return temporalWeight(r30, r90, rAll);
}

/**
 * Calculate moment_score based on verified moments.
 * Score: (verified moments / total moments involving user) * 100
 */
async function calculateMomentScore(userId) {
  const now = new Date();
  const d30 = new Date(now - 30 * 24 * 3600 * 1000);
  const d90 = new Date(now - 90 * 24 * 3600 * 1000);

  const calc = async (since) => {
    const { rows } = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'verified') AS verified,
        COUNT(*) AS total
       FROM moments
       WHERE (male_id = $1 OR female_id = $1)
         AND created_at >= $2`,
      [userId, since],
    );
    const { verified, total } = rows[0];
    return total > 0 ? (verified / total) * 100 : 0;
  };

  const [r30, r90, rAll] = await Promise.all([
    calc(d30),
    calc(d90),
    calc(new Date(0)),
  ]);

  return temporalWeight(r30, r90, rAll);
}

/**
 * Calculate profile_score: selfie_verified + profile completeness.
 */
async function calculateProfileScore(userId) {
  const { rows } = await query(
    `SELECT 
      selfie_verified,
      profile_photo_url IS NOT NULL AS has_photo,
      bio IS NOT NULL AND length(bio) > 20 AS has_bio,
      nickname IS NOT NULL AS has_nickname
     FROM users WHERE id = $1`,
    [userId],
  );
  if (!rows.length) return 0;
  const u = rows[0];

  let score = 0;
  if (u.selfie_verified) score += 50;
  if (u.has_photo) score += 20;
  if (u.has_bio) score += 20;
  if (u.has_nickname) score += 10;
  return score;
}

/**
 * Recalculate and persist trust score for a user.
 *
 * @param {string} userId
 * @returns {{ trust_score: number, tier: string }}
 */
export async function recalculateTrustScore(userId) {
  try {
    const [responseRate, promiseRate, momentScore, profileScore, passportRow] =
      await Promise.all([
        calculateResponseRate(userId),
        calculatePromiseRate(userId),
        calculateMomentScore(userId),
        calculateProfileScore(userId),
        query('SELECT * FROM passport_metrics WHERE user_id = $1', [userId]),
      ]);

    const passport = passportRow.rows[0] || {};
    const activityScore = parseFloat(passport.activity_score) || 0;
    const validReportCount = parseInt(passport.valid_report_count) || 0;
    const noShowCount = parseInt(passport.no_show_count) || 0;

    const riskPenalty = validReportCount * 3 + noShowCount * 5;

    const rawScore =
      responseRate * WEIGHTS.response_rate +
      promiseRate * WEIGHTS.promise_rate +
      momentScore * WEIGHTS.moment_score +
      profileScore * WEIGHTS.profile_score +
      activityScore * WEIGHTS.activity_score -
      riskPenalty;

    const trustScore = Math.max(0, Math.min(100, parseFloat(rawScore.toFixed(2))));
    const tier = getTier(trustScore);
    const verifiedCount = (await query(
      `SELECT COUNT(*) FROM moments WHERE (male_id = $1 OR female_id = $1) AND status = 'verified'`,
      [userId],
    )).rows[0].count;

    // Upsert passport_metrics
    await query(
      `INSERT INTO passport_metrics 
        (user_id, trust_score, tier, response_rate, promise_rate, moment_verified_count, activity_score, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
        trust_score = EXCLUDED.trust_score,
        tier = EXCLUDED.tier,
        response_rate = EXCLUDED.response_rate,
        promise_rate = EXCLUDED.promise_rate,
        moment_verified_count = EXCLUDED.moment_verified_count,
        activity_score = EXCLUDED.activity_score,
        updated_at = NOW()`,
      [userId, trustScore, tier, responseRate.toFixed(2), promiseRate.toFixed(2), parseInt(verifiedCount), activityScore],
    );

    logger.info({ userId, trustScore, tier }, 'Trust score recalculated');
    return { trust_score: trustScore, tier };
  } catch (err) {
    logger.error({ err, userId }, 'Trust score calculation failed');
    throw err;
  }
}
