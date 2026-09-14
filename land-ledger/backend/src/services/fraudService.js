'use strict';

/**
 * LAND LEDGER - rule-based fraud and conflict detection engine.
 *
 * Deterministic checks only. This is NOT an AI/ML system.
 * Every check returns PASS / WARN / FAIL with a human-readable detail so the
 * registrar UI can render exact outcomes.
 *
 * FAIL => isFraudulent = true, riskLevel HIGH (hard conflict).
 * WARN => riskLevel contribution MEDIUM (soft risk, transfer still allowed).
 */

const Property = require('../models/Property');
const Document = require('../models/Document');
const TransferRequest = require('../models/TransferRequest');
const FraudCheck = require('../models/FraudCheck');
const { toRow } = require('../db/rows');

const CHECKS = {
  PROPERTY_EXISTS: 'Property exists in the registry',
  PROPERTY_STATE_VALID: 'Property is in a valid state for transfer',
  SELLER_IS_CURRENT_OWNER: 'Requested seller is the current registered owner',
  NO_DUPLICATE_ACTIVE_TRANSFERS: 'No other active transfer request exists for this property',
  NOT_SELF_TRANSFER: 'Seller and buyer are different parties',
  DOCUMENTS_PRESENT: 'Property has supporting documents',
  DOCUMENT_HASH_INTEGRITY: 'Supporting documents pass SHA-256 integrity checks',
  BUYER_WALLET_PRESENT: 'Buyer wallet address is available for ledger settlement',
  NO_COMPLETED_TRANSFER_AFTER_REQUEST: 'Ownership has not already changed after this request',
};

function check(name, status, detail) {
  return { check: name, label: CHECKS[name] || name, status, detail };
}

/**
 * Run all fraud/conflict checks for a prospective or existing transfer.
 * @param {object} input
 * @param {string|null} input.propertyId        - business property id (PROP-...)
 * @param {string|null} input.dbPropertyId      - internal UUID (when transfer exists)
 * @param {string|null} input.sellerId
 * @param {string|null} input.buyerId
 * @param {string|null} input.buyerWallet
 * @param {string|null} input.excludeTransferId - transfer to exclude in duplicate scans
 * @param {Date|string|null} input.createdAt    - request timestamp for ordering checks
 */
