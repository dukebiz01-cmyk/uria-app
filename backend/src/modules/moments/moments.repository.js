import { query } from '../../config/db.js';

export async function findById(momentId) {
  const { rows } = await query(
    'SELECT * FROM moments WHERE id = $1',
    [momentId],
  );
  return rows[0] || null;
}

export async function findByIdForUpdate(momentId, client) {
  const { rows } = await client.query(
    'SELECT * FROM moments WHERE id = $1 FOR UPDATE',
    [momentId],
  );
  return rows[0] || null;
}

export async function findBySignalId(signalId) {
  const { rows } = await query(
    'SELECT * FROM moments WHERE signal_id = $1',
    [signalId],
  );
  return rows[0] || null;
}

export async function createMoment(client, { signalId, maleId, femaleId }) {
  const { rows } = await client.query(
    `INSERT INTO moments (signal_id, male_id, female_id)
     VALUES ($1, $2, $3) RETURNING *`,
    [signalId, maleId, femaleId],
  );
  return rows[0];
}

export async function updateStatus(momentId, status, extraFields, client) {
  const executor = client || { query: (...args) => query(...args) };
  const fields = { status, ...extraFields };
  const keys = Object.keys(fields);
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = [momentId, ...keys.map((k) => fields[k])];

  const { rows } = await executor.query(
    `UPDATE moments SET ${setClause} WHERE id = $1 RETURNING *`,
    values,
  );
  return rows[0];
}

export async function addCheckin(momentId, userId, { lat, lng, accuracy_m, mockLocationFlag }) {
  const { rows } = await query(
    `INSERT INTO moment_checkins (moment_id, user_id, lat, lng, accuracy_m, mock_location_flag)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (moment_id, user_id) DO UPDATE SET
       lat = EXCLUDED.lat, lng = EXCLUDED.lng,
       accuracy_m = EXCLUDED.accuracy_m,
       mock_location_flag = EXCLUDED.mock_location_flag,
       checked_in_at = NOW()
     RETURNING *`,
    [momentId, userId, lat, lng, accuracy_m, mockLocationFlag],
  );
  return rows[0];
}

export async function getCheckinCount(momentId) {
  const { rows } = await query(
    'SELECT COUNT(DISTINCT user_id) AS count FROM moment_checkins WHERE moment_id = $1',
    [momentId],
  );
  return parseInt(rows[0].count);
}

export async function addReview(momentId, reviewerId, revieweeId, evalData) {
  const { rows } = await query(
    `INSERT INTO moment_reviews 
      (moment_id, reviewer_id, reviewee_id, eval_safe, eval_profile_match, eval_promise, eval_again)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (moment_id, reviewer_id) DO UPDATE SET
       eval_safe = EXCLUDED.eval_safe,
       eval_profile_match = EXCLUDED.eval_profile_match,
       eval_promise = EXCLUDED.eval_promise,
       eval_again = EXCLUDED.eval_again
     RETURNING *`,
    [momentId, reviewerId, revieweeId,
     evalData.eval_safe, evalData.eval_profile_match,
     evalData.eval_promise, evalData.eval_again],
  );
  return rows[0];
}

export async function getReviewCount(momentId) {
  const { rows } = await query(
    'SELECT COUNT(DISTINCT reviewer_id) AS count FROM moment_reviews WHERE moment_id = $1',
    [momentId],
  );
  return parseInt(rows[0].count);
}

export async function bulkExpireCheckedIn(beforeDate) {
  const { rows } = await query(
    `UPDATE moments 
     SET status = 'expired'
     WHERE status IN ('pending', 'checked_in') AND created_at < $1
     RETURNING id, male_id, female_id`,
    [beforeDate],
  );
  return rows;
}
