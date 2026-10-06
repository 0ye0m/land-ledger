'use strict';

const Property = require('../models/Property');
const User = require('../models/User');
const Document = require('../models/Document');
const TransferRequest = require('../models/TransferRequest');
const BlockchainTransaction = require('../models/BlockchainTransaction');
const Counter = require('../models/Counter');
const { toRow, toRows, caseInsensitive } = require('../db/rows');
const { ok, fail } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');
const { validateTransfer } = require('../validators');
const auditService = require('../services/auditService');
const blockchainService = require('../services/blockchainService');
const fraudService = require('../services/fraudService');
const consentService = require('../services/consentService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Load transfers + decorate with the legacy JOIN shape:
 * property business fields + seller/buyer name/email/wallet.
 */
async function decorateTransfers(transferRows) {
  if (!transferRows.length) return transferRows;
  const propIds = [...new Set(transferRows.map((t) => t.property_id))];
  const personIds = [...new Set(transferRows.flatMap((t) => [t.seller_id, t.buyer_id]).filter(Boolean))];

  const [props, people] = await Promise.all([
    Property.find({ _id: { $in: propIds } }).select('property_id title address_line city district state').lean(),
    personIds.length ? User.find({ _id: { $in: personIds } }).select('full_name email wallet_address').lean() : [],
  ]);
  const propById = Object.fromEntries(props.map((p) => [p._id, p]));
  const personById = Object.fromEntries(people.map((u) => [u._id, u]));

  return transferRows.map((t) => {
    const p = propById[t.property_id] || {};
    const seller = t.seller_id ? personById[t.seller_id] : null;
    const buyer = t.buyer_id ? personById[t.buyer_id] : null;
    return {
      ...t,
      property_business_id: p.property_id || null,
      property_title: p.title || null,
      address_line: p.address_line || null,
      city: p.city || null,
      district: p.district || null,
      state: p.state || null,
      seller_name: seller ? seller.full_name : null,
      seller_email: seller ? seller.email : null,
      seller_wallet_resolved: seller ? seller.wallet_address : null,
      buyer_name: buyer ? buyer.full_name : null,
      buyer_email: buyer ? buyer.email : null,
    };
  });
}

async function getTransferFull(id) {
  const filter = UUID_RE.test(id) ? { _id: id } : { transfer_reference: id };
  const doc = await TransferRequest.findOne(filter).lean();
  if (!doc) return null;
  const [decorated] = await decorateTransfers([toRow(doc)]);
  return decorated;
}

/** POST /api/transfers - citizen creates an ownership transfer request. */
const createTransfer = asyncHandler(async (req, res) => {
  const { valid, errors, value } = validateTransfer(req.body);
  if (!valid) {
    return fail(res, { message: 'Please correct the highlighted fields', errorCode: 'VALIDATION_ERROR', status: 422, details: errors });
  }

  const propDoc = await Property.findOne({
    $or: [{ property_id: value.propertyId }, { _id: value.propertyId }],
  }).lean();
  const property = propDoc ? toRow(propDoc) : null;
  if (!property) {
    return fail(res, { message: 'Property not found', errorCode: 'PROPERTY_NOT_FOUND', status: 404 });
  }

  const buyerDoc = await User.findOne({ email: value.buyerEmail }).lean();
  const buyerUser = buyerDoc ? toRow(buyerDoc) : null;
  if (!buyerUser) {
    return fail(res, { message: 'No registered account found for the buyer email', errorCode: 'BUYER_NOT_FOUND', status: 404 });
  }
  if (buyerUser.id === req.user.id) {
    return fail(res, { message: 'Seller and buyer cannot be the same account', errorCode: 'SELF_TRANSFER', status: 422 });
  }

  // ---- Ownership + conflict validation (pre-flight fraud engine run) ----
  const preflight = await fraudService.runFraudChecks({
    propertyId: property.property_id,
    sellerId: req.user.id,
    buyerId: buyerUser.id,
    buyerWallet: buyerUser.wallet_address,
  });

  const critical = fraudService.criticalReasons(preflight);
  if (critical.length > 0) {
    await auditService.record({
      actor: req.user,
      action: 'TRANSFER_CREATE',
      entityType: 'transfer',
      entityId: property.property_id,
      result: 'FAILURE',
      metadata: { reasons: preflight.reasons },
    });
    const codes = critical.map((c) => c.check);
    const errorCode = codes.includes('NO_DUPLICATE_ACTIVE_TRANSFERS')
      ? 'DUPLICATE_TRANSFER'
      : codes.includes('SELLER_IS_CURRENT_OWNER')
        ? 'SELLER_NOT_OWNER'
        : codes.includes('PROPERTY_STATE_VALID')
          ? 'PROPERTY_INVALID_STATE'
          : codes.includes('NOT_SELF_TRANSFER')
            ? 'SELF_TRANSFER'
            : 'TRANSFER_CONFLICT';
    return fail(res, {
      message: preflight.reasons[0] || 'Transfer request conflicts with current registry state',
      errorCode,
      status: 409,
      details: { reasons: preflight.reasons, checksPerformed: preflight.checksPerformed },
    });
  }

  // ---- Persist transfer + fraud check ----
  const year = new Date().getFullYear();
  const seq = await Counter.nextSeq(`transfer_${year}`);
  const transferReference = `TRF-${year}-${String(seq).padStart(4, '0')}`;

  const sellerWallet = req.user.wallet_address || property.current_owner_wallet;

  const created = await TransferRequest.create({
    transfer_reference: transferReference,
    property_id: property.id,
    seller_id: req.user.id,
    seller_wallet: sellerWallet,
    buyer_id: buyerUser.id,
    buyer_wallet: buyerUser.wallet_address,
    status: 'PENDING',
    risk_level: preflight.riskLevel,
    request_details: value.requestDetails || null,
  });
  const transfer = toRow(created.toObject());
  const fraud = await fraudService.persistFraudCheck(transfer.id, preflight);

  // ---- Multi-party consent gate (Parts 12-14) ----
  // Every associated owner/co-owner plus the buyer must explicitly consent
  // before the file may reach the clerk. The seller's own consent is recorded
  // via INITIATION (filing the request is their explicit act).
  const consents = await consentService.openConsentForTransfer({
    transfer,
    propertyBusinessId: property.property_id,
  });
  const refreshed = toRow(await TransferRequest.findById(transfer.id).lean());
  transfer.status = refreshed.status; // CONSENT_PENDING when extra parties exist

  await auditService.record({
    actor: req.user,
    action: 'TRANSFER_CREATE',
    entityType: 'transfer',
    entityId: transferReference,
    metadata: { propertyId: property.property_id, buyerEmail: value.buyerEmail, riskLevel: preflight.riskLevel, fraudulent: preflight.isFraudulent },
  });
  await auditService.record({
    actor: req.user,
    action: 'FRAUD_CHECK',
    entityType: 'transfer',
    entityId: transferReference,
    result: preflight.isFraudulent ? 'FAILURE' : 'SUCCESS',
    metadata: { riskLevel: preflight.riskLevel, reasons: preflight.reasons, summary: preflight.summary },
  });

  const consentPending = transfer.status === 'CONSENT_PENDING';
  return ok(res, {
    message: consentPending
      ? 'Transfer created - it is now waiting for the required parties to consent before office review begins'
      : 'Transfer request created successfully and sent for registrar review',
    status: 201,
    data: {
      transfer,
      fraud,
      consents: consents.map((c) => ({
        id: c._id,
        user_id: c.user_id,
        party_role: c.party_role,
        status: c.status,
      })),
    },
  });
});

/** GET /api/transfers - scoped list with filters. */
const listTransfers = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || '10', 10)));
  const filter = {};

  if (req.user.role === 'citizen') {
    filter.$or = [{ seller_id: req.user.id }, { buyer_id: req.user.id }];
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.risk) filter.risk_level = req.query.risk;

  // Property/applicant filters resolve against joins first.
  if (req.query.propertyId) {
    const props = await Property.find({ property_id: caseInsensitive(req.query.propertyId) }).select('_id').lean();
    filter.property_id = { $in: props.map((p) => p._id) };
  }
  if (req.query.applicant) {
    const applicants = await User.find({ full_name: caseInsensitive(req.query.applicant) }).select('_id').lean();
    const applicantIds = applicants.map((u) => u._id);
    const involved = [{ seller_id: { $in: applicantIds } }, { buyer_id: { $in: applicantIds } }];
    filter.$and = [...(filter.$and || []), { $or: involved }];
  }
  if (req.query.from || req.query.to) {
    filter.created_at = {};
    if (req.query.from) filter.created_at.$gte = new Date(`${req.query.from}T00:00:00.000Z`);
    if (req.query.to) {
      const toDate = new Date(`${req.query.to}T00:00:00.000Z`);
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      filter.created_at.$lt = toDate;
    }
  }

  const total = await TransferRequest.countDocuments(filter);
  const docs = await TransferRequest.find(filter)
    .sort({ created_at: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();
  const transfers = await decorateTransfers(toRows(docs));

  return ok(res, { message: 'Transfers loaded', data: { transfers, total, page, pageSize } });
});