async function runFraudChecks(input) {
  const reasons = [];
  const checksPerformed = [];
  let property = null;

  // 1. Property exists
  if (input.dbPropertyId) {
    const doc = await Property.findById(input.dbPropertyId).lean();
    property = doc ? toRow(doc) : null;
  } else if (input.propertyId) {
    const doc = await Property.findOne({ property_id: input.propertyId }).lean();
    property = doc ? toRow(doc) : null;
  }

  if (!property) {
    checksPerformed.push(check('PROPERTY_EXISTS', 'FAIL', 'Property does not exist in the registry'));
    reasons.push('Property does not exist in the registry');
  } else {
    checksPerformed.push(check('PROPERTY_EXISTS', 'PASS', `Matched ${property.property_id}`));
  }

  // 2. Property state valid for transfer
  if (property) {
    if (property.status === 'REGISTERED') {
      checksPerformed.push(check('PROPERTY_STATE_VALID', 'PASS', 'Property is registered and active'));
    } else {
      checksPerformed.push(check('PROPERTY_STATE_VALID', 'FAIL', `Property state ${property.status} cannot be transferred`));
      reasons.push('Property is in a conflicting or invalid state for transfer');
    }
  } else {
    checksPerformed.push(check('PROPERTY_STATE_VALID', 'WARN', 'Skipped - property not found'));
  }

  // 3. Seller is current owner
  if (property && input.sellerId) {
    if (property.current_owner_id === input.sellerId) {
      checksPerformed.push(check('SELLER_IS_CURRENT_OWNER', 'PASS', 'Requested seller matches the current registered owner'));
    } else {
      checksPerformed.push(check('SELLER_IS_CURRENT_OWNER', 'FAIL', 'Requested seller is not the current registered owner'));
      reasons.push('Requested seller is not the current owner of the property');
    }
  } else if (property) {
    checksPerformed.push(check('SELLER_IS_CURRENT_OWNER', 'WARN', 'Seller could not be resolved'));
  } else {
    checksPerformed.push(check('SELLER_IS_CURRENT_OWNER', 'WARN', 'Skipped - property not found'));
  }

  // 4. Duplicate active transfer requests
  if (property) {
    const dupFilter = { property_id: property.id, status: { $in: ['PENDING', 'APPROVED'] } };
    if (input.excludeTransferId) dupFilter._id = { $ne: input.excludeTransferId };
    const active = await TransferRequest.countDocuments(dupFilter);
    if (active > 0) {
      checksPerformed.push(check('NO_DUPLICATE_ACTIVE_TRANSFERS', 'FAIL', `${active} active transfer request(s) already exist for this property`));
      reasons.push('Another transfer request already exists for this property');
    } else {
      checksPerformed.push(check('NO_DUPLICATE_ACTIVE_TRANSFERS', 'PASS', 'No competing active transfer requests'));
    }
  } else {
    checksPerformed.push(check('NO_DUPLICATE_ACTIVE_TRANSFERS', 'WARN', 'Skipped - property not found'));
  }

  // 5. Self transfer
  if (input.sellerId && input.buyerId) {
    if (input.sellerId === input.buyerId) {
      checksPerformed.push(check('NOT_SELF_TRANSFER', 'FAIL', 'Seller and buyer are the same account'));
      reasons.push('Seller and buyer cannot be the same account');
    } else {
      checksPerformed.push(check('NOT_SELF_TRANSFER', 'PASS', 'Seller and buyer are distinct parties'));
    }
  } else {
    checksPerformed.push(check('NOT_SELF_TRANSFER', 'WARN', 'Buyer or seller missing'));
  }

  // 6. Documents present
  let tampered = 0;
  let pending = 0;
  let total = 0;
  if (property) {
    const groups = await Document.aggregate([
      { $match: { property_id: property.id } },
      { $group: { _id: '$verification_status', n: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(groups.map((g) => [g._id, g.n]));
    total = Object.values(counts).reduce((a, b) => a + b, 0);
    tampered = (counts.TAMPERED || 0) + (counts.HASH_MISMATCH || 0);
    pending = counts.PENDING || 0;

    if (total === 0) {
      checksPerformed.push(check('DOCUMENTS_PRESENT', 'WARN', 'No supporting documents attached to this property'));
      reasons.push('No supporting documents are attached to this property');
    } else {
      checksPerformed.push(check('DOCUMENTS_PRESENT', 'PASS', `${total} supporting document(s) on record`));
    }
  } else {
    checksPerformed.push(check('DOCUMENTS_PRESENT', 'WARN', 'Skipped - property not found'));
  }

  // 7. Document hash integrity
  if (property) {
    if (tampered > 0) {
      checksPerformed.push(check('DOCUMENT_HASH_INTEGRITY', 'FAIL', `${tampered} document(s) failed SHA-256 integrity verification`));
      reasons.push(`${tampered} supporting document(s) have a SHA-256 hash mismatch (possible tampering)`);
    } else if (pending > 0) {
      checksPerformed.push(check('DOCUMENT_HASH_INTEGRITY', 'WARN', `${pending} document(s) still awaiting registrar verification`));
      reasons.push(`${pending} supporting document(s) are still awaiting registrar verification`);
    } else if (total > 0) {
      checksPerformed.push(check('DOCUMENT_HASH_INTEGRITY', 'PASS', 'All documents verified with intact SHA-256 hashes'));
    }
  } else {
    checksPerformed.push(check('DOCUMENT_HASH_INTEGRITY', 'WARN', 'Skipped - property not found'));
  }

  // 8. Buyer wallet present (needed for on-chain settlement)
  if (input.buyerWallet && /^0x[a-fA-F0-9]{40}$/.test(input.buyerWallet)) {
    checksPerformed.push(check('BUYER_WALLET_PRESENT', 'PASS', 'Buyer wallet captured for ledger settlement'));
  } else {
    checksPerformed.push(check('BUYER_WALLET_PRESENT', 'WARN', 'Buyer wallet address missing or malformed; ledger settlement cannot proceed'));
    reasons.push('Buyer wallet address is missing or invalid for ledger-backed settlement');
  }

  // 9. Ownership already changed after request
  if (property && input.createdAt && input.excludeTransferId) {
    const completed = await TransferRequest.countDocuments({
      property_id: property.id,
      status: 'COMPLETED',
      created_at: { $gt: new Date(input.createdAt) },
      _id: { $ne: input.excludeTransferId },
    });
    if (completed > 0) {
      checksPerformed.push(check('NO_COMPLETED_TRANSFER_AFTER_REQUEST', 'FAIL', 'A newer transfer already completed after this request was created'));
      reasons.push('Transfer requested after ownership had already changed');
    } else {
      checksPerformed.push(check('NO_COMPLETED_TRANSFER_AFTER_REQUEST', 'PASS', 'No settlement supersedes this request'));
    }
  } else {
    checksPerformed.push(check('NO_COMPLETED_TRANSFER_AFTER_REQUEST', 'PASS', 'New request - no superseding settlement'));
  }

  const failed = checksPerformed.filter((c) => c.status === 'FAIL');
  const warned = checksPerformed.filter((c) => c.status === 'WARN');
  const riskLevel = failed.length > 0 ? 'HIGH' : warned.length > 0 ? 'MEDIUM' : 'LOW';
  const isFraudulent = failed.length > 0;

  return {
    isFraudulent,
    riskLevel,
    reasons: [...new Set(reasons)],
    checksPerformed,
    summary: { pass: checksPerformed.length - failed.length - warned.length, warn: warned.length, fail: failed.length },
  };
}

/** Critical conflicts that block creation of a new transfer request outright. */
function criticalReasons(result) {
  const criticalLabels = new Set([
    'PROPERTY_EXISTS',
    'PROPERTY_STATE_VALID',
    'SELLER_IS_CURRENT_OWNER',
    'NO_DUPLICATE_ACTIVE_TRANSFERS',
    'NOT_SELF_TRANSFER',
  ]);
  return result.checksPerformed.filter((c) => c.status === 'FAIL' && criticalLabels.has(c.check));
}

async function persistFraudCheck(transferId, result) {
  return FraudCheck.create({
    transfer_id: String(transferId),
    is_fraudulent: result.isFraudulent,
    risk_level: result.riskLevel,
    reasons: result.reasons,
    checks_performed: result.checksPerformed,
  }).then((d) => toRow(d.toObject()));
}

async function latestFraudCheckForTransfer(transferId) {
  const doc = await FraudCheck.findOne({ transfer_id: String(transferId) })
    .sort({ created_at: -1 })
    .lean();
  return doc ? toRow(doc) : null;
}

module.exports = { runFraudChecks, criticalReasons, persistFraudCheck, latestFraudCheckForTransfer, CHECKS };
