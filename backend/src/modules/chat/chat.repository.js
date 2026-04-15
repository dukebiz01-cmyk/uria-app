import { query } from '../../config/db.js';

export async function createChatRoom(client, { signalId, maleId, femaleId }) {
  const executor = client || { query: (...args) => query(...args) };
  const { rows } = await executor.query(
    `INSERT INTO chat_rooms (signal_id, male_id, female_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (signal_id) DO UPDATE SET signal_id = EXCLUDED.signal_id
     RETURNING *`,
    [signalId, maleId, femaleId],
  );
  return rows[0];
}

export async function findRoomById(roomId) {
  const { rows } = await query(
    `SELECT cr.*, 
            u_male.nickname AS male_nickname,
            u_female.nickname AS female_nickname
     FROM chat_rooms cr
     JOIN users u_male ON u_male.id = cr.male_id
     JOIN users u_female ON u_female.id = cr.female_id
     WHERE cr.id = $1`,
    [roomId],
  );
  return rows[0] || null;
}

export async function findRoomByIdForUser(roomId, userId) {
  const { rows } = await query(
    `SELECT cr.*, 
            u_male.nickname AS male_nickname,
            u_female.nickname AS female_nickname
     FROM chat_rooms cr
     JOIN users u_male ON u_male.id = cr.male_id
     JOIN users u_female ON u_female.id = cr.female_id
     WHERE cr.id = $1 AND (cr.male_id = $2 OR cr.female_id = $2)`,
    [roomId, userId],
  );
  return rows[0] || null;
}

export async function listRoomsForUser(userId) {
  const { rows } = await query(
    `SELECT cr.*,
            u_male.nickname AS male_nickname,
            u_female.nickname AS female_nickname,
            lm.content AS last_message,
            lm.created_at AS last_message_at,
            (SELECT COUNT(*) FROM chat_messages cm 
             WHERE cm.room_id = cr.id AND cm.sender_id != $1 AND cm.read_at IS NULL) AS unread_count
     FROM chat_rooms cr
     JOIN users u_male ON u_male.id = cr.male_id
     JOIN users u_female ON u_female.id = cr.female_id
     LEFT JOIN LATERAL (
       SELECT content, created_at FROM chat_messages
       WHERE room_id = cr.id
       ORDER BY created_at DESC LIMIT 1
     ) lm ON TRUE
     WHERE (cr.male_id = $1 OR cr.female_id = $1)
       AND cr.status = 'active'
     ORDER BY COALESCE(lm.created_at, cr.created_at) DESC`,
    [userId],
  );
  return rows;
}

export async function addMessage(roomId, senderId, content) {
  const { rows } = await query(
    `INSERT INTO chat_messages (room_id, sender_id, content)
     VALUES ($1, $2, $3) RETURNING *`,
    [roomId, senderId, content],
  );
  return rows[0];
}

export async function listMessages(roomId, { cursor, limit }) {
  const params = [roomId, limit];
  let cursorClause = '';
  if (cursor) {
    cursorClause = 'AND cm.created_at < $3';
    params.push(cursor);
  }

  const { rows } = await query(
    `SELECT cm.*, u.nickname AS sender_nickname
     FROM chat_messages cm
     JOIN users u ON u.id = cm.sender_id
     WHERE cm.room_id = $1 ${cursorClause}
     ORDER BY cm.created_at DESC
     LIMIT $2`,
    params,
  );
  return rows;
}

export async function markRead(roomId, userId, beforeDate) {
  await query(
    `UPDATE chat_messages 
     SET read_at = NOW()
     WHERE room_id = $1 AND sender_id != $2 AND read_at IS NULL
       AND created_at <= $3`,
    [roomId, userId, beforeDate],
  );
}
