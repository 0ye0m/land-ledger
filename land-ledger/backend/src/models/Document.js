'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * MongoDB document model: documents (registry documents metadata).
 * File bytes live on disk (uploads/); MongoDB stores metadata + SHA-256
 * fingerprint exactly like the legacy PostgreSQL row did.
 */

const DOCUMENT_TYPES = ['TITLE_DEED', 'SALE_AGREEMENT', 'SURVEY_REPORT', 'TAX_RECEIPT', 'IDENTITY_PROOF', 'OTHER'];
const VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'TAMPERED', 'HASH_MISMATCH', 'REJECTED'];

const documentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    property_id: { type: String, required: true, index: true },
    uploaded_by: { type: String, default: null },
    document_type: { type: String, enum: DOCUMENT_TYPES, default: 'OTHER' },
    file_name: { type: String, required: true },
    file_size: { type: Number, required: true },
    mime_type: { type: String, default: null },
    storage_path: { type: String, required: true },
    sha256_hash: { type: String, required: true },
    verification_status: { type: String, enum: VERIFICATION_STATUSES, default: 'PENDING', index: true },
    verified_by: { type: String, default: null },
    verified_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
    collection: 'documents',
  }
);

module.exports = mongoose.model('Document', documentSchema);
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
module.exports.VERIFICATION_STATUSES = VERIFICATION_STATUSES;
