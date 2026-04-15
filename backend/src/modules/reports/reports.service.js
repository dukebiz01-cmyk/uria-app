import { query } from '../../config/db.js';
import { AppError } from '../../utils/AppError.js';
import logger from '../../utils/logger.js';

const VALID_CATEGORIES = ['fake_profile', 'no_show', 'harassment', 'fraud', 'other'];

/**
 * Submit a report against another user.
 * Throttle: max 3 reports per user per 24h.
 */
export async function submitReport(reporterId, { target_id, category, description }) {
  if (reporterId === target_id) {
    throw new AppError('VALIDATION_ERROR', 'Cannot report yourself');
  }

  // Check target exists
  const { rows: targetRows } = await query(
    'SELECT id FROM users WHERE id = $1',
    [target_id],
  );
  if (!targetRows.length) throw new AppError('NOT_FOUND', 'Target user not found');

  // Rate limit: 3 reports per 24h per reporter
  const { rows: recentRows } = await query(
    `SELECT COUNT(*) AS count FROM reports 
     WHERE reporter_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [reporterId],
  );
  if (parseInt(recentRows[0].count) >= 3) {
    throw new AppError('RATE_LIMIT_EXCEEDED', 'Too many reports submitted in the last 24 hours');
  }

  const { rows } = await query(
    `INSERT INTO reports (reporter_id, target_id, category, description)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [reporterId, target_id, category, description],
  );

  logger.info({ reportId: rows[0].id, reporterId, target_id, category }, 'Report submitted');
  return rows[0];
}

/**
 * List reports (admin only).
 */
export async function listReports({ status, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const params = [limit, offset];
  let whereClause = '';

  if (status) {
    whereClause = 'WHERE r.status = $3';
    params.push(status);
  }

  const { rows } = await query(
    `SELECT r.*, 
            u_rep.nickname AS reporter_nickname,
            u_tgt.nickname AS target_nickname
     FROM reports r
     JOIN users u_rep ON u_rep.id = r.reporter_id
     JOIN users u_tgt ON u_tgt.id = r.target_id
     ${whereClause}
     ORDER BY r.created_at DESC
     LIMIT $1 OFFSET $2`,
    params,
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*) AS total FROM reports ${whereClause}`,
    status ? [status] : [],
  );

  return {
    items: rows,
    total: parseInt(countRows[0].total),
    page,
    limit,
  };
}

/**
 * Update report status (admin only).
 */
export async function updateReportStatus(reportId, status) {
  const { rows } = await query(
    `UPDATE reports SET status = $1 WHERE id = $2 RETURNING *`,
    [status, reportId],
  );
  if (!rows.length) throw new AppError('NOT_FOUND', 'Report not found');

  // If confirmed, increment valid_report_count on target
  if (status === 'confirmed') {
    await query(
      `UPDATE passport_metrics 
       SET valid_report_count = valid_report_count + 1, updated_at = NOW()
       WHERE user_id = (SELECT target_id FROM reports WHERE id = $1)`,
      [reportId],
    );
  }

  return rows[0];
}