/** GET /api/transfers/:id - detail with fraud results + blockchain result + audit trail. */
const getTransfer = asyncHandler(async (req, res) => {
  const transfer = await getTransferFull(req.params.id);
  if (!transfer) return fail(res, { message: 'Transfer not found', errorCode: 'TRANSFER_NOT_FOUND', status: 404 });

  const involved = transfer.seller_id === req.user.id || transfer.buyer_id === req.user.id;
  const consentParty = involved ? false : await consentService.isConsentParty({ transferId: transfer.id, userId: req.user.id });
  const staffViewer = ['registrar', 'admin'].includes(req.user.role);
  if (!involved && !consentParty && !staffViewer) {
    return fail(res, { message: 'You do not have access to this transfer', errorCode: 'FORBIDDEN', status: 403 });
  }

  const [documentDocs, fraudCheck, txDoc, auditTrail, consentRows] = await Promise.all([
    Document.find({ property_id: transfer.property_id }).sort({ created_at: -1 }).lean(),
    fraudService.latestFraudCheckForTransfer(transfer.id),
    BlockchainTransaction.findOne({ transfer_id: transfer.id }).sort({ created_at: -1 }).lean(),
    auditService.trailForEntity({ entityType: 'transfer', entityId: transfer.transfer_reference }),
    consentService.consentsForTransfer(transfer.id),
  ]);
  const consents = consentRows.map((r) => ({ ...r, is_me: String(r.user_id) === String(req.user.id) }));

  const uploaderIds = [...new Set(documentDocs.map((d) => d.uploaded_by).filter(Boolean))];
  const uploaders = uploaderIds.length ? await User.find({ _id: { $in: uploaderIds } }).select('full_name').lean() : [];
  const uploaderById = Object.fromEntries(uploaders.map((u) => [u._id, u.full_name]));
  const documents = toRows(documentDocs).map((d) => ({
    ...d,
    uploaded_by_name: d.uploaded_by ? uploaderById[d.uploaded_by] || null : null,
  }));

  return ok(res, {
    message: 'Transfer loaded',
    data: {
      transfer,
      documents,
      fraudCheck,
      blockchainTransaction: txDoc ? toRow(txDoc) : null,
      auditTrail,
      consents,
      myConsent: (consents.find((c) => c.is_me && c.status === 'PENDING')
        ? { consentId: consents.find((c) => c.is_me && c.status === 'PENDING').id, partyRole: consents.find((c) => c.is_me && c.status === 'PENDING').party_role, status: 'PENDING' }
        : null),
    },
  });
});

