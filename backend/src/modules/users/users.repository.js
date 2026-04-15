import { query } from '../../config/db.js';

export async function findById(userId) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
  return rows[0] || null;
}

export async function findByPhone(phone) {
  const { rows } = await query('SELECT * FROM users WHERE phone = $1', [phone]);
  return rows[0] || null;
}

export async function updateProfile(userId, updates) {
  const fields = Object.keys(updates);
  if (!fields.length) return findById(userId);
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = [userId, ...fields.map((f) => updates[f])];
  const { rows } = await query(`UPDATE users SET ${setClause}, last_active_at = NOW() WHERE id = $1 RETURNING *`, values);
  return rows[0] || null;
}

export async function upsertLocation(userId, { lat, lng, accuracy_m }) {
  await query(
    `INSERT INTO user_locations (user_id, lat, lng, accuracy_m, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET lat = $2, lng = $3, accuracy_m = $4, updated_at = NOW()`,
    [userId, lat, lng, accuracy_m ?? null],
  );
}

export async function setTonightMode(userId, enabled, until) {
  const { rows } = await query(
    `UPDATE users SET tonight_on = $2, tonight_until = $3, last_active_at = NOW() WHERE id = $1 RETURNING *`,
    [userId, enabled, until],
  );
  return rows[0] || null;
}

export async function createUserBlock(blockerId, blockedId) {
  const { rows } = await query(
    `INSERT INTO user_blocks (blocker_id, blocked_id)
     VALUES ($1, $2)
     ON CONFLICT (blocker_id, blocked_id) DO NOTHING
     RETURNING *`,
    [blockerId, blockedId],
  );
  return rows[0] || null;
}

export async function isBlockedBetween(userA, userB) {
  const { rows } = await query(
    `SELECT 1 FROM user_blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [userA, userB],
  );
  return rows.length > 0;
}

export async function listTonightUsers({ lat, lng, radius_km, cursor, limit, excludeId, oppositeGender }) {
  const params = [];
  let i = 1;
  const add = (v) => { params.push(v); return `$${i++}`; };
  const pLat = lat !== undefined ? add(lat) : null;
  const pLng = lng !== undefined ? add(lng) : null;
  const pExclude = add(excludeId);
  const pRadius = lat !== undefined && lng !== undefined ? add(radius_km) : null;
  const pCursor = cursor ? add(cursor) : null;
  const pGender = oppositeGender ? add(oppositeGender) : null;
  const pLimit = add(limit);

  const distanceExpr = lat !== undefined && lng !== undefined ? `
    ROUND(
      6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(ul.lat - ${pLat}) / 2), 2) +
        COS(RADIANS(${pLat})) * COS(RADIANS(ul.lat)) *
        POWER(SIN(RADIANS(ul.lng - ${pLng}) / 2), 2)
      ))::NUMERIC, 1
    )` : 'NULL';

  const cursorClause = pCursor ? `AND u.id::text > ${pCursor}` : '';
  const locationJoin = lat !== undefined && lng !== undefined ? 'INNER JOIN user_locations ul ON ul.user_id = u.id' : 'LEFT JOIN user_locations ul ON ul.user_id = u.id';
  const distanceFilter = lat !== undefined && lng !== undefined ? `AND 6371 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS(ul.lat - ${pLat}) / 2), 2) +
          COS(RADIANS(${pLat})) * COS(RADIANS(ul.lat)) *
          POWER(SIN(RADIANS(ul.lng - ${pLng}) / 2), 2)
        )) <= ${pRadius}` : '';
  // FIX #10: opposite gender only
  const genderFilter = pGender ? `AND u.gender = ${pGender}` : '';

  const sql = `
    SELECT
      u.id,
      u.nickname,
      u.gender,
      u.birth_year,
      u.profile_photo_url,
      u.selfie_verified,
      u.tonight_on,
      u.tonight_until,
      pm.tier AS passport_tier,
      pm.trust_score,
      pm.response_rate,
      COALESCE(pm.moment_verified_count, rm.moment_verified_count, 0) AS moment_verified_count,
      ${distanceExpr} AS distance_km
    FROM users u
    ${locationJoin}
    LEFT JOIN passport_metrics pm ON pm.user_id = u.id
    LEFT JOIN reputation_metrics rm ON rm.user_id = u.id
    WHERE u.tonight_on = TRUE
      AND u.status = 'active'
      AND u.id != ${pExclude}
      AND (u.tonight_until IS NULL OR u.tonight_until > NOW())
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks b
        WHERE (b.blocker_id = u.id AND b.blocked_id = ${pExclude})
           OR (b.blocker_id = ${pExclude} AND b.blocked_id = u.id)
      )
      ${genderFilter}
      ${distanceFilter}
      ${cursorClause}
    ORDER BY COALESCE(${distanceExpr}, 99999) ASC, u.id ASC
    LIMIT ${pLimit}`;

  const { rows } = await query(sql, params);
  return rows;
}
