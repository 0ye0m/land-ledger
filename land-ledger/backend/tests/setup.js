'use strict';

/** Shared test harness: in-process app + helper factories (MongoDB test database). */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_land_ledger';
// Tests MUST use a dedicated throwaway database - never the live `land_ledger` one.
process.env.MONGODB_DB_NAME = 'land_ledger_test';

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
    ]);
    wiped = true;
  }
}

let seq = 0;
function uniq(prefix) {
  seq += 1;
  return `${prefix}-test-${Date.now()}-${seq}`;
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
    const login = await request(app).post('/api/auth/login').send({ email, password: 'Testing@123' });
    return { user: login.body.data.user, token: login.body.data.token, email, password: 'Testing@123' };
  }
  return { user, token: res.body.data.token, email, password: 'Testing@123' };
}

async function login(email, password) {
  await ensureReady();
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.data;
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

module.exports = { app, request, auth, uniq, registerUser, login, createProperty, uploadDocument, ensureReady, mongoose };
