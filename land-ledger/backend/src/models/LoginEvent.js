'use strict';

/**
 * MongoDB collection: login_events
 *
 * Security telemetry for every authentication attempt (new capability - this
 * does NOT exist in PostgreSQL). Recorded best-effort on every login:
 * success and failure, with client IP and user agent, so registrars can spot
 * credential-stuffing or brute-force patterns and the data is inspectable in
 * MongoDB Compass.
 */

const mongoose = require('mongoose');

const loginEventSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    userId: { type: String, default: null }, // PG users.id (uuid string) - null for unknown accounts
    role: { type: String, default: null },
    outcome: { type: String, enum: ['SUCCESS', 'FAILURE'], required: true, index: true },
    reason: { type: String, default: null }, // invalid_password | unknown_account
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
    collection: 'login_events',
  }
);

loginEventSchema.index({ created_at: -1 });
loginEventSchema.index({ email: 1, created_at: -1 });
loginEventSchema.index({ outcome: 1, created_at: -1 });

module.exports = mongoose.model('LoginEvent', loginEventSchema);
