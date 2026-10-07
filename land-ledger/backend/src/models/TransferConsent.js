'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * MongoDB document model: transfer_consents
 *
 * Explicit, per-party consent record for an ownership-changing operation.
 * Consent is NEVER assumed: every required party gets one row and must act.
 *
 * DECISION RULE (enforced server-side, in consentService.resolveAfterDecision):
 *   any  REJECTED                 -> transfer REJECTED
 *   all  APPROVED                 -> transfer advances to the next stage
 *   otherwise                     -> transfer stays CONSENT_PENDING
 *
 * There is no bypass: the rule reads the persisted rows, not client state.
 */

const CONSENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'];
const CONSENT_PARTY_ROLES = ['SELLER', 'CO_OWNER', 'BUYER'];

const transferConsentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    transfer_id: { type: String, required: true, index: true }, // transfer_requests._id
    property_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    party_role: { type: String, enum: CONSENT_PARTY_ROLES, required: true },
    status: { type: String, enum: CONSENT_STATUSES, default: 'PENDING', index: true },
    created_at: { type: Date, default: Date.now },
    responded_at: { type: Date, default: null },
    rejection_reason: { type: String, default: null },
    /** How the consent was produced: PARTY_ACTION (explicit) or seeded history. */
    decided_via: { type: String, enum: ['PARTY_ACTION', 'INITIATION', 'SEEDED'], default: 'PARTY_ACTION' },
  },
  {
    versionKey: false,
    collection: 'transfer_consents',
  }
);

// One consent per (transfer, user) - a party cannot hold two votes.
transferConsentSchema.index({ transfer_id: 1, user_id: 1 }, { unique: true });
transferConsentSchema.index({ user_id: 1, status: 1 });

module.exports = mongoose.model('TransferConsent', transferConsentSchema);
module.exports.CONSENT_STATUSES = CONSENT_STATUSES;
module.exports.CONSENT_PARTY_ROLES = CONSENT_PARTY_ROLES;
