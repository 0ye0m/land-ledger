'use strict';

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { toRow } = require('../db/rows');
const { ok, fail } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');
const { validateRegister, validateLogin } = require('../validators');
const { signToken, publicUser } = require('../middleware/auth');
const auditService = require('../services/auditService');
const { recordLoginEvent } = require('../services/mongoMirror');
const { record } = auditService;

/** Best-effort login security telemetry into MongoDB Atlas (login_events). */
function logLogin(req, { user = null, email, outcome, reason = null }) {
  try {
    recordLoginEvent({
      email,
      user,
      outcome,
      reason,
      ip: req.ip,
      userAgent: req.headers && req.headers['user-agent'],
    });
  } catch { /* telemetry must never throw */ }
}

/** POST /api/auth/register - citizen self-registration. */
const register = asyncHandler(async (req, res) => {
  const { valid, errors, value } = validateRegister(req.body);
  if (!valid) {
    return fail(res, { message: 'Please correct the highlighted fields', errorCode: 'VALIDATION_ERROR', status: 422, details: errors });
  }

  const existing = await User.findOne({ email: value.email }).lean();
  if (existing) {
    return fail(res, { message: 'An account with this email already exists', errorCode: 'EMAIL_TAKEN', status: 409 });
  }

  const passwordHash = await bcrypt.hash(value.password, 10);
  const created = await User.create({
    full_name: value.fullName,
    email: value.email,
    password_hash: passwordHash,
    phone: value.phone || null,
    district: value.district,
    state: value.state,
    wallet_address: value.walletAddress,
    role: 'citizen',
  });
  const user = toRow(created.toObject());

  await record({ actor: user, action: 'USER_REGISTER', entityType: 'user', entityId: user.id, metadata: { email: user.email, role: user.role } });

  return ok(res, {
    message: 'Account created successfully',
    status: 201,
    data: { token: signToken(user), user: publicUser(user) },
  });
});

/** POST /api/auth/login - shared by citizens and registrars. */
const login = asyncHandler(async (req, res) => {
  const { valid, errors, value } = validateLogin(req.body);
  if (!valid) {
    return fail(res, { message: 'Please correct the highlighted fields', errorCode: 'VALIDATION_ERROR', status: 422, details: errors });
  }

  const doc = await User.findOne({ email: value.email }).lean();
  const user = doc ? toRow(doc) : null;
  const passwordOk = user ? await bcrypt.compare(value.password, user.password_hash) : false;

  if (!user || !passwordOk) {
    await record({
      actor: user || null,
      action: 'USER_LOGIN_FAILED',
      entityType: 'user',
      entityId: user ? user.id : null,
      result: 'FAILURE',
      metadata: { email: value.email, reason: user ? 'invalid_password' : 'unknown_account' },
    });
    logLogin(req, { user, email: value.email, outcome: 'FAILURE', reason: user ? 'invalid_password' : 'unknown_account' });
    return fail(res, { message: 'Invalid email or password', errorCode: 'INVALID_CREDENTIALS', status: 401 });
  }

  await User.updateOne({ _id: user.id }, { $set: { last_activity_at: new Date() } });
  await record({ actor: user, action: 'USER_LOGIN', entityType: 'user', entityId: user.id, metadata: { email: user.email } });
  logLogin(req, { user, email: user.email, outcome: 'SUCCESS' });

  return ok(res, { message: 'Signed in successfully', data: { token: signToken(user), user: publicUser(user) } });
});

/** GET /api/auth/me - current session. */
const me = asyncHandler(async (req, res) => {
  return ok(res, { message: 'Current session', data: { user: publicUser(req.user) } });
});

module.exports = { register, login, me };
