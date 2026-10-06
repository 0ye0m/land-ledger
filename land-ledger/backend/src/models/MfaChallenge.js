'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * MongoDB document model: mfa_challenges
 *
 * One challenge = one email-OTP second factor for one login attempt.
 *
 * SECURITY CONTRACT:
 *  - The 6-digit OTP is NEVER stored in plaintext. Only an HMAC-SHA256 hash
 *    (keyed with OTP_PEPPER) is persisted.
 *  - The OTP is NEVER returned by any API response and NEVER logged.
 *  - A challenge is single-use: a successful verify consumes it.
 *  - Verification is attempt-limited (default 5 wrong entries invalidate it).
 *  - Challenges expire (default 5 minutes).
 *  - A resend invalidates the previous code and is cooldown/rate limited.
 */

const CHALLENGE_TTL_HOURS = 24; // hygiene cleanup; real expiry is expires_at

const mfaChallengeSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    user_id: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: ['LOGIN'], default: 'LOGIN' },
    /** HMAC-SHA256 hex digest of the OTP - plaintext never persisted. */
    otp_hash: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    expires_at: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    max_attempts: { type: Number, default: 5 },
    send_count: { type: Number, default: 1 },
    last_sent_at: { type: Date, default: Date.now },
    consumed: { type: Boolean, default: false, index: true },
    consumed_at: { type: Date, default: null },
    invalidated: { type: Boolean, default: false },
    invalidated_reason: { type: String, default: null }, // max_attempts | superseded | expired | consumed
  },
  {
    versionKey: false,
    collection: 'mfa_challenges',
  }
);

mfaChallengeSchema.index({ expires_at: 1 }, { expireAfterSeconds: CHALLENGE_TTL_HOURS * 3600 });
mfaChallengeSchema.index({ email: 1, created_at: -1 });

module.exports = mongoose.model('MfaChallenge', mfaChallengeSchema);
module.exports.CHALLENGE_TTL_HOURS = CHALLENGE_TTL_HOURS;
