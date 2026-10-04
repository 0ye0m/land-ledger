'use strict';

const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({
  host: env.pg.host,
  port: env.pg.port,
  database: env.pg.database,
  user: env.pg.user,
  password: env.pg.password,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] idle client error', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a set of operations inside a single transaction.
 * @param {(client) => Promise<any>} fn
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function checkConnection() {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0].ok === 1;
}

module.exports = { pool, query, withTransaction, checkConnection };
