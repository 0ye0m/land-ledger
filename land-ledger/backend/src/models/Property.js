'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * MongoDB document model: properties
 * `_id` IS the UUID (was properties.id). `property_id` is the business id
 * (PROP-2026-0001), `reference_number` the registry reference (LL/REG/2026/...).
 */

const PROPERTY_TYPES = ['RESIDENTIAL_PLOT', 'RESIDENTIAL_BUILDING', 'COMMERCIAL', 'AGRICULTURAL', 'INDUSTRIAL'];
const PROPERTY_STATUSES = ['PENDING_REVIEW', 'REGISTERED', 'REJECTED'];

const propertySchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    property_id: { type: String, required: true, unique: true },
    reference_number: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    address_line: { type: String, required: true },
    city: { type: String, required: true },
    district: { type: String, required: true },
    state: { type: String, required: true },
    area_value: { type: Number, required: true },
    area_unit: { type: String, required: true, default: 'sq ft' },
    property_type: { type: String, enum: PROPERTY_TYPES, required: true },
    description: { type: String, default: null },
    submitted_by_id: { type: String, default: null, index: true },
    current_owner_id: { type: String, default: null, index: true },
    current_owner_wallet: { type: String, default: null },
    status: { type: String, enum: PROPERTY_STATUSES, default: 'PENDING_REVIEW', index: true },
    review_notes: { type: String, default: null },
    registered_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
    collection: 'properties',
  }
);

propertySchema.index({ district: 1 });
propertySchema.index({ updated_at: -1 });

module.exports = mongoose.model('Property', propertySchema);
module.exports.PROPERTY_TYPES = PROPERTY_TYPES;
module.exports.PROPERTY_STATUSES = PROPERTY_STATUSES;