/** POST /api/transfers/:id/approve - registrar approves + settles on-chain. */
const approveTransfer = asyncHandler(async (req, res) => {
  if (req.user.role !== 'registrar') {
    return fail(res, { message: 'Only registrars can approve transfers', errorCode: 'FORBIDDEN', status: 403 });
  }
  const transfer = await getTransferFull(req.params.id);
  if (!transfer) return fail(res, { message: 'Transfer not found', errorCode: 'TRANSFER_NOT_FOUND', status: 404 });
  if (transfer.status === 'CONSENT_PENDING') {
    await auditService.record({
      actor: req.user, action: 'TRANSFER_BLOCKED_CONSENT', entityType: 'transfer', entityId: transfer.transfer_reference,
      result: 'FAILURE', metadata: { stage: 'REGISTRAR_APPROVAL', reason: 'required-party consent incomplete' },
    });
    return fail(res, { message: 'This transfer is still waiting for the required parties to consent. Approval is blocked until every party has explicitly agreed.', errorCode: 'CONSENT_INCOMPLETE', status: 409 });
  }
  if (transfer.status !== 'DOCS_VERIFIED') {
    return fail(res, { message: `Only transfers cleared by document verification can be approved (current stage: ${transfer.status}). The clerk verifies documents first.`, errorCode: 'INVALID_STATE', status: 409 });
  }

  // Fresh fraud gate at decision time.
  const fresh = await fraudService.runFraudChecks({
    propertyId: transfer.property_business_id,
    sellerId: transfer.seller_id,
    buyerId: transfer.buyer_id,
    buyerWallet: transfer.buyer_wallet,
    excludeTransferId: transfer.id,
    createdAt: transfer.created_at,
  });
  await fraudService.persistFraudCheck(transfer.id, fresh);
  if (fresh.isFraudulent) {
    await auditService.record({
      actor: req.user, action: 'TRANSFER_APPROVE', entityType: 'transfer', entityId: transfer.transfer_reference,
      result: 'FAILURE', metadata: { blockedBy: 'FRAUD_ENGINE', reasons: fresh.reasons },
    });
    return fail(res, {
      message: 'Approval blocked by the fraud engine',
      errorCode: 'TRANSFER_BLOCKED_BY_FRAUD',
      status: 409,
      details: { reasons: fresh.reasons, checksPerformed: fresh.checksPerformed },
    });
  }

  // Atomic guarded transition: only one approver can flip DOCS_VERIFIED -> APPROVED.
  const approvalReason = String(req.body.reason || '').trim() || 'Approved after registrar review';
  const claimed = await TransferRequest.findOneAndUpdate(
    { _id: transfer.id, status: 'DOCS_VERIFIED' },
    { $set: { status: 'APPROVED', approved_by: req.user.id, approved_at: new Date(), approval_reason: approvalReason } },
    { new: true }
  ).lean();
  if (!claimed) {
    return fail(res, { message: 'Transfer is no longer awaiting registrar approval', errorCode: 'INVALID_STATE', status: 409 });
  }
  await auditService.record({
    actor: req.user, action: 'TRANSFER_APPROVE', entityType: 'transfer', entityId: transfer.transfer_reference,
    metadata: { propertyId: transfer.property_business_id, buyer: transfer.buyer_email },
  });

  // ---- Blockchain settlement (ownership changes ONLY after confirmation) ----
  let receipt;
  try {
    receipt = await blockchainService.transferOwnershipOnChain(
      transfer.property_business_id,
      transfer.seller_wallet,
      transfer.buyer_wallet
    );
  } catch (err) {
    // Do NOT change ownership; store failed tx state and mark transfer FAILED.
    await BlockchainTransaction.create({
      property_id: transfer.property_id,
      transfer_id: transfer.id,
      transaction_hash: `failed-${Date.now()}`,
      block_number: null,
      network: 'hardhat',
      contract_address: null,
      operation: 'OWNERSHIP_TRANSFER',
      from_address: transfer.seller_wallet,
      to_address: transfer.buyer_wallet,
      status: 'FAILED',
      error_message: blockchainService.humanError(err),
      timestamp: new Date(),
    });
    await TransferRequest.updateOne({ _id: transfer.id }, { $set: { status: 'FAILED' } });
    await auditService.record({
      actor: req.user, action: 'BLOCKCHAIN_TX_FAILED', entityType: 'transfer', entityId: transfer.transfer_reference,
      result: 'FAILURE', metadata: { error: blockchainService.humanError(err) },
    });
    return fail(res, {
      message: `Blockchain settlement failed - ownership was not changed: ${blockchainService.humanError(err)}`,
      errorCode: 'BLOCKCHAIN_SETTLEMENT_FAILED',
      status: 502,
    });
  }

  const txCreated = await BlockchainTransaction.create({
    property_id: transfer.property_id,
    transfer_id: transfer.id,
    transaction_hash: receipt.transactionHash,
    block_number: receipt.blockNumber,
    network: 'hardhat',
    contract_address: blockchainService.getContractAddress(),
    operation: 'OWNERSHIP_TRANSFER',
    from_address: transfer.seller_wallet,
    to_address: transfer.buyer_wallet,
    status: 'CONFIRMED',
    timestamp: new Date(),
  });

  // Settlement bookkeeping (guarded): flip owner, then mark transfer COMPLETED.
  await Property.updateOne(
    { _id: transfer.property_id, status: 'REGISTERED' },
    { $set: { current_owner_id: transfer.buyer_id, current_owner_wallet: transfer.buyer_wallet } }
  );
  await TransferRequest.updateOne({ _id: transfer.id, status: 'APPROVED' }, { $set: { status: 'COMPLETED' } });

  await auditService.record({
    actor: req.user, action: 'BLOCKCHAIN_TX', entityType: 'blockchain', entityId: receipt.transactionHash,
    metadata: { operation: 'OWNERSHIP_TRANSFER', propertyId: transfer.property_business_id, block: receipt.blockNumber },
  });
  await auditService.record({
    actor: req.user, action: 'OWNERSHIP_CHANGE', entityType: 'property', entityId: transfer.property_business_id,
    metadata: { transferRef: transfer.transfer_reference, previousOwner: transfer.seller_name, newOwner: transfer.buyer_name, txHash: receipt.transactionHash },
  });

  const updated = await getTransferFull(transfer.id);
  return ok(res, {
    message: 'Transfer approved and settled on the ledger. Ownership updated.',
    data: { transfer: updated, blockchainTransaction: toRow(txCreated.toObject()) },
  });
});

