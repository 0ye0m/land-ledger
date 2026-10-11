'use strict';

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const MfaChallenge = require('../models/MfaChallenge');
const { toRow } = require('../db/rows');
const { ok, fail } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');
const { validateRegister, validateLogin } = require('../validators');
const { signToken, publicUser } = require('../middleware/auth');
const auditService = require('../services/auditService');
const { recordLoginEvent } = require('../services/mongoMirror');
const otpService = require('../services/otpService');
const { isEmailAllowed, allowlistEnforced } = require('../config/allowlist');
const env = require('../config/env');
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

/** POST /api/auth/register - citizen self-registration (allowlist-gated demo). */
const register = asyncHandler(async (req, res) => {
  const { valid, errors, value } = validateRegister(req.body);
  if (!valid) {
    return fail(res, { message: 'Please correct the highlighted fields', errorCode: 'VALIDATION_ERROR', status: 422, details: errors });
  }

  // Controlled demonstration environment: only allowlisted identities may
  // hold accounts (see src/config/allowlist.js for the scope note).
  if (allowlistEnforced() && !isEmailAllowed(value.email)) {
    logLogin(req, { email: value.email, outcome: 'FAILURE', reason: 'EMAIL_NOT_ALLOWLISTED' });
    return fail(res, {
      message: 'This controlled demonstration is limited to pre-approved accounts. Registration with this email is not permitted.',
      errorCode: 'EMAIL_NOT_ALLOWLISTED',
      status: 403,
    });
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

/**
 * POST /api/auth/login - step 1 of the two-factor sign-in.
 * Password alone is NOT sufficient: on success an email OTP challenge is
 * created and only a temporary challenge state is returned. No JWT, no OTP,
 * no account details leave the server here.
 */
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
    logLogin(req, { user, email: value.email, outcome: 'FAILURE', reason: user ? 'LOGIN_FAILED' : 'unknown_account' });
    return fail(res, { message: 'Invalid email or password', errorCode: 'INVALID_CREDENTIALS', status: 401 });
  }

  // Password factor passed -> create + email the OTP challenge.
  const result = await otpService.createChallenge({ user, ip: req.ip });
  await User.updateOne({ _id: user.id }, { $set: { last_activity_at: new Date() } });

  if (!result.ok) {
    if (result.reason === 'RATE_LIMITED') {
      await record({ actor: user, action: 'MFA_CHALLENGE_RATE_LIMITED', entityType: 'user', entityId: user.id, result: 'FAILURE', metadata: { email: user.email } });
      logLogin(req, { user, email: user.email, outcome: 'FAILURE', reason: 'MFA_RATE_LIMITED' });
      return fail(res, { message: 'Too many verification requests. Please wait before trying again.', errorCode: 'MFA_RATE_LIMITED', status: 429 });
    }
    // Email transport unavailable => fail safely; MFA is never bypassed.
    await record({ actor: user, action: 'MFA_CHALLENGE_FAILED', entityType: 'user', entityId: user.id, result: 'FAILURE', metadata: { email: user.email, reason: result.reason } });
    logLogin(req, { user, email: user.email, outcome: 'FAILURE', reason: 'MFA_CHALLENGE_FAILED' });
    return fail(res, {
      message: 'The email service is not available right now, so sign-in cannot be completed securely. Please contact the registry administrator.',
      errorCode: result.reason === 'EMAIL_NOT_CONFIGURED' ? 'EMAIL_NOT_CONFIGURED' : 'MFA_CHALLENGE_FAILED',
      status: 503,
    });
  }

  await record({ actor: user, action: 'MFA_CHALLENGE_CREATED', entityType: 'user', entityId: user.id, metadata: { email: user.email, challengeId: result.view.challengeId } });
  logLogin(req, { user, email: user.email, outcome: 'SUCCESS', reason: 'LOGIN_PASSWORD_SUCCESS_MFA_REQUIRED' });

  const data = { mfaRequired: true, ...result.view };
  // DEMO-ONLY: surface the OTP when MFA_DEV_MODE=1 (never in production, and
  // never once real SMTP delivery is configured). See config/env.js.
  if (env.mfa.devMode && result.devCode) {
    data.devCode = result.devCode;
  }

  return ok(res, { message: 'OTP sent to registered email', data });
});

/**
 * POST /api/auth/verify-otp - step 2 of the two-factor sign-in.
 * Only a correct, unexpired, single-use OTP issues the authenticated JWT.
 */
