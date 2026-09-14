'use strict';

const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'land_ledger_process_' });

const httpRequestsTotal = new client.Counter({
  name: 'land_ledger_http_requests_total',
  help: 'Total HTTP requests processed by the Land Ledger API',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'land_ledger_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['route'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpInFlight = new client.Gauge({
  name: 'land_ledger_http_in_flight_requests',
  help: 'Number of HTTP requests currently being processed',
  registers: [register],
});

// MongoDB Atlas (operational event store) observability
const mongoWritesTotal = new client.Counter({
  name: 'land_ledger_mongo_writes_total',
  help: 'Documents successfully written to MongoDB Atlas',
  labelNames: ['collection'],
  registers: [register],
});

const mongoWriteFailures = new client.Counter({
  name: 'land_ledger_mongo_write_failures_total',
  help: 'Writes to MongoDB Atlas that were skipped or failed (app continues on PostgreSQL)',
  labelNames: ['collection'],
  registers: [register],
});

const mongoConnected = new client.Gauge({
  name: 'land_ledger_mongo_connected',
  help: '1 when the MongoDB Atlas connection is up, 0 otherwise',
  registers: [register],
});

function setMongoConnected(value) {
  mongoConnected.set(value ? 1 : 0);
}

function incMongoWrite(collection) {
  mongoWritesTotal.inc({ collection });
}

function incMongoWriteFailure(collection) {
  mongoWriteFailures.inc({ collection });
}

function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics' || req.path === '/health') return next();
  const end = httpRequestDuration.startTimer();
  httpInFlight.inc();
  res.on('finish', () => {
    httpInFlight.dec();
    // Use the matched route pattern to avoid unbounded label cardinality
    const route = req.baseUrl ? `${req.baseUrl}${req.route ? req.route.path : ''}` : (req.route ? req.route.path : req.path);
    const safeRoute = route || 'unmatched';
    httpRequestsTotal.inc({ method: req.method, route: safeRoute, status: res.statusCode });
    end({ route: safeRoute });
  });
  next();
}

async function metricsEndpoint(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = {
  metricsMiddleware,
  metricsEndpoint,
  setMongoConnected,
  incMongoWrite,
  incMongoWriteFailure,
};
