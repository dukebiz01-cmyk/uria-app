import { query } from '../config/db.js';
import logger from '../utils/logger.js';

const WEIGHTS = {
  no_show_rate: 0.35,
  moment_score: 0.35,
  activity_score: 0.10,
  profile_score: 0.10,
  report_penalty: 0.10,
};

function temporalWeight(r30, r90, rAll) {
  return r30 * 0.5 + r90 * 0.3 + rAll * 0.2;
}

function getLevel(score) {
  if (score >= 85) return 'Platinum';
  if (score >= 65) return 'Gold';
  if (score >= 40) return 'Silver';
  return 'Bronze';
}

async function calculateNoShowRate(userId) {
  const calc = async (since) => {
    const { rows } = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'verified') AS verified,
              COUNT(*) FILTER (WHERE status IN ('verified','expired','rejected')) AS total
       FROM moments
       WHERE male_id = $1 AND created_at >= $2`,
      [userId, since],
    );
    const verified = Number(rows[0].verified || 0);
    const total = Number(rows[0].total || 0);
    return total > 0 ? (verified / total) * 100 : 100;
  };
  const now = Date.now();
  return temporalWeight(
    await calc(new Date(now - 30*24*3600*1000)),
    await calc(new Date(now - 90*24*3600*1000)),
    await calc(new Date(0)),
  );
}

async function calculateMomentScore(userId) {
  const calc = async (since) => {
    const { rows } = await query(
      `SELECT AVG(((CASE WHEN eval_safe THEN 1 ELSE 0 END) +
                   (CASE WHEN eval_profile_match THEN 1 ELSE 0 END) +
                   (CASE WHEN eval_promise THEN 1 ELSE 0 END) +
                   (CASE WHEN eval_again THEN 1 ELSE 0 END)) / 4.0) * 100 AS score
       FROM moment_reviews
       WHERE reviewee_id = $1 AND created_at >= $2`,
      [userId, since],
    );
    return Number(rows[0].score || 0);
  };
  const now = Date.now();
  return temporalWeight(
    await calc(new Date(now - 30*24*3600*1000)),
    await calc(new Date(now - 90*24*3600*1000)),
    await calc(new Date(0)),
  );
}

async function calculateActivityScore(userId) {
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE tonight_on = TRUE) AS tonight_active,
            COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '7 days') AS recent_active
     FROM users WHERE id = $1`,
    [userId],
  );
  const recent = Number(rows[0].recent_active || 0) ? 60 : 0;
  const tonight = Number(rows[0].tonight_active || 0) ? 40 : 0;
  return recent + tonight;
}

async function calculateProfileScore(userId) {
  const { rows } = await query(
    `SELECT 
      selfie_verified,
      (profile_photo_url IS NOT NULL) AS has_photo,
      (bio IS NOT NULL AND length(bio) > 20) AS has_bio
     FROM users WHERE id = $1`,
    [userId],
  );
  if (!rows.length) return 0;
  const u = rows[0];
  let score = 0;
  if (u.selfie_verified) score += 50;
  if (u.has_photo) score += 30;
  if (u.has_bio) score += 20;
  return score;
}

export async function recalculateReputationScore(userId) {
  const [noShowRate, momentScore, activityScore, profileScore, reports, verifiedCount] = await Promise.all([
    calculateNoShowRate(userId),
    calculateMomentScore(userId),
    calculateActivityScore(userId),
    calculateProfileScore(userId),
    query(`SELECT COUNT(*) AS count FROM reports WHERE target_id = $1 AND status = 'confirmed'`, [userId]),
    query(`SELECT COUNT(*) AS count FROM moments WHERE male_id = $1 AND status = 'verified'`, [userId]),
  ]);

  const reportCount = Number(reports.rows[0].count || 0);
  const repScore = Math.max(0, Math.min(100,
    noShowRate * WEIGHTS.no_show_rate +
    momentScore * WEIGHTS.moment_score +
    activityScore * WEIGHTS.activity_score +
    profileScore * WEIGHTS.profile_score -
    reportCount * 5,
  ));

  const level = getLevel(repScore);
  const verified = Number(verifiedCount.rows[0].count || 0);

  await query(
    `INSERT INTO reputation_metrics (user_id, rep_score, level, no_show_rate, chat_quality_score, moment_verified_count, valid_report_count, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       rep_score = EXCLUDED.rep_score,
       level = EXCLUDED.level,
       no_show_rate = EXCLUDED.no_show_rate,
       chat_quality_score = EXCLUDED.chat_quality_score,
       moment_verified_count = EXCLUDED.moment_verified_count,
       valid_report_count = EXCLUDED.valid_report_count,
       updated_at = NOW()`,
    [userId, repScore.toFixed(2), level, noShowRate.toFixed(2), momentScore.toFixed(2), verified, reportCount],
  );

  logger.info({ userId, repScore, level }, 'Reputation recalculated');
  return { rep_score: Number(repScore.toFixed(2)), level };
}
