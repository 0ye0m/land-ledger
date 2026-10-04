'use strict';

/** Simple file-based migration runner (schema_migrations bookkeeping). */

const fs = require('fs');
const path = require('path');
const { pool, query } = require('./pool');

const MIGRATIONS_DIR = path.resolve(process.cwd(), '..', 'database', 'migrations');
const ALT_MIGRATIONS_DIR = path.resolve(process.cwd(), 'database', 'migrations');

function migrationsDir() {
  return fs.existsSync(MIGRATIONS_DIR) ? MIGRATIONS_DIR : ALT_MIGRATIONS_DIR;
}

async function ensureBookkeeping() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function runMigrations({ log = console.log } = {}) {
  await ensureBookkeeping();
  const applied = new Set((await query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(migrationsDir()).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      log(`= ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir(), file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`+ ${file} applied`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }
  log('Migrations up to date.');
}

if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { runMigrations };
