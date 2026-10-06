'use strict';

/** Shared test harness: in-process app + helper factories (MongoDB test database). */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_land_ledger';
// Tests MUST use a dedicated throwaway database - never the live `land_ledger` one.
process.env.MONGODB_DB_NAME = 'land_ledger_test';
// Deterministic MFA limits for tests (override any local .env values).
process.env.MFA_DEV_MODE = '0'; // tests use the mail outbox, never devCode
process.env.MFA_MAX_CHALLENGES_PER_HOUR = process.env.MFA_MAX_CHALLENGES_PER_HOUR_TEST || '5';
// TEST-ONLY escape hatch: the demo email allowlist targets the 8 real demo
// identities; automated tests need arbitrary @test.local accounts. This flag
// is ignored when NODE_ENV=production (see src/config/allowlist.js). MFA is
// NEVER bypassed - tests below exercise the real login -> OTP -> verify flow
// against the in-memory mail outbox.
process.env.AUTH_ALLOWLIST = 'off';

require('./_globals');

const request = require('supertest');
const nodeTest = require('node:test');
const { createApp } = require('../src/app');
const { connectMongo } = require('../src/db/mongo');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Property = require('../src/models/Property');
const Document = require('../src/models/Document');
const TransferRequest = require('../src/models/TransferRequest');
const FraudCheck = require('../src/models/FraudCheck');
const BlockchainTransaction = require('../src/models/BlockchainTransaction');
const emailService = require('../src/services/emailService');

const app = createApp();

const ready = connectMongo(); // resolves true/false once connected
let wiped = false;

// Release the event loop when the file's tests finish (mongoose keeps it alive).
nodeTest.after(async () => {
  try { await mongoose.disconnect(); } catch { /* noop */ }
});

async function ensureReady() {
  const ok = await ready;
  if (!ok) throw new Error('MongoDB unreachable for tests (check MONGODB_URI / Network Access)');
  if (!wiped) {
    // Each test file runs in its own process - start from a clean slate.
    await Promise.all([
      User.deleteMany({}),
      Property.deleteMany({}),
      Document.deleteMany({}),
      TransferRequest.deleteMany({}),
      FraudCheck.deleteMany({}),
      BlockchainTransaction.deleteMany({}),
      mongoose.connection.db.collection('audit_events').deleteMany({}),
      mongoose.connection.db.collection('login_events').deleteMany({}),
      mongoose.connection.db.collection('mfa_challenges').deleteMany({}),
      mongoose.connection.db.collection('property_parties').deleteMany({}),
      mongoose.connection.db.collection('transfer_consents').deleteMany({}),
      mongoose.connection.db.collection('counters').deleteMany({}),
    ]);
    wiped = true;
  }
}

let seq = 0;
function uniq(prefix) {
  seq += 1;
  return `${prefix}-test-${Date.now()}-${seq}`;
}

/** Extract the most recent 6-digit OTP code emailed to `email` (test outbox). */
function latestOtpFor(email) {
  const mails = emailService.recentTestMails(20).filter((m) => m.to === String(email).toLowerCase());
  if (!mails.length) return null;
  const match = mails[mails.length - 1].text.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

/**
 * Full two-factor login: password step -> pull the emailed OTP from the test
 * outbox -> verify step. Returns the same shape the frontend stores.
 */
async function mfaLogin(email, password) {
  await ensureReady();
  const start = await request(app).post('/api/auth/login').send({ email, password });
  if (start.status !== 200 || !start.body?.data?.mfaRequired) {
    throw new Error(`mfaLogin: password step failed: ${start.status} ${JSON.stringify(start.body).slice(0, 200)}`);
  }
  const challengeId = start.body.data.challengeId;
  const otp = latestOtpFor(email);
  if (!otp) throw new Error(`mfaLogin: no OTP email captured for ${email}`);
  const verify = await request(app).post('/api/auth/verify-otp').send({ challengeId, otp });
  if (verify.status !== 200 || !verify.body?.data?.token) {
    throw new Error(`mfaLogin: verify step failed: ${verify.status} ${JSON.stringify(verify.body).slice(0, 200)}`);
  }
  return verify.body.data;
}

async function registerUser({ role = 'citizen', wallet = null } = {}) {
  await ensureReady();
  const email = `${uniq(role)}@test.local`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      fullName: role === 'registrar' ? 'Test Registrar' : `Test ${role}`,
      email,
      password: 'Testing@123',
      phone: '+91 90000 00000',
      district: 'Pune',
      state: 'Maharashtra',
      walletAddress: wallet || '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const user = res.body.data.user;
  if (role === 'registrar') {
    // Elevate via direct DB update - role changes are never client-controlled in the API.
    await User.updateOne({ _id: user.id }, { $set: { role: 'registrar' } });
    const login = await mfaLogin(email, 'Testing@123');
    return { user: login.user, token: login.token, email, password: 'Testing@123' };
  }
  return { user, token: res.body.data.token, email, password: 'Testing@123' };
}

async function login(email, password) {
  await ensureReady();
  return mfaLogin(email, password);
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createProperty(token, overrides = {}) {
  await ensureReady();
  const res = await request(app)
    .post('/api/properties')
    .set(auth(token))
    .send({
      title: overrides.title || `Test parcel ${uniq('title')}`,
      addressLine: '1 Test Street',
      city: 'Pune',
      district: 'Pune',
      state: 'Maharashtra',
      areaValue: 1500,
      areaUnit: 'sq ft',
      propertyType: 'RESIDENTIAL_PLOT',
      description: 'Created by automated test',
      ...overrides,
    });
  return res;
}

async function uploadDocument(token, propertyId, { fileName = 'deed.pdf', mimetype = 'application/pdf', content = null } = {}) {
  await ensureReady();
  const res = await request(app)
    .post('/api/documents/upload')
    .set(auth(token))
    .field('propertyId', propertyId)
    .field('documentType', 'TITLE_DEED')
    .attach('file', Buffer.from(content || `%PDF-1.4 test document ${uniq('content')}`), { filename: fileName, contentType: mimetype });
  return res;
}

module.exports = {
  app, request, auth, uniq, registerUser, login, mfaLogin, latestOtpFor,
  createProperty, uploadDocument, ensureReady, mongoose, emailService,
};
