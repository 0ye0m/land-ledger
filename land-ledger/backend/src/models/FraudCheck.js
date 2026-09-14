'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * MongoDB document model: fraud_checks
 * Append-only results of the deterministic rule engine (9 checks).
 */

const fraudCheckSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    transfer_id: { type: String, required: true, index: true },
    is_fraudulent: { type: Boolean, default: false },
    risk_level: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: true },
    reasons: { type: mongoose.Schema.Types.Mixed, default: [] },
    checks_performed: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
    collection: 'fraud_checks',
  }
);

fraudCheckSchema.index({ transfer_id: 1, created_at: -1 });

module.exports = mongoose.model('FraudCheck', fraudCheckSchema);
