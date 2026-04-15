#!/usr/bin/env node
/**
 * URIA DB 마이그레이션 실행기
 * usage: node migrate.js
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await client.connect();
  console.log('✅ DB 연결됨');

  // 마이그레이션 추적 테이블
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      ran_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const migDir = join(__dirname, 'db', 'migrations');
  const files = readdirSync(migDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    const { rows } = await client.query(
      'SELECT id FROM _migrations WHERE filename = $1', [file]
    );
    if (rows.length) { console.log(`⏭  ${file} (already ran)`); continue; }

    const sql = readFileSync(join(migDir, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✅ ${file}`);
      ran++;
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`❌ ${file}: ${e.message}`);
      process.exit(1);
    }
  }

  console.log(`\n마이그레이션 완료: ${ran}개 실행됨`);
  await client.end();
}

migrate().catch(e => { console.error(e); process.exit(1); });
