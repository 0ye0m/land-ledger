'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * MongoDB document model: blockchain_transactions
 * Every on-chain registry operation (register/transfer) with its REAL
 * transaction hash, or an explicit FAILED record when settlement errors.
 */

const btxSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    property_id: { type: String, default: null, index: true },
    transfer_id: { type: String, default: null, index: true },
    // REAL mined transaction hash when CONFIRMED/PENDING. FAILED rows keep
    // null - a tx that never mined has no hash, and fabricating one poisons
    // every downstream hash consumer (explorer, history, audit).
    transaction_hash: { type: String, default: null, index: true },
    block_number: { type: Number, default: null },
    network: { type: String, default: 'hardhat' },
    contract_address: { type: String, default: null },
    operation: { type: String, enum: ['PROPERTY_REGISTER', 'OWNERSHIP_TRANSFER'], required: true },
    from_address: { type: String, default: null },
    to_address: { type: String, default: null },
    status: { type: String, enum: ['PENDING', 'CONFIRMED', 'FAILED'], required: true },
    error_message: { type: String, default: null },
    timestamp: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
    collection: 'blockchain_transactions',
  }
);

btxSchema.index({ timestamp: -1 });

module.exports = mongoose.model('BlockchainTransaction', btxSchema);
