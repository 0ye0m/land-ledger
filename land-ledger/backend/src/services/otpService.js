'use strict';

/**
 * LAND LEDGER - email-OTP second factor (Parts 4/6/7/23 of the MFA spec).
 *
 * Guarantees implemented here (server-side, no frontend trust):
 *  - 6-digit numeric OTP from a cryptographically secure RNG (crypto.randomInt).
 *  - 5 minute expiry, single-use consumption, max 5 wrong attempts.
 *  - OTP stored ONLY as an HMAC-SHA256 hash keyed by a server-side pepper;
 *    comparison is timing-safe. Plaintext is never persisted, returned or logged.
 *  - Generation rate limits: cooldown between sends, send ceiling per
 *    challenge, hourly challenge ceiling per account.
 *  - A new send invalidates the previous code (supersede) and resets expiry.
 *  - Every outcome answers with GENERIC messages (no account-state leaks).
 */

const crypto = require('crypto');
const MfaChallenge = require('../models/MfaChallenge');
const env = require('../config/env');
const emailService = require('./emailService');

const GENERIC_INVALID = 'Invalid or expired verification code.';
const GENERIC_CHALLENGE = 'This verification request is no longer valid. Please sign in again.';

function hmacOtp(otp) {
  return crypto.createHmac('sha256', env.mfa.otpPepper).update(String(otp), 'utf8').digest('hex');
}

