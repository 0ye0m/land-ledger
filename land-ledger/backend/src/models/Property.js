'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * MongoDB document model: properties
 * `_id` IS the UUID (was properties.id). `property_id` is the business id
 * (PROP-2026-0001), `reference_number` the registry reference (LL/REG/2026/...).
 */

const PROPERTY_TYPES = ['RESIDENTIAL_PLOT', 'RESIDENTIAL_BUILDING', 'COMMERCIAL', 'AGRICULTURAL', 'INDUSTRIAL'];
/**
 * Multi-role workflow stages (status == the office currently holding the file):
 *   SUBMITTED       - citizen filed the application; awaiting field survey
 *   SURVEY_VERIFIED - surveyor cleared the parcel; awaiting document verification
 *   DOCS_VERIFIED   - clerk cleared the documents; awaiting registrar legal review
 *   REGISTERED      - registrar approved + recorded on the blockchain ledger
 *   REJECTED        - rejected (rejection_stage records where it was stopped)
 * Legacy 'PENDING_REVIEW' values are migrated to 'DOCS_VERIFIED' at boot.
 */
const PROPERTY_STATUSES = ['SUBMITTED', 'SURVEY_VERIFIED', 'DOCS_VERIFIED', 'REGISTERED', 'REJECTED'];
const WORKFLOW_STAGES = ['SURVEY', 'DOCUMENT_VERIFICATION', 'REGISTRAR_REVIEW'];

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
    status: { type: String, enum: PROPERTY_STATUSES, default: 'SUBMITTED', index: true },
    review_notes: { type: String, default: null },
    /** Audit trail of every workflow action (survey, verification, approval, rejection). */
    stage_history: {
      type: [
        {
          stage: { type: String, enum: WORKFLOW_STAGES, required: true },
          action: { type: String, required: true },
          by_id: { type: String, default: null },
          by_name: { type: String, default: null },
          by_role: { type: String, default: null },
          notes: { type: String, default: null },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    survey_notes: { type: String, default: null },
    rejection_stage: { type: String, enum: [...WORKFLOW_STAGES, null], default: null },
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
module.exports.WORKFLOW_STAGES = WORKFLOW_STAGES;
/** Statuses held at an office desk (i.e. still actionable). */
module.exports.ACTIVE_STATUSES = ['SUBMITTED', 'SURVEY_VERIFIED', 'DOCS_VERIFIED'];
