import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://uria_user:uria_pass@localhost:5432/uria_db',
  });

  const client = await pool.connect();

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get already applied migrations
    const { rows: applied } = await client.query(
      'SELECT filename FROM _migrations ORDER BY id',
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    // Read migration files sorted
    const migrationsDir = join(__dirname, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`[migrate] Applying ${file}...`);
      const sql = readFileSync(join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] ✓ ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] ✗ ${file}: ${err.message}`);
        throw err;
      }
    }

    console.log(`[migrate] Done. Applied ${appliedCount} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('[migrate] Fatal error:', err.message);
  process.exit(1);
});
