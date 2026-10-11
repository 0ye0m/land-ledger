'use strict';

const Property = require('../models/Property');
const User = require('../models/User');
const Document = require('../models/Document');
const TransferRequest = require('../models/TransferRequest');
const FraudCheck = require('../models/FraudCheck');
const BlockchainTransaction = require('../models/BlockchainTransaction');
const { toRow, toRows } = require('../db/rows');
const { ok, fail } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');
const auditService = require('../services/auditService');
const mongo = require('../db/mongo');
const AuditEvent = require('../models/AuditEvent');
const LoginEvent = require('../models/LoginEvent');
const blockchainService = require('../services/blockchainService');

/** GET /api/registrar/dashboard - operational metrics. */
const dashboard = asyncHandler(async (req, res) => {
  const [
    pendingRegistrations,
    pendingTransfers,
    pendingTransferIds,
    verifiedDocuments,
    rejectedProperties,
    rejectedTransfers,
    confirmedTransactions,
    documentsNeedingAttention,
    recentTransactionDocs,
    highRiskDocs,
    docActivityDocs,
  ] = await Promise.all([
    Property.countDocuments({ status: { $in: ['SUBMITTED', 'SURVEY_VERIFIED', 'DOCS_VERIFIED'] } }),
    TransferRequest.countDocuments({ status: { $in: ['PENDING', 'DOCS_VERIFIED'] } }),
    TransferRequest.find({ status: { $in: ['PENDING', 'DOCS_VERIFIED'] } }).select('_id').lean(),
    Document.countDocuments({ verification_status: 'VERIFIED' }),
    Property.countDocuments({ status: 'REJECTED' }),
    TransferRequest.countDocuments({ status: 'REJECTED' }),
    BlockchainTransaction.countDocuments({ status: 'CONFIRMED' }),
    Document.countDocuments({ verification_status: { $in: ['PENDING', 'TAMPERED'] } }),
    BlockchainTransaction.find().sort({ created_at: -1 }).limit(6).lean(),
    TransferRequest.find({ status: 'PENDING', risk_level: 'HIGH' }).sort({ created_at: -1 }).limit(6).lean(),
    Document.find().sort({ created_at: -1 }).limit(6).lean(),
  ]);

  // Fraud alerts: failed checks on currently-pending transfers (legacy SQL semantics).
  const fraudAlerts = pendingTransferIds.length
    ? await FraudCheck.countDocuments({ is_fraudulent: true, transfer_id: { $in: pendingTransferIds.map((t) => t._id) } })
    : 0;

  // Recent reviews: latest approval/rejection/verification/blockchain events.
  const recentReviewsRaw = await AuditEvent.find({
    action: { $in: ['PROPERTY_APPROVE', 'PROPERTY_REJECT', 'TRANSFER_APPROVE', 'TRANSFER_REJECT', 'DOCUMENT_VERIFY', 'SURVEY_PASSED', 'SURVEY_REJECTED', 'DOCS_VERIFIED_PASS', 'DOCS_VERIFIED_FAIL', 'TRANSFER_DOCS_VERIFIED', 'TRANSFER_DOCS_REJECTED', 'PROPERTY_OVERRIDE_REJECT', 'TRANSFER_OVERRIDE_REJECT', 'BLOCKCHAIN_TX', 'BLOCKCHAIN_TX_FAILED', 'MFA_CHALLENGE_CREATED', 'MFA_VERIFY_SUCCESS', 'MFA_VERIFY_FAILURE', 'CONSENT_REQUESTED', 'CONSENT_APPROVED', 'CONSENT_REJECTED', 'TRANSFER_CONSENT_COMPLETE', 'TRANSFER_CONSENT_REJECTED', 'TRANSFER_BLOCKED_CONSENT'] },
  }).sort({ created_at: -1 }).limit(8).lean();

  // Decorate everything with the legacy JOIN shapes.
  const propIds = [
    ...new Set([
      ...recentTransactionDocs.map((t) => t.property_id),
      ...highRiskDocs.map((t) => t.property_id),
      ...docActivityDocs.map((d) => d.property_id),
    ].filter(Boolean)),
  ];
  const personIds = [
    ...new Set([
      ...recentReviewsRaw.map((a) => a.actorId),
      ...highRiskDocs.flatMap((t) => [t.seller_id, t.buyer_id]),
    ].filter(Boolean)),
  ];

  const [props, people] = await Promise.all([
    propIds.length ? Property.find({ _id: { $in: propIds } }).select('property_id').lean() : [],
    personIds.length ? User.find({ _id: { $in: personIds } }).select('full_name').lean() : [],
  ]);
  const propById = Object.fromEntries(props.map((p) => [p._id, p]));
  const nameById = Object.fromEntries(people.map((u) => [u._id, u.full_name]));

  const recentTransactions = toRows(recentTransactionDocs).map((t) => ({
    ...t,
    property_id: t.property_id && propById[t.property_id] ? propById[t.property_id].property_id : null,
  }));

  const recentReviews = recentReviewsRaw.map((a) => ({
    id: a.eventId || String(a._id),
    actor_id: a.actorId || null,
    action: a.action,
    entity_type: a.entityType,
    entity_id: a.entityId,
    result: a.result,
    created_at: a.created_at,
    actor_display: (a.actorId && nameById[a.actorId]) || a.actorName || 'system',
  }));

  const highRiskTransfers = toRows(highRiskDocs).map((t) => {
    const seller = t.seller_id ? nameById[t.seller_id] : null;
    const buyer = t.buyer_id ? nameById[t.buyer_id] : null;
    return {
      ...t,
      property_business_id: t.property_id && propById[t.property_id] ? propById[t.property_id].property_id : null,
      seller_name: seller || null,
      buyer_name: buyer || null,
    };
  });

  const documentActivity = toRows(docActivityDocs).map((d) => ({
    id: d.id,
    file_name: d.file_name,
    verification_status: d.verification_status,
    created_at: d.created_at,
    property_business_id: d.property_id && propById[d.property_id] ? propById[d.property_id].property_id : null,
  }));

  const metrics = {
    pending_registrations: pendingRegistrations,
    pending_transfers: pendingTransfers,
    fraud_alerts: fraudAlerts,
    verified_documents: verifiedDocuments,
    rejected_requests: rejectedProperties + rejectedTransfers,
    completed_transfers: await TransferRequest.countDocuments({ status: 'COMPLETED' }),
    confirmed_transactions: confirmedTransactions,
    documents_needing_attention: documentsNeedingAttention,
  };
  return ok(res, {
    message: 'Registrar dashboard loaded',
    data: {
      metrics,
      recentTransactions,
      recentReviews,
      highRiskTransfers,
      documentActivity,
    },
  });
});

