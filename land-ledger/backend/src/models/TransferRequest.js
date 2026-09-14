'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * MongoDB document model: transfer_requests
 * Status machine: PENDING -> APPROVED -> COMPLETED, or PENDING/APPROVED -> REJECTED,
 * or PENDING -> FAILED (blockchain settlement failure).
 */

const TRANSFER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED'];
const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

const transferRequestSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    transfer_reference: { type: String, required: true, unique: true },
    property_id: { type: String, required: true, index: true },
    seller_id: { type: String, default: null, index: true },
    seller_wallet: { type: String, default: null },
    buyer_id: { type: String, default: null, index: true },
    buyer_wallet: { type: String, default: null },
    status: { type: String, enum: TRANSFER_STATUSES, default: 'PENDING', index: true },
    risk_level: { type: String, enum: RISK_LEVELS, default: 'LOW' },
    request_details: { type: String, default: null },
    approval_reason: { type: String, default: null },
    rejection_reason: { type: String, default: null },
    approved_by: { type: String, default: null },
    approved_at: { type: Date, default: null },
    rejected_by: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
    collection: 'transfer_requests',
  }
);

transferRequestSchema.index({ created_at: -1 });

module.exports = mongoose.model('TransferRequest', transferRequestSchema);
module.exports.TRANSFER_STATUSES = TRANSFER_STATUSES;
module.exports.RISK_LEVELS = RISK_LEVELS;
