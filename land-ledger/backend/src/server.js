'use strict';

const env = require('./config/env');
const { createApp } = require('./app');
const logger = require('./utils/logger');
const { connectMongo, closeMongo } = require('./db/mongo');

const app = createApp();

const mongoReady = connectMongo();

const server = app.listen(env.port, () => {
  logger.info(`LAND LEDGER API listening on port ${env.port} (${env.nodeEnv})`);
  logger.info(`Integrated SPA: ${require('fs').existsSync(require('path').resolve(process.cwd(), '..', 'frontend', 'dist')) ? 'enabled' : 'not built yet'}`);
});

// MongoDB Atlas is the primary datastore. The process NEVER exits because of
// connectivity: the driver keeps retrying in the background and the API stays
// up (degraded) until Atlas answers. Deploy containers can be slow to reach
// Atlas on first boot - killing the process here turns a slow start into a
// failed deployment. Graceful degradation is the project-wide contract.
mongoReady.then((ok) => {
  if (!ok) {
    logger.warn('[mongo] unreachable at boot - API stays up (degraded) and the driver keeps retrying');
  }
});

async function shutdown(signal) {
  logger.info(`${signal} received - shutting down gracefully`);
  server.close(async () => {
    await closeMongo();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