/** POST /api/transfers/:id/reject - registrar rejects with a mandatory reason. */
const rejectTransfer = asyncHandler(async (req, res) => {
  if (req.user.role !== 'registrar') {
    return fail(res, { message: 'Only registrars can reject transfers', errorCode: 'FORBIDDEN', status: 403 });
  }
  const transfer = await getTransferFull(req.params.id);
  if (!transfer) return fail(res, { message: 'Transfer not found', errorCode: 'TRANSFER_NOT_FOUND', status: 404 });
  if (!['DOCS_VERIFIED', 'APPROVED'].includes(transfer.status)) {
    return fail(res, { message: `Only transfers awaiting or under registrar review can be rejected here (current: ${transfer.status}). Pending files are rejected by the clerk.`, errorCode: 'INVALID_STATE', status: 409 });
  }

  const reason = String(req.body.reason || '').trim();
  if (!reason) {
    return fail(res, { message: 'A rejection reason is required', errorCode: 'REASON_REQUIRED', status: 422 });
  }

  const updatedDoc = await TransferRequest.findOneAndUpdate(
    { _id: transfer.id, status: { $in: ['DOCS_VERIFIED', 'APPROVED'] } },
    { $set: { status: 'REJECTED', rejected_by: req.user.id, rejection_reason: reason, rejection_stage: 'REGISTRAR_REVIEW' } },
    { new: true }
  ).lean();

  await auditService.record({
    actor: req.user, action: 'TRANSFER_REJECT', entityType: 'transfer', entityId: transfer.transfer_reference,
    result: 'FAILURE', metadata: { propertyId: transfer.property_business_id, reason },
  });

  return ok(res, { message: 'Transfer rejected', data: { transfer: toRow(updatedDoc) } });
});

module.exports = { createTransfer, listTransfers, getTransfer, approveTransfer, rejectTransfer };