/** GET /api/registrar/pending-properties - files that reached the registrar desk. */
const pendingProperties = asyncHandler(async (req, res) => {
  const docs = await Property.find({ status: 'DOCS_VERIFIED' }).sort({ created_at: 1 }).lean();

  const propIds = docs.map((p) => p._id);
  const submitterIds = [...new Set(docs.map((p) => p.submitted_by_id).filter(Boolean))];
  const [docCounts, verifiedCounts, submitters] = await Promise.all([
    Document.aggregate([
      { $match: { property_id: { $in: propIds } } },
      { $group: { _id: '$property_id', n: { $sum: 1 } } },
    ]),
    Document.aggregate([
      { $match: { property_id: { $in: propIds }, verification_status: 'VERIFIED' } },
      { $group: { _id: '$property_id', n: { $sum: 1 } } },
    ]),
    submitterIds.length ? User.find({ _id: { $in: submitterIds } }).select('full_name email').lean() : [],
  ]);
  const docCountById = Object.fromEntries(docCounts.map((d) => [d._id, d.n]));
  const verifiedById = Object.fromEntries(verifiedCounts.map((d) => [d._id, d.n]));
  const submitterById = Object.fromEntries(submitters.map((u) => [u._id, u]));

  const properties = toRows(docs).map((p) => {
    const s = p.submitted_by_id ? submitterById[p.submitted_by_id] : null;
    return {
      ...p,
      submitted_by_name: s ? s.full_name : null,
      submitted_by_email: s ? s.email : null,
      document_count: docCountById[p.id] || 0,
      verified_document_count: verifiedById[p.id] || 0,
    };
  });

  return ok(res, { message: 'Pending registrations loaded', data: { properties } });
});

