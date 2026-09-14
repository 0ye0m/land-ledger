'use strict';

/**
 * Index management for collections written by the raw migrator/mirror
 * (mongoose models create their own indexes on connection; these are the
 * equivalents for direct-collection access paths).
 */

async function ensureIndexes(mongoDb) {
  const audit = mongoDb.collection('audit_events');
  await audit.createIndex({ eventId: 1 }, { unique: true });
  await audit.createIndex({ action: 1 });
  await audit.createIndex({ entityType: 1 });
  await audit.createIndex({ result: 1 });
  await audit.createIndex({ created_at: -1 });
  await audit.createIndex({ actorId: 1, created_at: -1 });
  await audit.createIndex({ entityType: 1, entityId: 1, created_at: -1 });

  const login = mongoDb.collection('login_events');
  await login.createIndex({ email: 1 });
  await login.createIndex({ outcome: 1 });
  await login.createIndex({ created_at: -1 });
  await login.createIndex({ email: 1, created_at: -1 });
  await login.createIndex({ outcome: 1, created_at: -1 });

  const counters = mongoDb.collection('counters');
  // `_id` index is built-in on MongoDB - nothing to create for counters.
  void counters;
}

module.exports = { ensureIndexes };
