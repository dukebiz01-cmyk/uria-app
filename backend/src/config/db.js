import pg from 'pg';
import config from './index.js';
import logger from '../utils/logger.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  min: config.DB_POOL_MIN,
  max: config.DB_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
});

pool.on('connect', () => {
  logger.debug('PostgreSQL: new client connected');
});

pool.on('error', (err) => {
  logger.error({ err }, 'PostgreSQL pool error');
});

/**
 * Execute a query with optional client (for transactions)
 */
export async function query(text, params, client) {
  const executor = client || pool;
  const start = Date.now();
  try {
    const result = await executor.query(text, params);
    const duration = Date.now() - start;
    logger.debug({ query: text.substring(0, 100), duration, rows: result.rowCount }, 'DB query');
    return result;
  } catch (err) {
    logger.error({ err, query: text.substring(0, 100) }, 'DB query error');
    throw err;
  }
}

/**
 * Execute a function within a transaction.
 * fn receives a client; fn must use that client for all queries.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
