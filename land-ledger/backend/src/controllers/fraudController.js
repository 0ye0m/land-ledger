'use strict';

const Property = require('../models/Property');
const User = require('../models/User');
const TransferRequest = require('../models/TransferRequest');
const { toRow } = require('../db/rows');
const { ok, fail } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');
const fraudService = require('../services/fraudService');
const auditService = require('../services/auditService');

/**
 * POST /api/fraud/check - run the rule-based engine against a prospective transfer.
 * Citizens may pre-check their own properties; registrars may check anything.
 */
const checkFraud = asyncHandler(async (req, res) => {
  const propertyRef = String(req.body.propertyId || '').trim();
  const buyerEmail = String(req.body.buyerEmail || '').trim().toLowerCase();

  if (!propertyRef) {
    return fail(res, { message: 'propertyId is required', errorCode: 'VALIDATION_ERROR', status: 422 });
  }

  const propDoc = await Property.findOne({
    $or: [{ property_id: propertyRef }, { _id: propertyRef }],
  }).lean();
  const property = propDoc ? toRow(propDoc) : null;
  if (!property) return fail(res, { message: 'Property not found', errorCode: 'PROPERTY_NOT_FOUND', status: 404 });

  if (req.user.role !== 'registrar' && property.current_owner_id !== req.user.id && property.submitted_by_id !== req.user.id) {
    return fail(res, { message: 'You can only run checks on your own property records', errorCode: 'FORBIDDEN', status: 403 });
  }

  let buyerId = null;
  let buyerWallet = null;
  if (buyerEmail) {
    const buyer = await User.findOne({ email: buyerEmail }).select('wallet_address').lean();
    if (buyer) {
      buyerId = buyer._id;
      buyerWallet = buyer.wallet_address;
    }
  }

  const result = await fraudService.runFraudChecks({
    propertyId: property.property_id,
    sellerId: property.current_owner_id,
    buyerId,
    buyerWallet,
  });

  await auditService.record({
    actor: req.user,
    action: 'FRAUD_CHECK',
    entityType: 'property',
    entityId: property.property_id,
    result: result.isFraudulent ? 'FAILURE' : 'SUCCESS',
    metadata: { riskLevel: result.riskLevel, summary: result.summary },
  });

  return ok(res, { message: 'Fraud and conflict checks completed', data: result });
});

/** GET /api/fraud/:transferId - latest stored fraud check for a transfer. */
const getFraudForTransfer = asyncHandler(async (req, res) => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const doc = await TransferRequest.findOne(
    UUID_RE.test(req.params.transferId) ? { _id: req.params.transferId } : { transfer_reference: req.params.transferId }
  ).lean();
  const record = doc ? toRow(doc) : null;
  if (!record) return fail(res, { message: 'Transfer not found', errorCode: 'TRANSFER_NOT_FOUND', status: 404 });

  const involved = record.seller_id === req.user.id || record.buyer_id === req.user.id;
  if (!involved && req.user.role !== 'registrar') {
    return fail(res, { message: 'You do not have access to this transfer', errorCode: 'FORBIDDEN', status: 403 });
  }

  const fraudCheck = await fraudService.latestFraudCheckForTransfer(record.id);
  if (!fraudCheck) return fail(res, { message: 'No fraud check recorded for this transfer yet', errorCode: 'FRAUD_CHECK_NOT_FOUND', status: 404 });
  return ok(res, { message: 'Fraud check loaded', data: { fraudCheck } });
});

module.exports = { checkFraud, getFraudForTransfer };
