'use strict';

const Property = require('../models/Property');
const Document = require('../models/Document');
const TransferRequest = require('../models/TransferRequest');
const User = require('../models/User');
const BlockchainTransaction = require('../models/BlockchainTransaction');
const { toRows } = require('../db/rows');
const { ok } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');

/** GET /api/citizen/dashboard - citizen overview metrics + recent activity. */
const dashboard = asyncHandler(async (req, res) => {
  const uid = req.user.id;

  const ownedProps = await Property.find({
    $or: [{ current_owner_id: uid }, { submitted_by_id: uid }],
  }).select('_id').lean();
  const ownedIds = ownedProps.map((p) => p._id);

  const myTransfers = await TransferRequest.find({ $or: [{ seller_id: uid }, { buyer_id: uid }] }).select('_id').lean();
  const myTransferIds = myTransfers.map((t) => t._id);

  const [
    ownedRegistered,
    pendingTransfers,
    completedTransfers,
    documentsAwaiting,
    recentPropertyDocs,
    recentTransferDocs,
    documentDocs,
    chainActivityDocs,
  ] = await Promise.all([
    Property.countDocuments({ current_owner_id: uid, status: 'REGISTERED' }),
    TransferRequest.countDocuments({ $or: [{ seller_id: uid }, { buyer_id: uid }], status: { $in: ['PENDING', 'CONSENT_PENDING', 'APPROVED'] } }),
    TransferRequest.countDocuments({ $or: [{ seller_id: uid }, { buyer_id: uid }], status: 'COMPLETED' }),
    ownedIds.length ? Document.countDocuments({ property_id: { $in: ownedIds }, verification_status: 'PENDING' }) : 0,
    Property.find({ $or: [{ current_owner_id: uid }, { submitted_by_id: uid }] }).sort({ updated_at: -1 }).limit(5).lean(),
    TransferRequest.find({ $or: [{ seller_id: uid }, { buyer_id: uid }] }).sort({ created_at: -1 }).limit(5).lean(),
    ownedIds.length ? Document.find({ property_id: { $in: ownedIds } }).sort({ created_at: -1 }).limit(6).lean() : [],
    BlockchainTransaction.find({
      $or: [
        ...(ownedIds.length ? [{ property_id: { $in: ownedIds } }] : []),
        ...(myTransferIds.length ? [{ transfer_id: { $in: myTransferIds } }] : []),
      ],
    }).sort({ timestamp: -1 }).limit(6).lean(),
  ]);

  const metrics = {
    owned_properties: ownedRegistered,
    pending_transfers: pendingTransfers,
    completed_transfers: completedTransfers,
    documents_awaiting: documentsAwaiting,
  };

  // ---- Decorations (legacy JOIN shapes) ----
  const recentPropertyIds = recentPropertyDocs.map((p) => p._id);
  const docCounts = recentPropertyIds.length
    ? await Document.aggregate([{ $match: { property_id: { $in: recentPropertyIds } } }, { $group: { _id: '$property_id', n: { $sum: 1 } } }])
    : [];
  const docCountById = Object.fromEntries(docCounts.map((d) => [d._id, d.n]));
  const recentProperties = toRows(recentPropertyDocs).map((p) => ({ ...p, document_count: docCountById[p.id] || 0 }));

  const relatedPropIds = [...new Set([...recentTransferDocs.map((t) => t.property_id), ...documentDocs.map((d) => d.property_id)].filter(Boolean))];
  const personIds = [...new Set(recentTransferDocs.flatMap((t) => [t.seller_id, t.buyer_id]).filter(Boolean))];
  const [props, people] = await Promise.all([
    relatedPropIds.length ? Property.find({ _id: { $in: relatedPropIds } }).select('property_id title').lean() : [],
    personIds.length ? User.find({ _id: { $in: personIds } }).select('full_name').lean() : [],
  ]);
  const propById = Object.fromEntries(props.map((p) => [p._id, p]));
  const nameById = Object.fromEntries(people.map((u) => [u._id, u.full_name]));

  const recentTransfers = toRows(recentTransferDocs).map((t) => {
    const p = propById[t.property_id] || {};
    return {
      ...t,
      property_business_id: p.property_id || null,
      property_title: p.title || null,
      seller_name: t.seller_id ? nameById[t.seller_id] || null : null,
      buyer_name: t.buyer_id ? nameById[t.buyer_id] || null : null,
    };
  });

  const documents = toRows(documentDocs).map((d) => {
    const p = propById[d.property_id] || {};
    return {
      id: d.id,
      file_name: d.file_name,
      document_type: d.document_type,
      verification_status: d.verification_status,
      created_at: d.created_at,
      property_business_id: p.property_id || null,
    };
  });

  const chainPropIds = [...new Set(chainActivityDocs.map((t) => t.property_id).filter(Boolean))];
  const chainProps = chainPropIds.length ? await Property.find({ _id: { $in: chainPropIds } }).select('property_id').lean() : [];
  const chainPropById = Object.fromEntries(chainProps.map((p) => [p._id, p.property_id]));
  const chainActivity = toRows(chainActivityDocs).map((t) => ({
    id: t.id,
    operation: t.operation,
    status: t.status,
    transaction_hash: t.transaction_hash,
    block_number: t.block_number,
    timestamp: t.timestamp,
    error_message: t.error_message || null,
    property_id: t.property_id ? chainPropById[t.property_id] || null : null,
  }));

  return ok(res, {
    message: 'Dashboard loaded',
    data: {
      metrics,
      recentProperties,
      recentTransfers,
      documents,
      chainActivity,
    },
  });
});

module.exports = { dashboard };
