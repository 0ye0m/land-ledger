'use strict';

/**
 * mongoMirror - login security telemetry writes to MongoDB Atlas (login_events).
 *
 * Contract:
 *  - NEVER throws, NEVER blocks the request path (fire-and-forget).
 *  - While Atlas is unreachable, documents are buffered in memory (bounded)
 *    and flushed automatically on reconnect.
 *  - Write success/failure is observable via land_ledger_mongo_writes_total
 *    and land_ledger_mongo_write_failures_total in /metrics.
 *
 * (Registry audit events are written directly by auditService - MongoDB is
 * now the primary store for them.)
 */

const mongoose = require('mongoose');
const env = require('../config/env');
const logger = require('../utils/logger');
const { incMongoWrite, incMongoWriteFailure } = require('../middleware/metrics');
const LoginEvent = require('../models/LoginEvent');

const COLLECTION = 'login_events';
const MAX_PENDING = 1000;

const pending = [];
let flushing = false;
let lastWarnAt = 0;

function warnThrottled(message) {
  const now = Date.now();
  if (now - lastWarnAt > 30000) {
    lastWarnAt = now;
    logger.warn(`[mongo] ${message}`);
  }
}

function enqueue(doc) {
  if (pending.length < MAX_PENDING) pending.push(doc);
  else incMongoWriteFailure(COLLECTION);
}

async function flush() {
  if (flushing || !pending.length) return;
  flushing = true;
  try {
    while (pending.length) {
      try {
        await mongoose.connection.collection(COLLECTION).insertOne(pending[0]);
        pending.shift();
        incMongoWrite(COLLECTION);
      } catch (err) {
        incMongoWriteFailure(COLLECTION);
        warnThrottled(`login-event write deferred (${err.message}); ${pending.length} doc(s) buffered`);
        break; // still unreachable - keep buffer
      }
    }
  } finally {
    flushing = false;
  }
}

function recordLoginEvent({ email, user = null, outcome, reason = null, ip = null, userAgent = null }) {
  const doc = {
    email: String(email || '').toLowerCase().trim(),
    userId: user && user.id ? String(user.id) : null,
    role: user && user.role ? user.role : null,
    outcome,
    reason,
    ip: ip ? String(ip).slice(0, 64) : null,
    userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
    created_at: new Date(),
  };

  if (!env.mongo.uri) {
    incMongoWriteFailure(COLLECTION);
    return;
  }
  if (mongoose.connection.readyState !== 1) {
    enqueue(doc);
    incMongoWriteFailure(COLLECTION);
    return;
  }
  mongoose.connection
    .collection(COLLECTION)
    .insertOne(doc)
    .then(() => incMongoWrite(COLLECTION))
    .catch((err) => {
      enqueue(doc);
      incMongoWriteFailure(COLLECTION);
      warnThrottled(`login-event write deferred (${err.message}); ${pending.length} doc(s) buffered`);
    });
}

// Flush the buffer as soon as the connection is (re-)established.
mongoose.connection.on('connected', () => {
  setImmediate(() => { flush().catch(() => { /* unreachable */ }); });
});

module.exports = { recordLoginEvent, flush, pendingCount: () => pending.length };
