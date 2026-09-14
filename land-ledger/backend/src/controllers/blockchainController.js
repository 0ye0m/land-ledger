'use strict';

const Property = require('../models/Property');
const TransferRequest = require('../models/TransferRequest');
const BlockchainTransaction = require('../models/BlockchainTransaction');
const { toRow, toRows } = require('../db/rows');
const { ok, fail } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');
const blockchainService = require('../services/blockchainService');

/** Decorate transaction docs with property/transfer business fields (legacy JOIN shape). */
async function decorateTransactions(txRows) {
  if (!txRows.length) return txRows;
  const propIds = [...new Set(txRows.map((t) => t.property_id).filter(Boolean))];
  const transferIds = [...new Set(txRows.map((t) => t.transfer_id).filter(Boolean))];
  const [props, transfers] = await Promise.all([
    propIds.length ? Property.find({ _id: { $in: propIds } }).select('property_id title').lean() : [],
    transferIds.length ? TransferRequest.find({ _id: { $in: transferIds } }).select('transfer_reference').lean() : [],
  ]);
  const propById = Object.fromEntries(props.map((p) => [p._id, p]));
  const transferById = Object.fromEntries(transfers.map((t) => [t._id, t]));
  return txRows.map((t) => ({
    ...t,
    property_id: t.property_id && propById[t.property_id] ? propById[t.property_id].property_id : null,
    property_title: t.property_id && propById[t.property_id] ? propById[t.property_id].title : null,
    transfer_reference: t.transfer_id && transferById[t.transfer_id] ? transferById[t.transfer_id].transfer_reference : null,
  }));
}

/** GET /api/blockchain/status - network + contract health. */
const status = asyncHandler(async (req, res) => {
  const info = await blockchainService.getStatus();
  return ok(res, { message: info.available ? 'Ledger reachable' : 'Blockchain unavailable', data: info });
});

/** GET /api/blockchain/transactions - confirmed registry activity. */
const listTransactions = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || '10', 10)));
  const filter = {};

  if (req.user.role === 'citizen') {
    const uid = req.user.id;
    const visibleProps = await Property.find({
      $or: [{ current_owner_id: uid }, { submitted_by_id: uid }],
    }).select('_id').lean();
    const visibleTransfers = await TransferRequest.find({
      $or: [{ seller_id: uid }, { buyer_id: uid }],
    }).select('_id').lean();
    filter.$or = [
      { property_id: { $in: visibleProps.map((p) => p._id) } },
      { transfer_id: { $in: visibleTransfers.map((t) => t._id) } },
    ];
  }
  if (req.query.operation) filter.operation = req.query.operation;
  if (req.query.status) filter.status = req.query.status;

  const total = await BlockchainTransaction.countDocuments(filter);
  const docs = await BlockchainTransaction.find(filter)
    .sort({ timestamp: -1, created_at: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();
  const transactions = await decorateTransactions(toRows(docs));

  return ok(res, {
    message: transactions.length ? 'Transactions loaded' : 'No blockchain transactions yet',
    data: {
      transactions,
      total,
      page,
      pageSize,
      network: await blockchainService.getStatus(),
    },
  });
});

/** GET /api/blockchain/transactions/:id */
const getTransaction = asyncHandler(async (req, res) => {
  const doc = await BlockchainTransaction.findOne({
    $or: [{ _id: req.params.id }, { transaction_hash: req.params.id }],
  }).lean();
  if (!doc) return fail(res, { message: 'Transaction not found', errorCode: 'TRANSACTION_NOT_FOUND', status: 404 });
  const [tx] = await decorateTransactions([toRow(doc)]);

  if (req.user.role === 'citizen') {
    let allowed = false;
    if (tx.property_id) {
      const prop = await Property.findById(doc.property_id).lean();
      allowed = prop && (prop.current_owner_id === req.user.id || prop.submitted_by_id === req.user.id);
    }
    if (!allowed && doc.transfer_id) {
      const transfer = await TransferRequest.findById(doc.transfer_id).lean();
      allowed = transfer && (transfer.seller_id === req.user.id || transfer.buyer_id === req.user.id);
    }
    if (!allowed) {
      return fail(res, { message: 'You do not have access to this transaction', errorCode: 'FORBIDDEN', status: 403 });
    }
  }

  return ok(res, { message: 'Transaction loaded', data: { transaction: tx } });
});

/** GET /api/properties/:id/ownership-history - blockchain ownership history. */
const ownershipHistory = asyncHandler(async (req, res) => {
  const propDoc = await Property.findOne({
    $or: [{ property_id: req.params.id }, { _id: req.params.id }],
  }).lean();
  const property = propDoc ? toRow(propDoc) : null;
  if (!property) return fail(res, { message: 'Property not found', errorCode: 'PROPERTY_NOT_FOUND', status: 404 });

  const involved = property.current_owner_id === req.user.id || property.submitted_by_id === req.user.id;
  if (!involved && req.user.role !== 'registrar' && property.status !== 'REGISTERED') {
    return fail(res, { message: 'You do not have access to this property history', errorCode: 'FORBIDDEN', status: 403 });
  }

  const txDocs = await BlockchainTransaction.find({ property_id: property.id, status: 'CONFIRMED' })
    .sort({ timestamp: 1 })
    .lean();
  const transactions = toRows(txDocs);

  // Derive chronological ownership entries from confirmed on-chain events only.
  const history = [];
  for (const tx of transactions) {
    if (tx.operation === 'PROPERTY_REGISTER') {
      history.push({
        type: 'REGISTRATION',
        owner: tx.to_address,
        transactionHash: tx.transaction_hash,
        blockNumber: tx.block_number,
        timestamp: tx.timestamp,
        network: tx.network,
        settlementStatus: 'SETTLED',
      });
    } else if (tx.operation === 'OWNERSHIP_TRANSFER') {
      history.push({
        type: 'TRANSFER',
        previousOwner: tx.from_address,
        newOwner: tx.to_address,
        transactionHash: tx.transaction_hash,
        blockNumber: tx.block_number,
        timestamp: tx.timestamp,
        network: tx.network,
        settlementStatus: 'SETTLED',
      });
    }
  }

  return ok(res, {
    message: history.length ? 'Ownership history loaded' : 'No on-chain ownership history yet',
    data: {
      propertyId: property.property_id,
      currentOwnerWallet: property.current_owner_wallet,
      history,
    },
  });
});

module.exports = { status, listTransactions, getTransaction, ownershipHistory };
