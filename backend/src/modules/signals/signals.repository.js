import { query } from '../../config/db.js';

export async function findById(signalId, client) {
  const executor = client || { query: (...args) => query(...args) };
  const { rows } = await executor.query(
    'SELECT * FROM signals WHERE id = $1',
    [signalId],
  );
  return rows[0] || null;
}

export async function findByIdForUpdate(signalId, client) {
  const { rows } = await client.query(
    'SELECT * FROM signals WHERE id = $1 FOR UPDATE',
    [signalId],
  );
  return rows[0] || null;
}

/**
 * Check if a recent signal (within 24h) exists between sender and receiver.
 */
export async function findRecentSignal(senderId, receiverId) {
  const { rows } = await query(
    `SELECT id FROM signals 
     WHERE sender_id = $1 AND receiver_id = $2 
       AND created_at > NOW() - INTERVAL '24 hours'
       AND status NOT IN ('cancelled', 'expired')`,
    [senderId, receiverId],
  );
  return rows[0] || null;
}

export async function createSignal(client, { senderId, receiverId, message, expiresAt }) {
  const { rows } = await client.query(
    `INSERT INTO signals (sender_id, receiver_id, message, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [senderId, receiverId, message, expiresAt],
  );
  return rows[0];
}

export async function updateStatus(signalId, status, extraFields, client) {
  const executor = client || { query: (...args) => query(...args) };
  const fields = { status, responded_at: new Date(), ...extraFields };
  const keys = Object.keys(fields);
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = [signalId, ...keys.map((k) => fields[k])];

  const { rows } = await executor.query(
    `UPDATE signals SET ${setClause} WHERE id = $1 RETURNING *`,
    values,
  );
  return rows[0];
}

export async function addEvent(client, { signalId, actorId, eventType, payload }) {
  await client.query(
    `INSERT INTO signal_events (signal_id, actor_id, event_type, payload)
     VALUES ($1, $2, $3, $4)`,
    [signalId, actorId, eventType, JSON.stringify(payload || {})],
  );
}

export async function listSignals({ userId, direction, status, cursor, limit }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (direction === 'sent') {
    conditions.push(`s.sender_id = $${idx++}`);
  } else {
    conditions.push(`s.receiver_id = $${idx++}`);
  }
  params.push(userId);

  if (status) {
    conditions.push(`s.status = $${idx++}`);
    params.push(status);
  }

  if (cursor) {
    conditions.push(`s.created_at < $${idx++}`);
    params.push(cursor);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const { rows } = await query(
    `SELECT s.*, 
            u_sender.nickname AS sender_nickname,
            u_sender.profile_photo_url AS sender_photo,
            u_receiver.nickname AS receiver_nickname,
            u_receiver.profile_photo_url AS receiver_photo
     FROM signals s
     JOIN users u_sender ON u_sender.id = s.sender_id
     JOIN users u_receiver ON u_receiver.id = s.receiver_id
     ${where}
     ORDER BY s.created_at DESC
     LIMIT $${idx}`,
    params,
  );
  return rows;
}

export async function bulkExpire(beforeDate) {
  const { rows } = await query(
    `UPDATE signals 
     SET status = 'expired', responded_at = NOW()
     WHERE status = 'pending' AND expires_at < $1
     RETURNING id, sender_id`,
    [beforeDate],
  );
  return rows;
}