/** GET /api/registrar/pending-transfers - clerk-verified transfers awaiting legal review. */
const pendingTransfers = asyncHandler(async (req, res) => {
  const docs = await TransferRequest.find({ status: 'DOCS_VERIFIED' }).sort({ created_at: 1 }).lean();

  const propIds = [...new Set(docs.map((t) => t.property_id))];
  const transferIds = docs.map((t) => t._id);
  const personIds = [...new Set(docs.flatMap((t) => [t.seller_id, t.buyer_id]).filter(Boolean))];

  const [props, people, latestFrauds, docCounts, verifiedCounts] = await Promise.all([
    propIds.length ? Property.find({ _id: { $in: propIds } }).select('property_id title').lean() : [],
    personIds.length ? User.find({ _id: { $in: personIds } }).select('full_name').lean() : [],
    FraudCheck.aggregate([
      { $match: { transfer_id: { $in: transferIds } } },
      { $sort: { created_at: -1 } },
      { $group: { _id: '$transfer_id', latest: { $first: '$$ROOT' } } },
    ]),
    Document.aggregate([
      { $match: { property_id: { $in: propIds } } },
      { $group: { _id: '$property_id', n: { $sum: 1 } } },
    ]),
    Document.aggregate([
      { $match: { property_id: { $in: propIds }, verification_status: 'VERIFIED' } },
      { $group: { _id: '$property_id', n: { $sum: 1 } } },
    ]),
  ]);

  const propById = Object.fromEntries(props.map((p) => [p._id, p]));
  const personById = Object.fromEntries(people.map((u) => [u._id, u]));
  const fraudByTransfer = Object.fromEntries(latestFrauds.map((f) => [f._id, f.latest]));
  const docCountById = Object.fromEntries(docCounts.map((d) => [d._id, d.n]));
  const verifiedById = Object.fromEntries(verifiedCounts.map((d) => [d._id, d.n]));

  const RISK_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const transfers = toRows(docs)
    .map((t) => {
      const p = propById[t.property_id] || {};
      const seller = t.seller_id ? personById[t.seller_id] : null;
      const buyer = t.buyer_id ? personById[t.buyer_id] : null;
      const fc = fraudByTransfer[t.id];
      return {
        ...t,
        property_business_id: p.property_id || null,
        property_title: p.title || null,
        seller_name: seller ? seller.full_name : null,
        buyer_name: buyer ? buyer.full_name : null,
        is_fraudulent: fc ? fc.is_fraudulent : null,
        fraud_risk_level: fc ? fc.risk_level : null,
        fraud_reasons: fc ? fc.reasons : null,
        document_count: docCountById[t.property_id] || 0,
        verified_document_count: verifiedById[t.property_id] || 0,
      };
    })
    .sort((a, b) => (RISK_ORDER[a.risk_level] ?? 3) - (RISK_ORDER[b.risk_level] ?? 3) || new Date(a.created_at) - new Date(b.created_at));

  return ok(res, { message: 'Pending transfers loaded', data: { transfers } });
});

