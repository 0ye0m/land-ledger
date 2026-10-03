'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * MongoDB document model: users
 * Field names intentionally mirror the legacy PostgreSQL columns so every API
 * response shape stays identical after the Postgres -> MongoDB migration.
 * `_id` IS the UUID (was users.id).
 */

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    full_name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    phone: { type: String, default: null },
    district: { type: String, default: null },
    state: { type: String, default: null },
    wallet_address: { type: String, default: null },
    /** Role hierarchy (escalation order):
     *  citizen -> surveyor (field verification) -> clerk (document verification)
     *  -> registrar (legal approval + on-chain) -> admin (oversight + override). */
    role: { type: String, enum: ['citizen', 'surveyor', 'clerk', 'registrar', 'admin'], default: 'citizen' },
    last_activity_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
    collection: 'users',
  }
);

userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
