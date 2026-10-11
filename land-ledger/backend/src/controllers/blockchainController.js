'use strict';

const Property = require('../models/Property');
const TransferRequest = require('../models/TransferRequest');
const User = require('../models/User');
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

  // Same access matrix as GET /api/properties/:id (keep the two views aligned).
  const isOwner = property.current_owner_id === req.user.id;
  const isSubmitter = property.submitted_by_id === req.user.id;
  const isRegistrar = req.user.role === 'registrar';
  const isStaff = ['surveyor', 'clerk', 'admin'].includes(req.user.role);
  const publiclyVisible = property.status === 'REGISTERED';
  if (!isOwner && !isSubmitter && !isRegistrar && !isStaff && !publiclyVisible) {
    return fail(res, { message: 'You do not have access to this property history', errorCode: 'FORBIDDEN', status: 403 });
  }

  const txDocs = await BlockchainTransaction.find({ property_id: property.id, status: 'CONFIRMED' })
    .sort({ timestamp: 1 })
    .lean();
  const transactions = toRows(txDocs);

  // Source of truth #2: the contract's OWN event log. This recovers history
  // for parcels whose registration predates the explorer index (repeat seeds
  // on a persistent chain node), so the chain of title is always complete.
  let chainEvents = [];
  try {
    chainEvents = await blockchainService.getParcelEvents(property.property_id);
  } catch (chainErr) {
    // Chain unavailable -> fall back to the DB index only (never fail the view).
    chainEvents = [];
  }
  const knownHashes = new Set(transactions.map((tx) => tx.transaction_hash).filter(Boolean));
  const merged = [
    ...transactions,
    ...chainEvents
      .filter((ev) => ev.transactionHash && !knownHashes.has(ev.transactionHash))
      .map((ev) => ({
        id: ev.transactionHash,
        transfer_id: null,
        transaction_hash: ev.transactionHash,
        block_number: ev.blockNumber,
        network: 'hardhat',
        operation: ev.operation,
        from_address: ev.from_address,
        to_address: ev.to_address,
        status: 'CONFIRMED',
        timestamp: ev.timestamp,
      })),
  ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Resolve every wallet address on the chain of title to a registry account
  // (name/email) so the UI can show WHO owned the land, not just 0x... strings.
  // NOTE: the DB stores checksummed addresses - query with the original case;
  // the identity MAP is keyed case-insensitively because chain events may
  // return either casing.
  const walletQuery = new Set();
  const transferIds = new Set();
  for (const tx of merged) {
    if (tx.from_address) walletQuery.add(tx.from_address);
    if (tx.to_address) walletQuery.add(tx.to_address);
    if (tx.transfer_id) transferIds.add(tx.transfer_id);
  }
  if (property.current_owner_wallet) walletQuery.add(property.current_owner_wallet);

  // The registry is small (demo allowlist of 8) - load every wallet-holding
  // account and resolve identities in JS. This sidesteps the classic
  // checksummed-vs-lowercase address mismatch entirely.
  const [userDocs, transferDocs] = await Promise.all([
    User.find({ wallet_address: { $nin: [null, ''] } }).select('full_name email wallet_address').lean(),
    transferIds.size ? TransferRequest.find({ _id: { $in: [...transferIds] } }).select('transfer_reference seller_id buyer_id status').lean() : [],
  ]);

  const identityByWallet = {};
  for (const u of userDocs) {
    if (u.wallet_address) {
      identityByWallet[String(u.wallet_address).toLowerCase()] = { name: u.full_name, email: u.email };
    }
  }
  const identityOf = (wallet) => {
    if (!wallet) return null;
    const key = String(wallet).toLowerCase();
    return { wallet, name: (identityByWallet[key] && identityByWallet[key].name) || null, email: (identityByWallet[key] && identityByWallet[key].email) || null };
  };
  const transferRefById = Object.fromEntries(transferDocs.map((t) => [t._id, t.transfer_reference]));

  // Derive chronological ownership entries from confirmed on-chain events only.
  const history = [];
  for (const tx of merged) {
    if (tx.operation === 'PROPERTY_REGISTER') {
      history.push({
        type: 'REGISTRATION',
        owner: identityOf(tx.to_address),
        transactionHash: tx.transaction_hash,
        blockNumber: tx.block_number,
        timestamp: tx.timestamp,
        network: tx.network,
        settlementStatus: 'SETTLED',
      });
    } else if (tx.operation === 'OWNERSHIP_TRANSFER') {
      history.push({
        type: 'TRANSFER',
        previousOwner: identityOf(tx.from_address),
        newOwner: identityOf(tx.to_address),
        transfer: tx.transfer_id
          ? { id: tx.transfer_id, reference: transferRefById[tx.transfer_id] || null }
          : null,
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
      currentOwner: {
        wallet: property.current_owner_wallet,
        ...(() => {
          const ident = identityOf(property.current_owner_wallet);
          return { name: ident ? ident.name : null, email: ident ? ident.email : null };
        })(),
      },
      history,
    },
  });
});

module.exports = { status, listTransactions, getTransaction, ownershipHistory };
