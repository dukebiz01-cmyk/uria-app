import { query } from '../../config/db.js';
import { AppError } from '../../utils/AppError.js';
import logger from '../../utils/logger.js';

export async function submitReport(reporterId, { target_id, category, description }) {
  if (reporterId === target_id) throw new AppError('VALIDATION_ERROR', 'Cannot report yourself');
  const { rows: targetRows } = await query('SELECT id FROM users WHERE id = $1', [target_id]);
  if (!targetRows.length) throw new AppError('NOT_FOUND', 'Target user not found');

  // FIX #27: 동일 target 30일 내 중복 신고 차단 (어뷰징 방지)
  const { rows: dupRows } = await query(
    `SELECT id FROM reports
     WHERE reporter_id = $1 AND target_id = $2
       AND created_at > NOW() - INTERVAL '30 days'
     LIMIT 1`,
    [reporterId, target_id],
  );
  if (dupRows.length) {
    throw new AppError('VALIDATION_ERROR', 'You have already reported this user recently');
  }

  // 24시간 내 총 신고 3건 제한
  const { rows: recentRows } = await query(
    `SELECT COUNT(*) AS count FROM reports WHERE reporter_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [reporterId],
  );
  if (parseInt(recentRows[0].count) >= 3) throw new AppError('RATE_LIMIT_EXCEEDED', 'Too many reports submitted in the last 24 hours');

  const { rows } = await query(
    `INSERT INTO reports (reporter_id, target_id, category, description) VALUES ($1, $2, $3, $4) RETURNING *`,
    [reporterId, target_id, category, description],
  );
  logger.info({ reportId: rows[0].id, reporterId, target_id, category }, 'Report submitted');
  return rows[0];
}

export async function listReports({ status, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const params = [];
  let whereClause = '';
  if (status) {
    params.push(status);
    whereClause = `WHERE r.status = $${params.length}`;
  }
  params.push(limit, offset);
  const limitParam = `$${params.length - 1}`;
  const offsetParam = `$${params.length}`;

  const { rows } = await query(
    `SELECT r.*, u_rep.nickname AS reporter_nickname, u_tgt.nickname AS target_nickname
     FROM reports r
     JOIN users u_rep ON u_rep.id = r.reporter_id
     JOIN users u_tgt ON u_tgt.id = r.target_id
     ${whereClause}
     ORDER BY r.created_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );

  const countParams = [];
  let countWhere = '';
  if (status) {
    countParams.push(status);
    countWhere = `WHERE status = $1`;
  }
  const { rows: countRows } = await query(`SELECT COUNT(*) AS total FROM reports ${countWhere}`, countParams);

  return { items: rows, total: parseInt(countRows[0].total), page, limit };
}

export async function updateReportStatus(reportId, status) {
  const { rows } = await query(`UPDATE reports SET status = $1 WHERE id = $2 RETURNING *`, [status, reportId]);
  if (!rows.length) throw new AppError('NOT_FOUND', 'Report not found');

  // FIX #28: confirmed 시 target의 gender를 보고 적절한 metrics 테이블 업데이트
  if (status === 'confirmed') {
    const { rows: targetRows } = await query(
      `SELECT u.id, u.gender FROM users u
       JOIN reports r ON r.target_id = u.id
       WHERE r.id = $1`,
      [reportId],
    );
    if (targetRows.length) {
      const { id: targetId, gender } = targetRows[0];
      if (gender === 'F') {
        await query(
          `INSERT INTO passport_metrics (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
          [targetId],
        );
        await query(
          `UPDATE passport_metrics
           SET valid_report_count = valid_report_count + 1, updated_at = NOW()
           WHERE user_id = $1`,
          [targetId],
        );
      } else if (gender === 'M') {
        await query(
          `INSERT INTO reputation_metrics (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
          [targetId],
        );
        await query(
          `UPDATE reputation_metrics
           SET valid_report_count = valid_report_count + 1, updated_at = NOW()
           WHERE user_id = $1`,
          [targetId],
        );
      }
    }
  }
  return rows[0];
}