const verifyOtp = asyncHandler(async (req, res) => {
  const challengeId = String(req.body.challengeId || '').trim();
  const otp = String(req.body.otp || '').trim();
  if (!challengeId || !otp) {
    return fail(res, { message: otpService.GENERIC_INVALID, errorCode: 'MFA_INVALID', status: 400 });
  }

  const result = await otpService.verifyChallenge({ challengeId, otp });
  const user = result.ok ? toRow(result.user) : null;

  if (!result.ok) {
    const reasonMap = {
      NOT_FOUND: 'MFA_INVALID',
      CONSUMED: 'MFA_INVALID',
      INVALIDATED: 'MFA_INVALID',
      MISMATCH: 'MFA_INVALID',
      EXPIRED: 'MFA_EXPIRED',
      TOO_MANY_ATTEMPTS: 'MFA_ATTEMPTS_EXCEEDED',
    };
    const code = reasonMap[result.reason] || 'MFA_INVALID';
    const message =
      code === 'MFA_ATTEMPTS_EXCEEDED'
        ? 'Too many incorrect codes. This verification request is now locked - please sign in again.'
        : otpService.GENERIC_INVALID;

    // Telemetry only (never returned to the client): attribute the failure to
    // the challenged account so per-account OTP brute force is visible in
    // login_events instead of anonymous null-email rows.
    let failEmail = null;
    try {
      const challengeDoc = await MfaChallenge.findById(challengeId).select('user_id').lean();
      if (challengeDoc && challengeDoc.user_id) {
        const owner = await User.findById(challengeDoc.user_id).select('email').lean();
        failEmail = owner ? owner.email : null;
      }
    } catch (telemetryErr) {
      // best-effort; never block the auth response on telemetry
    }

    await record({
      actor: null, action: 'MFA_VERIFY_FAILURE', entityType: 'mfa', entityId: challengeId,
      result: 'FAILURE', metadata: { reason: result.reason, errorCode: code },
    });
    logLogin(req, { user: null, email: failEmail, outcome: 'FAILURE', reason: code === 'MFA_EXPIRED' ? 'MFA_EXPIRED' : 'MFA_FAILED' });

    return fail(res, { message, errorCode: code, status: 401 });
  }

  await User.updateOne({ _id: user.id }, { $set: { last_activity_at: new Date() } });
  await record({ actor: user, action: 'MFA_VERIFY_SUCCESS', entityType: 'user', entityId: user.id, metadata: { email: user.email } });
  logLogin(req, { user, email: user.email, outcome: 'SUCCESS', reason: 'MFA_SUCCESS' });

  return ok(res, { message: 'Signed in successfully', data: { token: signToken(user), user: publicUser(user) } });
});

/**
 * POST /api/auth/resend-otp - issue a fresh code for an open challenge.
 * Cooldown + send-ceiling + previous-code supersession enforced server-side.
 */
const resendOtp = asyncHandler(async (req, res) => {
  const challengeId = String(req.body.challengeId || '').trim();
  if (!challengeId) {
    return fail(res, { message: otpService.GENERIC_CHALLENGE, errorCode: 'MFA_INVALID', status: 400 });
  }

  const result = await otpService.resendChallenge({ challengeId });
  if (!result.ok) {
    if (result.reason === 'COOLDOWN') {
      await record({ actor: null, action: 'OTP_RESEND_RATE_LIMITED', entityType: 'mfa', entityId: challengeId, result: 'FAILURE', metadata: { retryAfterSeconds: result.retryAfterSeconds } });
      logLogin(req, { user: null, email: null, outcome: 'FAILURE', reason: 'MFA_RATE_LIMITED' });
      return fail(res, {
        message: `Please wait ${result.retryAfterSeconds} seconds before requesting another code.`,
        errorCode: 'MFA_RESEND_COOLDOWN',
        status: 429,
        details: { retryAfterSeconds: result.retryAfterSeconds },
      });
    }
    await record({ actor: null, action: 'MFA_RESEND_FAILURE', entityType: 'mfa', entityId: challengeId, result: 'FAILURE', metadata: { reason: result.reason } });
    return fail(res, { message: otpService.GENERIC_CHALLENGE, errorCode: 'MFA_INVALID', status: 401 });
  }

  await record({ actor: null, action: 'MFA_CHALLENGE_RESENT', entityType: 'mfa', entityId: challengeId, metadata: { sendCount: result.challenge.send_count } });
  const data = { mfaRequired: true, ...result.view };
  if (env.mfa.devMode && result.devCode) data.devCode = result.devCode;
  return ok(res, { message: 'A new verification code has been sent', data });
});

/** GET /api/auth/me - current session. */
const me = asyncHandler(async (req, res) => {
  return ok(res, { message: 'Current session', data: { user: publicUser(req.user) } });
});

module.exports = { register, login, verifyOtp, resendOtp, me };