/** POST /api/registrar/properties/:id/approve - approve + on-chain registration. */
const approveProperty = asyncHandler(async (req, res) => {
  const propDoc = await Property.findOne({
    $or: [{ _id: req.params.id }, { property_id: req.params.id }],
  }).lean();
  const property = propDoc ? toRow(propDoc) : null;
  if (!property) return fail(res, { message: 'Property not found', errorCode: 'PROPERTY_NOT_FOUND', status: 404 });
  if (property.status !== 'DOCS_VERIFIED') {
    return fail(res, { message: `Only applications cleared by document verification can be approved (current stage: ${property.status})`, errorCode: 'INVALID_STATE', status: 409 });
  }

  // Blockchain registration occurs only after approval.
  const ownerWallet = property.current_owner_wallet;
  if (!ownerWallet || !/^0x[a-fA-F0-9]{40}$/.test(ownerWallet)) {
    return fail(res, {
      message: 'Cannot register on-chain: the owner has no valid wallet address. Ask the owner to add one in Profile.',
      errorCode: 'WALLET_MISSING',
      status: 409,
    });
  }

  let receipt;
  try {
    receipt = await blockchainService.registerPropertyOnChain(property.property_id, ownerWallet);
    // Remember the highest settled business id for this chain session so a
    // future reseed floors its counters above on-chain history.
    const suffixMatch = String(property.property_id).match(/(\d+)$/);
    if (suffixMatch) require('../utils/chainCursor').bumpPropertyCursor(parseInt(suffixMatch[1], 10));
  } catch (err) {
    // The approval did NOT complete end-to-end - audit it as a failure so the
    // trail never claims success for a registration that never happened.
    await auditService.record({
      actor: req.user, action: 'PROPERTY_APPROVE', entityType: 'property', entityId: property.property_id,
      result: 'FAILURE', metadata: { title: property.title, error: blockchainService.humanError(err) },
    });
    await auditService.record({
      actor: req.user, action: 'BLOCKCHAIN_TX_FAILED', entityType: 'property', entityId: property.property_id,
      result: 'FAILURE', metadata: { operation: 'PROPERTY_REGISTER', error: blockchainService.humanError(err) },
    });
    return fail(res, {
      message: `Approved, but ledger registration failed - the record stays pending: ${blockchainService.humanError(err)}`,
      errorCode: 'BLOCKCHAIN_REGISTRATION_FAILED',
      status: 502,
    });
  }

  // Only create an explorer row for a REAL mined registration transaction;
  // an alreadyRegistered self-heal carries no new tx.
  const txCreated = receipt.alreadyRegistered ? null : await BlockchainTransaction.create({
    property_id: property.id,
    transaction_hash: receipt.transactionHash,
    block_number: receipt.blockNumber,
    network: 'hardhat',
    contract_address: blockchainService.getContractAddress(),
    operation: 'PROPERTY_REGISTER',
    from_address: receipt.fromAddress,
    to_address: ownerWallet,
    status: 'CONFIRMED',
    timestamp: new Date(),
  });
  const updatedDoc = await Property.findOneAndUpdate(
    { _id: property.id, status: 'DOCS_VERIFIED' },
    { $set: { status: 'REGISTERED', registered_at: new Date(), review_notes: String(req.body.reason || '').trim() || 'Approved by registrar' }, $push: { stage_history: { stage: 'REGISTRAR_REVIEW', action: 'REGISTRAR_APPROVED', by_id: req.user.id, by_name: req.user.full_name, by_role: req.user.role, notes: String(req.body.reason || '').trim() || null, at: new Date() } } },
    { new: true }
  ).lean();

  if (!updatedDoc) {
    // Chain registration succeeded but the property left DOCS_VERIFIED
    // concurrently (e.g. admin override-reject). The parcel is registered
    // on-chain; the next transfer's self-heal reconciles ownership, so report
    // the state mismatch honestly instead of returning property:null.
    return fail(res, {
      message: 'The property left legal review while registration was in progress. The ledger entry exists - refresh and re-check the record.',
      errorCode: 'INVALID_STATE',
      status: 409,
    });
  }

  // Success-only audit points (never claim success before the outcome).
  await auditService.record({
    actor: req.user, action: 'PROPERTY_APPROVE', entityType: 'property', entityId: property.property_id,
    metadata: { title: property.title, txHash: receipt.transactionHash, alreadyRegistered: Boolean(receipt.alreadyRegistered) },
  });
  if (receipt.transactionHash) {
    await auditService.record({
      actor: req.user, action: 'BLOCKCHAIN_TX', entityType: 'blockchain', entityId: receipt.transactionHash,
      metadata: { operation: 'PROPERTY_REGISTER', propertyId: property.property_id, block: receipt.blockNumber },
    });
  }
  await auditService.record({
    actor: req.user, action: 'PROPERTY_REGISTERED', entityType: 'property', entityId: property.property_id,
    metadata: { txHash: receipt.transactionHash },
  });

  return ok(res, {
    message: 'Property approved and registered on the ledger',
    data: { property: toRow(updatedDoc), blockchainTransaction: txCreated ? toRow(txCreated.toObject()) : null },
  });
});

