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

  smtp: {
    // FREE/low-cost email via any SMTP provider (e.g. Gmail App Password,
    // not the account's real password). Missing config => OTP email sending
    // fails safely; MFA never silently bypasses (see mfa.devMode below).
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'LAND LEDGER <no-reply@landledger.local>',
  },

  mfa: {
    otpTtlMinutes: parseInt(process.env.MFA_OTP_TTL_MINUTES || '5', 10),
    otpMaxAttempts: parseInt(process.env.MFA_OTP_MAX_ATTEMPTS || '5', 10),
    otpLength: 6,
    resendCooldownSeconds: parseInt(process.env.MFA_RESEND_COOLDOWN_SECONDS || '45', 10),
    maxSendsPerChallenge: parseInt(process.env.MFA_MAX_SENDS_PER_CHALLENGE || '3', 10),
    maxChallengesPerHour: parseInt(process.env.MFA_MAX_CHALLENGES_PER_HOUR || '5', 10),
    // Server-side pepper for the OTP HMAC (never leaves the server).
    otpPepper: process.env.OTP_PEPPER || process.env.JWT_SECRET || 'dev_only_otp_pepper_change_me',
    /**
     * DEMO-ONLY escape hatch for environments without SMTP credentials
     * (e.g. the sandbox preview). Requires an explicit MFA_DEV_MODE=1 AND
     * NODE_ENV=development; it NEVER activates in test or production. In dev
     * mode the OTP flow is fully real (hashed, expiring, single-use) except
     * the OTP is surfaced in the API response so the demo can complete
     * without a mailbox. Configure SMTP_HOST/SMTP_USER/SMTP_PASSWORD to
     * switch to real email delivery - then remove MFA_DEV_MODE.
     */
    devMode: process.env.MFA_DEV_MODE === '1' && process.env.NODE_ENV === 'development',
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
