import { query, withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/AppError.js';
import { creditCoins } from '../../services/wallet.service.js';
import { recalculateTrustScore } from '../../services/passport.calculator.js';
import { updateReportStatus } from '../reports/reports.service.js';
import logger from '../../utils/logger.js';

/**
 * List users with pagination.
 */
export async function listUsers({ status, page = 1, limit = 20 }) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [parseInt(limit), offset];
  let whereClause = '';

  if (status) {
    whereClause = 'WHERE status = $3';
    params.push(status);
  }

  const { rows } = await query(
    `SELECT id, phone, gender, birth_year, nickname, status, 
            selfie_verified, tonight_on, created_at, last_active_at
     FROM users ${whereClause}
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    params,
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*) AS total FROM users ${whereClause}`,
    status ? [status] : [],
  );

  return {
    items: rows,
    total: parseInt(countRows[0].total),
    page: parseInt(page),
    limit: parseInt(limit),
  };
}

/**
 * Update user status (suspend, ban, unsuspend, etc.)
 */
export async function updateUserStatus(adminId, userId, { status, reason }) {
  const validStatuses = ['active', 'resting', 'suspended', 'banned'];
  if (!validStatuses.includes(status)) {
    throw new AppError('VALIDATION_ERROR', `Invalid status: ${status}`);
  }

  const { rows } = await query(
    'UPDATE users SET status = $1 WHERE id = $2 RETURNING *',
    [status, userId],
  );
  if (!rows.length) throw new AppError('NOT_FOUND', 'User not found');

  // Log moderation action
  const actionType = status === 'banned' ? 'ban'
    : status === 'suspended' ? 'suspend'
    : status === 'active' ? 'unsuspend'
    : 'warn';

  await query(
    `INSERT INTO moderation_actions (admin_id, target_id, action_type, reason)
     VALUES ($1, $2, $3, $4)`,
    [adminId, userId, actionType, reason],
  );

  logger.info({ adminId, userId, status, action: actionType }, 'Admin: user status updated');
  return rows[0];
}

/**
 * Get reports list.
 */
export async function getReports({ status, page = 1, limit = 20 }) {
  const { listReports } = await import('../reports/reports.service.js');
  return listReports({ status, page, limit });
}

/**
 * Take a moderation action.
 */
export async function moderateUser(adminId, {
  target_id,
  action_type,
  reason,
  payload = {},
}) {
  const validActions = ['warn', 'suspend', 'ban', 'unsuspend', 'refund', 'adjust_score'];
  if (!validActions.includes(action_type)) {
    throw new AppError('VALIDATION_ERROR', `Invalid action_type: ${action_type}`);
  }

  await withTransaction(async (client) => {
    // Apply the action
    if (action_type === 'suspend') {
      await client.query('UPDATE users SET status = $1 WHERE id = $2', ['suspended', target_id]);
    } else if (action_type === 'ban') {
      await client.query('UPDATE users SET status = $1 WHERE id = $2', ['banned', target_id]);
    } else if (action_type === 'unsuspend') {
      await client.query('UPDATE users SET status = $1 WHERE id = $2', ['active', target_id]);
    } else if (action_type === 'refund' && payload.coins) {
      await creditCoins(
        target_id,
        payload.coins,
        'refund',
        'moderation',
        null,
        `admin_refund:${target_id}:${Date.now()}`,
        client,
      );
    } else if (action_type === 'adjust_score' && payload.valid_report_count !== undefined) {
      await client.query(
        `UPDATE passport_metrics 
         SET valid_report_count = $1, no_show_count = COALESCE($2, no_show_count), updated_at = NOW()
         WHERE user_id = $3`,
        [payload.valid_report_count, payload.no_show_count, target_id],
      );
    }

    // Log the action
    await client.query(
      `INSERT INTO moderation_actions (admin_id, target_id, action_type, reason, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminId, target_id, action_type, reason, JSON.stringify(payload)],
    );
  });

  // Recalculate trust score if score-affecting
  if (['ban', 'unsuspend', 'adjust_score'].includes(action_type)) {
    recalculateTrustScore(target_id).catch((err) =>
      logger.error({ err, target_id }, 'Trust score recalculation failed'),
    );
  }

  logger.info({ adminId, target_id, action_type }, 'Moderation action applied');
  return { applied: true, action_type, target_id };
}

/**
 * Get wallet ledger for a specific user (admin view).
 */
export async function getUserLedger(userId, { page = 1, limit = 20 }) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { rows } = await query(
    `SELECT * FROM wallet_ledger WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, parseInt(limit), offset],
  );
  return rows;
}
