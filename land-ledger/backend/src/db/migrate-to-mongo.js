'use strict';

/**
 * ONE-TIME migration: PostgreSQL -> MongoDB Atlas.  [ARCHIVED UTILITY]
 *
 * The application no longer uses PostgreSQL at all - this script is kept for
 * provenance. It already ran for the default deployment; if you ever need to
 * re-run it you must first: `cd backend && npm install pg` and have the legacy
 * PostgreSQL database reachable via PG* env vars.
 *
 * Preserves everything exactly:
 *  - UUID primary keys become Mongo `_id` strings (all FK references keep working)
 *  - timestamps carried over verbatim (no re-dating)
 *  - JSONB columns stored as native subdocuments
 *  - business-id counters initialized to the max existing sequence
 *
 * Usage: node src/db/migrate-to-mongo.js [--wipe]
 *   --wipe  delete existing Mongo documents in the target collections first
 */

const { query, pool } = require('./pool');
const env = require('../config/env');
const mongoose = require('mongoose');
const { connectMongo } = require('./mongo');

const BATCH = 200;

function rowsToDocs(rows) {
  return rows.map((r) => {
    const { id, ...rest } = r;
    return { _id: id, ...rest };
  });
}

async function copyCollection(mongoDb, table, orderBy = 'created_at') {
  const target = mongoDb.collection(table);
  const { rows } = await query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
  const docs = rowsToDocs(rows);
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    try {
      await target.insertMany(batch, { ordered: false });
    } catch (err) {
      // Ignore duplicate-key errors from a partial earlier run, rethrow the rest.
      const dup = (err.writeErrors || []).filter((e) => e.code === 11000);
      if (err.writeErrors && dup.length === err.writeErrors.length) continue;
      throw err;
    }
  }
  console.log(`  ${table}: ${docs.length} document(s) migrated`);
  return docs.length;
}

function maxSuffix(values) {
  let max = 0;
  for (const v of values) {
    const m = String(v || '').match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

async function main() {
  const wipe = process.argv.includes('--wipe');
  console.log(`Migrating PostgreSQL (${env.pg.database}) -> MongoDB Atlas (${env.mongo.dbName})`);

  const ok = await connectMongo();
  if (!ok) {
    console.error('Cannot reach MongoDB Atlas - check MONGODB_URI / Network Access whitelist.');
    process.exit(1);
  }
  const mongoDb = mongoose.connection.db;

  if (wipe) {
    console.log('--wipe: clearing target collections...');
    for (const c of ['users', 'properties', 'documents', 'transfer_requests', 'fraud_checks', 'blockchain_transactions', 'audit_logs']) {
      await mongoDb.collection(c).deleteMany({});
    }
  }

  const counts = {};
  counts.users = await copyCollection(mongoDb, 'users', 'created_at');
  counts.properties = await copyCollection(mongoDb, 'properties', 'created_at');
  counts.documents = await copyCollection(mongoDb, 'documents', 'created_at');
  counts.transfer_requests = await copyCollection(mongoDb, 'transfer_requests', 'created_at');
  counts.fraud_checks = await copyCollection(mongoDb, 'fraud_checks', 'created_at');
  counts.blockchain_transactions = await copyCollection(mongoDb, 'blockchain_transactions', 'created_at');

  // audit_logs -> audit_events (same event-stream collection the app already uses).
  const { rows: auditRows } = await query('SELECT * FROM audit_logs ORDER BY created_at');
  const auditTarget = mongoDb.collection('audit_events');
  const auditDocs = auditRows.map((r) => ({
    eventId: r.id,
    pgId: null,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    result: r.result,
    metadata: typeof r.metadata === 'string' ? safeJson(r.metadata) : r.metadata,
    created_at: r.created_at,
  }));
  for (let i = 0; i < auditDocs.length; i += BATCH) {
    try {
      await auditTarget.insertMany(auditDocs.slice(i, i + BATCH), { ordered: false });
    } catch (err) {
      const dups = (err.writeErrors || []).filter((e) => e.code === 11000);
      if (err.writeErrors && dups.length === err.writeErrors.length) continue;
      throw err;
    }
  }
  console.log(`  audit_events: ${auditDocs.length} document(s) migrated`);
  counts.audit_events = auditDocs.length;

  // login_events + counters already live only in Mongo - nothing to copy.

  // ---------- initialize business-id counters to current maxima ----------
  const counters = mongoDb.collection('counters');
  const year = new Date().getFullYear();

  const { rows: propRefs } = await query(`SELECT property_id FROM properties`);
  const propMax = maxSuffix(propRefs.map((r) => r.property_id));
  // NOTE: property_id (PROP-2026-0024) and reference_number (LL/REG/2026/...) use
  // the same counter value in the legacy code (COUNT(*)+1); the reference applies
  // its own 100000-offset formatting on top. The counter stores the SMALL sequence.
  await counters.updateOne(
    { _id: `property_${year}` },
    { $set: { seq: propMax } },
    { upsert: true }
  );

  const { rows: transferRefs } = await query(`SELECT transfer_reference FROM transfer_requests`);
  const trfMax = maxSuffix(transferRefs.map((r) => r.transfer_reference));
  await counters.updateOne(
    { _id: `transfer_${year}` },
    { $setOnInsert: { seq: trfMax } },
    { upsert: true }
  );

  console.log(`  counters: property_${year}=${propMax}, transfer_${year}=${trfMax}`);

  // ---------- recreate the index set on legacy collections ----------
  const mongo = require('./mongo-indexes');
  await mongo.ensureIndexes(mongoDb);

  // ---------- verification ----------
  console.log('\nVerification (PostgreSQL vs MongoDB):');
  let allMatch = true;
  for (const table of ['users', 'properties', 'documents', 'transfer_requests', 'fraud_checks', 'blockchain_transactions']) {
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    const pgCount = rows[0].n;
    const mongoCount = await mongoDb.collection(table).countDocuments();
    const match = pgCount === mongoCount;
    allMatch = allMatch && match;
    console.log(`  ${table}: pg=${pgCount} mongo=${mongoCount} ${match ? 'OK' : 'MISMATCH!'}`);
  }
  const { rows: auditCount } = await query('SELECT COUNT(*)::int AS n FROM audit_logs');
  const mongoAudit = await mongoDb.collection('audit_events').countDocuments();
  console.log(`  audit: pg=${auditCount[0].n} mongo(total incl. pre-existing)=${mongoAudit}`);

  await pool.end();
  await mongoose.disconnect();
  console.log(allMatch ? '\nMIGRATION_OK - all counts match' : '\nMIGRATION_INCOMPLETE - mismatches above');
  process.exit(allMatch ? 0 : 1);
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return s; }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
