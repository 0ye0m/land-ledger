'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * MongoDB document model: property_parties
 *
 * APPLICATION-LEVEL association of people with a land record. This is
 * intentionally separate from the blockchain's single current owner:
 *  - MongoDB  : the full set of legally associated parties (owner, co-owner,
 *               ...extensible) plus consent participation.
 *  - Chain    : LandRegistry.sol keeps representing the ONE current
 *               registered owner (design unchanged).
 *
 * A transfer on a property with 2+ parties here requires multi-party consent
 * before the workflow may advance.
 */

const PARTY_ROLES = ['OWNER', 'CO_OWNER'];

const propertyPartySchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    property_id: { type: String, required: true, index: true }, // properties._id (uuid)
    user_id: { type: String, required: true, index: true },
    party_role: { type: String, enum: PARTY_ROLES, required: true },
    share_percent: { type: Number, default: null }, // optional, demo metadata
    notes: { type: String, default: null },
    added_by: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
    collection: 'property_parties',
  }
);

propertyPartySchema.index({ property_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('PropertyParty', propertyPartySchema);
module.exports.PARTY_ROLES = PARTY_ROLES;
