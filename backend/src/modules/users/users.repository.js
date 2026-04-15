import { query } from '../../config/db.js';

export async function findById(userId) {
  const { rows } = await query(
    'SELECT * FROM users WHERE id = $1',
    [userId],
  );
  return rows[0] || null;
}

export async function findByPhone(phone) {
  const { rows } = await query(
    'SELECT * FROM users WHERE phone = $1',
    [phone],
  );
  return rows[0] || null;
}

export async function updateProfile(userId, updates) {
  const fields = Object.keys(updates);
  if (!fields.length) return findById(userId);

  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = [userId, ...fields.map((f) => updates[f])];

  const { rows } = await query(
    `UPDATE users SET ${setClause} WHERE id = $1 RETURNING *`,
    values,
  );
  return rows[0];
}

export async function upsertLocation(userId, { lat, lng, accuracy_m }) {
  await query(
    `INSERT INTO user_locations (user_id, lat, lng, accuracy_m, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET lat = $2, lng = $3, accuracy_m = $4, updated_at = NOW()`,
    [userId, lat, lng, accuracy_m],
  );
}

export async function setTonightMode(userId, enabled, until) {
  const { rows } = await query(
    `UPDATE users SET tonight_on = $2, tonight_until = $3 WHERE id = $1 RETURNING *`,
    [userId, enabled, until],
  );
  return rows[0];
}

/**
 * List users with TONIGHT MODE active, optionally filtered by distance.
 * Uses Haversine formula approximation in SQL.
 *
 * @param {object} params
 * @returns {Array}
 */
export async function listTonightUsers({ lat, lng, radius_km, cursor, limit, excludeId }) {
  let sql;
  let params;

  if (lat !== undefined && lng !== undefined) {
    // Distance-filtered query
    sql = `
      SELECT u.id, u.nickname, u.gender, u.birth_year, u.profile_photo_url,
             u.selfie_verified, u.tonight_on, u.tonight_until,
             ul.lat, ul.lng,
             ROUND(
               6371 * 2 * ASIN(SQRT(
                 POWER(SIN(RADIANS(ul.lat - $1) / 2), 2) +
                 COS(RADIANS($1)) * COS(RADIANS(ul.lat)) *
                 POWER(SIN(RADIANS(ul.lng - $2) / 2), 2)
               ))::NUMERIC, 1
             ) AS distance_km
      FROM users u
      INNER JOIN user_locations ul ON ul.user_id = u.id
      WHERE u.tonight_on = TRUE
        AND u.status = 'active'
        AND u.id != $3
        AND (u.tonight_until IS NULL OR u.tonight_until > NOW())
        AND 6371 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS(ul.lat - $1) / 2), 2) +
          COS(RADIANS($1)) * COS(RADIANS(ul.lat)) *
          POWER(SIN(RADIANS(ul.lng - $2) / 2), 2)
        )) <= $4
        ${cursor ? 'AND u.id > $6' : ''}
      ORDER BY distance_km ASC, u.id ASC
      LIMIT $5
    `;
    params = cursor
      ? [lat, lng, excludeId, radius_km, limit, cursor]
      : [lat, lng, excludeId, radius_km, limit];
  } else {
    // No location filter
    sql = `
      SELECT u.id, u.nickname, u.gender, u.birth_year, u.profile_photo_url,
             u.selfie_verified, u.tonight_on, u.tonight_until
      FROM users u
      WHERE u.tonight_on = TRUE
        AND u.status = 'active'
        AND u.id != $1
        AND (u.tonight_until IS NULL OR u.tonight_until > NOW())
        ${cursor ? 'AND u.id > $3' : ''}
      ORDER BY u.id ASC
      LIMIT $2
    `;
    params = cursor ? [excludeId, limit, cursor] : [excludeId, limit];
  }

  const { rows } = await query(sql, params);
  return rows;
}
