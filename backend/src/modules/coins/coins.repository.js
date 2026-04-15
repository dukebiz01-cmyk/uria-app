import { query } from '../../config/db.js';

export async function getLedger(userId, { cursor, limit }) {
  const params = [userId, limit];
  let cursorClause = '';
  if (cursor) {
    cursorClause = 'AND wl.created_at < $3';
    params.push(cursor);
  }

  const { rows } = await query(
    `SELECT * FROM wallet_ledger wl
     WHERE wl.user_id = $1 ${cursorClause}
     ORDER BY wl.created_at DESC
     LIMIT $2`,
    params,
  );
  return rows;
}

export async function findLedgerByIdempotencyKey(key) {
  const { rows } = await query(
    'SELECT * FROM wallet_ledger WHERE idempotency_key = $1',
    [key],
  );
  return rows[0] || null;
}