/** POST /api/registrar/properties/:id/reject - reject with mandatory reason. */
const rejectProperty = asyncHandler(async (req, res) => {
  const propDoc = await Property.findOne({
    $or: [{ _id: req.params.id }, { property_id: req.params.id }],
  }).lean();
  const property = propDoc ? toRow(propDoc) : null;
  if (!property) return fail(res, { message: 'Property not found', errorCode: 'PROPERTY_NOT_FOUND', status: 404 });
  if (property.status !== 'DOCS_VERIFIED') {
    return fail(res, { message: `Only applications cleared by document verification can be rejected here (current stage: ${property.status}). Earlier stages are rejected by the surveyor or clerk.`, errorCode: 'INVALID_STATE', status: 409 });
  }
  const reason = String(req.body.reason || '').trim();
  if (!reason) return fail(res, { message: 'A rejection reason is required', errorCode: 'REASON_REQUIRED', status: 422 });

  const updatedDoc = await Property.findOneAndUpdate(
    { _id: property.id, status: 'DOCS_VERIFIED' },
    { $set: { status: 'REJECTED', rejection_stage: 'REGISTRAR_REVIEW', review_notes: reason }, $push: { stage_history: { stage: 'REGISTRAR_REVIEW', action: 'REGISTRAR_REJECTED', by_id: req.user.id, by_name: req.user.full_name, by_role: req.user.role, notes: reason, at: new Date() } } },
    { new: true }
  ).lean();
  await auditService.record({
    actor: req.user, action: 'PROPERTY_REJECT', entityType: 'property', entityId: property.property_id,
    result: 'FAILURE', metadata: { reason },
  });
  return ok(res, { message: 'Property registration rejected', data: { property: toRow(updatedDoc) } });
});

/** GET /api/registrar/audit - audit log (also aliased under /api/audit). */
const auditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '25', 10)));
  const data = await auditService.listLogs({
    page,
    pageSize,
    action: req.query.action || null,
    entityType: req.query.entityType || null,
    actorId: req.query.actorId || null,
  });
  return ok(res, { message: 'Audit logs loaded', data });
});

/** Shape an audit row/doc the same way for Atlas and any fallback. */
function shapeAuditEvent(e) {
  return {
    id: e.eventId || String(e.id || ''),
    pgId: e.pgId ?? null,
    action: e.action,
    actor: e.actorName || e.actor_name || 'system',
    role: e.actorRole || e.actor_role || 'system',
    entityType: e.entityType || e.entity_type || null,
    entityId: e.entityId ? String(e.entityId) : (e.entity_id ? String(e.entity_id) : null),
    result: e.result || 'SUCCESS',
    metadata: typeof e.metadata === 'string' ? safeParse(e.metadata) : (e.metadata || null),
    createdAt: e.created_at ? new Date(e.created_at).toISOString() : null,
  };
}

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

/**
 * GET /api/registrar/activity - live activity stream (MongoDB Atlas audit_events).
 */
const activity = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '12', 10)));
  const docs = await AuditEvent.find().sort({ created_at: -1 }).limit(limit).lean();
  const total = await AuditEvent.countDocuments();
  return ok(res, {
    message: 'Live activity stream (MongoDB Atlas)',
    data: { source: 'mongodb-atlas', total, events: docs.map(shapeAuditEvent) },
  });
});

/**
 * GET /api/registrar/login-events - authentication security telemetry from
 * MongoDB Atlas (login_events collection).
 */
const loginEvents = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '10', 10)));

  if (!mongo.isConnected()) {
    return ok(res, {
      message: 'MongoDB unavailable',
      data: { source: 'unavailable', available: false, total: null, events: [] },
    });
  }

  const docs = await LoginEvent.find().sort({ created_at: -1 }).limit(limit).lean();
  const total = await LoginEvent.countDocuments();
  const failed = await LoginEvent.countDocuments({ outcome: 'FAILURE' });
  return ok(res, {
    message: 'Login security events (MongoDB Atlas)',
    data: {
      source: 'mongodb-atlas',
      available: true,
      total,
      failedTotal: failed,
      events: docs.map((e) => ({
        id: String(e._id),
        email: e.email,
        role: e.role || null,
        outcome: e.outcome,
        reason: e.reason || null,
        ip: e.ip || null,
        userAgent: e.userAgent || null,
        createdAt: e.created_at ? new Date(e.created_at).toISOString() : null,
      })),
    },
  });
});

module.exports = { dashboard, pendingProperties, pendingTransfers, approveProperty, rejectProperty, auditLogs, activity, loginEvents };
