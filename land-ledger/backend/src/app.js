'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const env = require('./config/env');
const { metricsMiddleware, metricsEndpoint } = require('./middleware/metrics');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const mongo = require('./db/mongo');
const blockchainService = require('./services/blockchainService');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const documentRoutes = require('./routes/documentRoutes');
const transferRoutes = require('./routes/transferRoutes');
const fraudRoutes = require('./routes/fraudRoutes');
const blockchainRoutes = require('./routes/blockchainRoutes');
const registrarRoutes = require('./routes/registrarRoutes');
const workflowRoutes = require('./routes/workflowRoutes');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // SPA served separately / API only
    // The sandbox preview panel embeds this site in a cross-origin iframe.
    // Helmet's default frameguard sends X-Frame-Options: SAMEORIGIN, which makes
    // the mini-preview show "refused to connect". Framing is required there.
    frameguard: false,
  }));
  app.use(cors({
    origin(origin, cb) {
      if (!origin || env.corsOrigin.includes(origin) || origin.includes('preview') || origin.includes('localhost')) return cb(null, true);
      cb(null, true); // sandbox-friendly; production should tighten this list
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(metricsMiddleware);

  // Health probe (no auth) - used by Docker/K8s and the sidebar status dot.
  // MongoDB Atlas is the primary datastore; the blockchain ledger is secondary
  // (its unavailability degrades chain features but never fails health).
  app.get('/health', async (req, res) => {
    const mongoHealth = mongo.health();
    const chain = await blockchainService.getStatus();
    const dbUp = mongoHealth.connected;
    res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      service: 'land-ledger-api',
      database: dbUp ? 'connected' : 'unavailable',
      mongodb: mongoHealth.enabled ? (dbUp ? 'connected' : mongoHealth.state) : 'disabled',
      blockchain: chain.available ? 'connected' : 'unavailable',
      latestBlock: chain.latestBlock ?? null,
      time: new Date().toISOString(),
    });
  });

  // Prometheus metrics (no auth - scraped internally).
  app.get('/metrics', metricsEndpoint);

  // REST API
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/properties', propertyRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/transfers', transferRoutes);
  app.use('/api/fraud', fraudRoutes);
  app.use('/api/blockchain', blockchainRoutes);
  app.use('/api/registrar', registrarRoutes);
  app.use('/api/workflow', workflowRoutes);
  app.get('/api/audit', require('./middleware/auth').requireAuth, require('./middleware/auth').requireRole('registrar'), require('./controllers/registrarController').auditLogs);

  // Uploaded documents storage (UUID filenames; authenticated download also available).
  const uploadRoot = path.resolve(process.cwd(), env.uploads.dir);
  if (fs.existsSync(uploadRoot)) {
    app.use('/uploads', express.static(uploadRoot, { maxAge: '1d', immutable: true }));
  }

  // Integrated frontend: serve the built Vite SPA (single-port deployment).
  const distDir = path.resolve(process.cwd(), '..', 'frontend', 'dist');
  const altDistDir = path.resolve(process.cwd(), 'public');
  const spaDir = fs.existsSync(distDir) ? distDir : fs.existsSync(altDistDir) ? altDistDir : null;
  if (spaDir) {
    app.use(express.static(spaDir, { maxAge: '1h', index: 'index.html' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/health') || req.path.startsWith('/metrics')) {
        return next();
      }
      res.sendFile(path.join(spaDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