function timingSafeEqualHex(aHex, bHex) {
  const a = Buffer.from(String(aHex), 'utf8');
  const b = Buffer.from(String(bHex), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Result codes kept internal; the controller maps them to generic HTTP answers. */
const ERR = {
  NOT_FOUND: 'NOT_FOUND',
  CONSUMED: 'CONSUMED',
  INVALIDATED: 'INVALIDATED',
  EXPIRED: 'EXPIRED',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  MISMATCH: 'MISMATCH',
};

/**
 * Create a challenge for a verified password login, email the OTP, and return
 * the sanitized challenge view. Returns { ok, challenge, view } or { ok:false, reason }.
 */
async function createChallenge({ user, ip }) {
  // Rate limit: max N challenges per hour per account (prevents OTP spam loops).
  const since = new Date(Date.now() - 3600000);
  const recentCount = await MfaChallenge.countDocuments({ user_id: user.id, created_at: { $gte: since } });
  if (recentCount >= env.mfa.maxChallengesPerHour) {
    return { ok: false, reason: 'RATE_LIMITED' };
  }

  // Supersede any previous open challenges for this user (invalidate old codes).
  await MfaChallenge.updateMany(
    { user_id: user.id, consumed: false, invalidated: false },
    { $set: { invalidated: true, invalidated_reason: 'superseded' } }
  );

  const otp = String(crypto.randomInt(0, 10 ** env.mfa.otpLength)).padStart(env.mfa.otpLength, '0');
  const expiresAt = new Date(Date.now() + env.mfa.otpTtlMinutes * 60000);
  const challenge = await MfaChallenge.create({
    user_id: user.id,
    email: user.email,
    otp_hash: hmacOtp(otp),
    expires_at: expiresAt,
  });

  const mail = emailService.otpEmail({ name: user.full_name, code: otp, minutes: env.mfa.otpTtlMinutes });
  const sent = await emailService.sendMail({ to: user.email, subject: mail.subject, text: mail.text });
  if (!sent.sent) {
    // Fail safely: no email delivery => no usable challenge.
    await MfaChallenge.updateOne({ _id: challenge._id }, { $set: { invalidated: true, invalidated_reason: 'send_failed' } });
    return { ok: false, reason: sent.reason === 'not_configured' ? 'EMAIL_NOT_CONFIGURED' : 'EMAIL_SEND_FAILED' };
  }

  const view = challengeView(challenge);
  // DEMO-ONLY: in explicitly gated dev mode the just-generated plaintext OTP
  // is surfaced to the caller so the demo can complete without a mailbox.
  // Never in production; never when real SMTP is configured.
  const devCode = env.mfa.devMode && !emailService.smtpConfigured() ? otp : undefined;
  return { ok: true, challenge, view, devCode };
}

/** Resend: cooldown + ceiling + supersede + fresh expiry. */
async function resendChallenge({ challengeId }) {
  const challenge = await MfaChallenge.findById(challengeId);
  if (!challenge || challenge.consumed || challenge.invalidated) {
    return { ok: false, reason: ERR.NOT_FOUND };
  }
  if (challenge.expires_at.getTime() < Date.now()) {
    await MfaChallenge.updateOne({ _id: challenge._id, invalidated: false }, { $set: { invalidated: true, invalidated_reason: 'expired' } });
    return { ok: false, reason: ERR.EXPIRED };
  }
  const elapsed = (Date.now() - challenge.last_sent_at.getTime()) / 1000;
  if (elapsed < env.mfa.resendCooldownSeconds) {
    return { ok: false, reason: 'COOLDOWN', retryAfterSeconds: Math.ceil(env.mfa.resendCooldownSeconds - elapsed) };
  }
  if (challenge.send_count >= env.mfa.maxSendsPerChallenge) {
    await MfaChallenge.updateOne({ _id: challenge._id }, { $set: { invalidated: true, invalidated_reason: 'send_limit' } });
    return { ok: false, reason: 'SEND_LIMIT' };
  }

  const otp = String(crypto.randomInt(0, 10 ** env.mfa.otpLength)).padStart(env.mfa.otpLength, '0');
  challenge.otp_hash = hmacOtp(otp);
  challenge.expires_at = new Date(Date.now() + env.mfa.otpTtlMinutes * 60000);
  challenge.attempts = 0; // a fresh code gets fresh attempts
  challenge.send_count += 1;
  challenge.last_sent_at = new Date();
  await challenge.save();

  const User = require('../models/User');
  const userDoc = await User.findById(challenge.user_id).lean();
  const name = userDoc ? userDoc.full_name : '';
  const mail = emailService.otpEmail({ name, code: otp, minutes: env.mfa.otpTtlMinutes });
  const sent = await emailService.sendMail({ to: challenge.email, subject: mail.subject, text: mail.text });
  if (!sent.sent) {
    return { ok: false, reason: sent.reason === 'not_configured' ? 'EMAIL_NOT_CONFIGURED' : 'EMAIL_SEND_FAILED' };
  }
  const devCode = env.mfa.devMode && !emailService.smtpConfigured() ? otp : undefined;
  return { ok: true, challenge, view: challengeView(challenge), devCode };
}

/** Verify an OTP; consume the challenge on success, count attempts on failure. */
async function verifyChallenge({ challengeId, otp }) {
  const challenge = await MfaChallenge.findById(challengeId);
  if (!challenge) return { ok: false, reason: ERR.NOT_FOUND };
  if (challenge.consumed) return { ok: false, reason: ERR.CONSUMED };
  if (challenge.invalidated) return { ok: false, reason: ERR.INVALIDATED };
  if (challenge.expires_at.getTime() < Date.now()) {
    await MfaChallenge.updateOne({ _id: challenge._id, invalidated: false }, { $set: { invalidated: true, invalidated_reason: 'expired' } });
    return { ok: false, reason: ERR.EXPIRED };
  }
  if (challenge.attempts >= challenge.max_attempts) {
    await MfaChallenge.updateOne({ _id: challenge._id }, { $set: { invalidated: true, invalidated_reason: 'max_attempts' } });
    return { ok: false, reason: ERR.TOO_MANY_ATTEMPTS };
  }

  const matches = timingSafeEqualHex(challenge.otp_hash, hmacOtp(String(otp || '').trim()));
  if (!matches) {
    const attempts = challenge.attempts + 1;
    const giveUp = attempts >= challenge.max_attempts;
    await MfaChallenge.updateOne(
      { _id: challenge._id },
      giveUp
        ? { $set: { attempts, invalidated: true, invalidated_reason: 'max_attempts' } }
        : { $set: { attempts } }
    );
    return { ok: false, reason: giveUp ? ERR.TOO_MANY_ATTEMPTS : ERR.MISMATCH, attemptsLeft: Math.max(0, challenge.max_attempts - attempts) };
  }

  // Single-use consumption (guarded update - replay cannot double-consume).
  const consumed = await MfaChallenge.findOneAndUpdate(
    { _id: challenge._id, consumed: false },
    { $set: { consumed: true, consumed_at: new Date() } },
    { new: true }
  ).lean();
  if (!consumed) return { ok: false, reason: ERR.CONSUMED };

  const User = require('../models/User');
  const userDoc = await User.findById(challenge.user_id).lean();
  if (!userDoc) return { ok: false, reason: ERR.NOT_FOUND };
  return { ok: true, user: userDoc, challenge: consumed };
}

/** Sanitized API view - no OTP, no hash, no internal counters beyond expiry. */
function challengeView(challenge) {
  const { maskEmail } = require('../config/allowlist');
  const secondsLeft = Math.max(0, Math.floor((challenge.expires_at.getTime() - Date.now()) / 1000));
  return {
    challengeId: String(challenge._id),
    maskedEmail: maskEmail(challenge.email),
    expiresInSeconds: secondsLeft,
    resendCooldownSeconds: env.mfa.resendCooldownSeconds,
  };
}

module.exports = {
  ERR,
  GENERIC_INVALID,
  GENERIC_CHALLENGE,
  createChallenge,
  resendChallenge,
  verifyChallenge,
  challengeView,
};
