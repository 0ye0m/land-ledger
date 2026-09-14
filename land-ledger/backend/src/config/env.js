'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
require('dotenv').config({ path: path.resolve(process.cwd(), '../.env') });

function required(name, fallback) {
  const value = process.env[name] || fallback;
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),

  pg: {
    host: required('PGHOST', '127.0.0.1'),
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: required('PGDATABASE', 'land_ledger'),
    user: required('PGUSER', 'landledger'),
    password: required('PGPASSWORD', 'landledger_dev_pw'),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_only_jwt_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  uploads: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10', 10),
    allowedExtensions: (process.env.ALLOWED_DOC_EXTENSIONS || 'pdf,png,jpg,jpeg,webp,doc,docx')
      .split(',')
      .map((s) => s.trim().toLowerCase()),
  },

  mongo: {
    // MongoDB Atlas (free M0 tier). Empty URI = MongoDB features disabled,
    // app runs on PostgreSQL only (graceful degradation, never fatal).
    uri: process.env.MONGODB_URI || '',
    dbName: process.env.MONGODB_DB_NAME || 'land_ledger',
    serverSelectionTimeoutMs: parseInt(process.env.MONGODB_SERVER_SELECTION_MS || '8000', 10),
    maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10),
  },

  blockchain: {
    rpcUrl: process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545',
    operatorPrivateKey:
      process.env.BLOCKCHAIN_OPERATOR_PRIVATE_KEY ||
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    contractAddress: process.env.CONTRACT_ADDRESS || '',
    networkName: process.env.BLOCKCHAIN_NETWORK_NAME || 'hardhat',
  },
};

module.exports = env;
