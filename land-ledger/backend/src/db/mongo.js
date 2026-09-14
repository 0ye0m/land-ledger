'use strict';

/**
 * MongoDB Atlas connection manager (mongoose 8).
 *
 * Design contract (production-safe):
 *  - MongoDB is an ADDITIONAL operational event store (audit mirror + login
 *    security telemetry). PostgreSQL remains the system of record.
 *  - Connecting NEVER throws and NEVER blocks startup: if Atlas is
 *    unreachable (e.g. IP not whitelisted yet), the app boots and serves
 *    every existing feature from PostgreSQL.
 *  - The driver keeps heartbeating in the background; the moment the cluster
 *    becomes reachable (e.g. IP whitelisted in Atlas), it auto-connects
 *    within ~10-30s with no restart. A slow reconcile timer covers the case
 *    where the driver gave up entirely.
 */

const mongoose = require('mongoose');
const env = require('../config/env');
const logger = require('../utils/logger');
const { setMongoConnected } = require('../middleware/metrics');

const STATE_LABELS = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

let bootstrapped = false;
let reconcileTimer = null;

function isConnected() {
  return mongoose.connection.readyState === 1;
}

function health() {
  const readyState = mongoose.connection.readyState;
  return {
    connected: readyState === 1,
    state: STATE_LABELS[readyState] || 'unknown',
    enabled: Boolean(env.mongo.uri),
    dbName: env.mongo.dbName,
  };
}

function onConnected() {
  logger.info(`[mongo] connected to MongoDB Atlas (db: ${env.mongo.dbName})`);
  setMongoConnected(1);
}

function onDisconnected() {
  logger.warn('[mongo] disconnected from MongoDB Atlas - PostgreSQL-only mode');
  setMongoConnected(0);
}

function onError(err) {
  // Logged, never thrown - MongoDB outages must not affect request handling.
  logger.warn(`[mongo] connection error: ${err.message}`);
}

function bootstrapListeners() {
  if (bootstrapped) return;
  bootstrapped = true;
  mongoose.connection.on('connected', onConnected);
  mongoose.connection.on('disconnected', onDisconnected);
  mongoose.connection.on('error', onError);
}

async function connectMongo() {
  if (!env.mongo.uri) {
    logger.info('[mongo] MONGODB_URI not set - MongoDB Atlas features disabled (PostgreSQL-only mode)');
    return false;
  }
  bootstrapListeners();

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.mongo.uri, {
      dbName: env.mongo.dbName,
      serverSelectionTimeoutMS: env.mongo.serverSelectionTimeoutMs,
      connectTimeoutMS: env.mongo.serverSelectionTimeoutMs,
      maxPoolSize: env.mongo.maxPoolSize,
      appName: 'land-ledger',
    });
    return true;
  } catch (err) {
    logger.warn(
      `[mongo] initial connect failed (${err.name}: ${err.message}). ` +
      'The driver keeps retrying in the background - the app continues on PostgreSQL only. ' +
      'If this is an Atlas M0 cluster, make sure the server IP is whitelisted under Network Access.'
    );
    startReconcileTimer();
    return false;
  }
}

/** Safety net: if the driver gave up entirely, retry connect every 30s. */
function startReconcileTimer() {
  if (reconcileTimer || !env.mongo.uri) return;
  reconcileTimer = setInterval(() => {
    if (mongoose.connection.readyState === 0) {
      connectMongo().catch(() => { /* logged inside */ });
    }
  }, 30000);
  reconcileTimer.unref();
}

async function closeMongo() {
  if (reconcileTimer) clearInterval(reconcileTimer);
  if (mongoose.connection.readyState !== 0) {
    try { await mongoose.connection.close(); } catch { /* noop */ }
  }
}

module.exports = { connectMongo, closeMongo, isConnected, health };
