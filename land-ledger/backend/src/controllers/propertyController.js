'use strict';

const Property = require('../models/Property');
const Document = require('../models/Document');
const TransferRequest = require('../models/TransferRequest');
const User = require('../models/User');
const BlockchainTransaction = require('../models/BlockchainTransaction');
const Counter = require('../models/Counter');
const { toRow, toRows, sanitizeDocument, caseInsensitive } = require('../db/rows');
const { ok, fail } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');
const { validateProperty } = require('../validators');
const auditService = require('../services/auditService');
const blockchainService = require('../services/blockchainService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Decorate a property row with owner name/email/phone + document/transfer counts (legacy SELECT shape). */
async function decorateProperties(rows) {
  if (!rows.length) return rows;
  const ownerIds = [...new Set(rows.map((p) => p.current_owner_id).filter(Boolean))];
  const propertyIds = rows.map((p) => p.id);

  const owners = ownerIds.length ? await User.find({ _id: { $in: ownerIds } }).select('full_name email phone').lean() : [];
  const ownerById = Object.fromEntries(owners.map((u) => [u._id, u]));

  const docCounts = await Document.aggregate([
    { $match: { property_id: { $in: propertyIds } } },
    { $group: { _id: '$property_id', n: { $sum: 1 } } },
  ]);
  const docCountById = Object.fromEntries(docCounts.map((d) => [d._id, d.n]));

  const activeTransfers = await TransferRequest.aggregate([
    { $match: { property_id: { $in: propertyIds }, status: { $in: ['PENDING', 'CONSENT_PENDING', 'APPROVED'] } } },
    { $group: { _id: '$property_id', n: { $sum: 1 } } },
  ]);
  const activeTransferById = Object.fromEntries(activeTransfers.map((t) => [t._id, t.n]));

  return rows.map((p) => {
    const owner = p.current_owner_id ? ownerById[p.current_owner_id] : null;
    return {
      ...p,
      current_owner_name: owner ? owner.full_name : null,
      current_owner_email: owner ? owner.email : null,
      current_owner_phone: owner ? owner.phone : null,
      document_count: docCountById[p.id] || 0,
      active_transfer_count: activeTransferById[p.id] || 0,
    };
  });
}

async function getPropertyByBusinessIdOrUuid(idOrRef) {
  const filter = UUID_RE.test(idOrRef) ? { _id: idOrRef } : { property_id: idOrRef };
  const doc = await Property.findOne(filter).lean();
  if (!doc) return null;
  const [decorated] = await decorateProperties([toRow(doc)]);
  return decorated;
}

/** POST /api/properties - citizen submits a property registration request. */
const createProperty = asyncHandler(async (req, res) => {
  const { valid, errors, value } = validateProperty(req.body);
  if (!valid) {
    return fail(res, { message: 'Please correct the highlighted fields', errorCode: 'VALIDATION_ERROR', status: 422, details: errors });
  }

  const year = new Date().getFullYear();
  const seq = await Counter.nextSeq(`property_${year}`);
  const propertyId = `PROP-${year}-${String(seq).padStart(4, '0')}`;
  const referenceNumber = `LL/REG/${year}/${String(100000 + seq).slice(1)}`;

  const ownerWallet = value.ownerWallet || req.user.wallet_address || null;

  const created = await Property.create({
    property_id: propertyId,
    reference_number: referenceNumber,
    title: value.title,
    address_line: value.addressLine,
    city: value.city,
    district: value.district,
    state: value.state,
    area_value: value.areaValue,
    area_unit: value.areaUnit,
    property_type: value.propertyType,
    description: value.description || null,
    submitted_by_id: req.user.id,
    current_owner_id: req.user.id,
    current_owner_wallet: ownerWallet,
    status: 'SUBMITTED',
  });
  const result = toRow(created.toObject());

  await auditService.record({
    actor: req.user,
    action: 'PROPERTY_CREATE',
    entityType: 'property',
    entityId: propertyId,
    metadata: { title: value.title, district: value.district, status: 'SUBMITTED' },
  });

  return ok(res, { message: 'Application submitted - field survey scheduled next', status: 201, data: { property: result } });
});

/**
 * GET /api/properties - registry list.
 * Citizens see their own holdings + any REGISTERED property (public registry visibility for search).
 * Registrars see everything.
 */
const listProperties = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || '10', 10)));
  const filter = {};

  if (req.user.role === 'citizen') {
    const uid = req.user.id;
    filter.$and = [
      { $or: [{ current_owner_id: uid }, { status: 'REGISTERED', submitted_by_id: uid }] },
      { $or: [{ status: { $ne: 'REJECTED' } }, { current_owner_id: uid }, { submitted_by_id: uid }] },
    ];
  }

  const keyword = req.query.keyword ? String(req.query.keyword).trim() : '';
  if (keyword) {
    const kw = caseInsensitive(keyword);
    // Keyword may match the owner name too - resolve candidate owners first.
    const owners = await User.find({ full_name: kw }).select('_id').lean();
    const ownerKeywordIds = owners.map((u) => u._id);
    const kwMatch = {
      $or: [
        { property_id: kw },
        { reference_number: kw },
        { title: kw },
        { city: kw },
        { district: kw },
        { address_line: kw },
        ...(ownerKeywordIds.length ? [{ current_owner_id: { $in: ownerKeywordIds } }] : []),
      ],
    };
    filter.$and = [...(filter.$and || []), kwMatch];
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.propertyType) filter.property_type = req.query.propertyType;
  if (req.query.district) filter.district = caseInsensitive(req.query.district);

  const total = await Property.countDocuments(filter);
  const docs = await Property.find(filter)
    .sort({ updated_at: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  const properties = await decorateProperties(toRows(docs));

  return ok(res, {
    message: 'Properties loaded',
    data: { properties, total, page, pageSize },
  });
});

/** GET /api/properties/search - alias kept for spec compliance. */
const searchProperties = asyncHandler(async (req, res) => {
  req.query.page = req.query.page || '1';
  return listProperties(req, res);
});

/** GET /api/properties/:id - full property record with related data. */
const getProperty = asyncHandler(async (req, res) => {
  const property = await getPropertyByBusinessIdOrUuid(req.params.id);
  if (!property) return fail(res, { message: 'Property not found', errorCode: 'PROPERTY_NOT_FOUND', status: 404 });

  const isOwner = property.current_owner_id === req.user.id;
  const isSubmitter = property.submitted_by_id === req.user.id;
  const isRegistrar = req.user.role === 'registrar';
  // Surveyor/clerk act on the file in their queues; admin has oversight mandate.
  const isStaff = ['surveyor', 'clerk', 'admin'].includes(req.user.role);
  const publiclyVisible = property.status === 'REGISTERED';

  if (!isRegistrar && !isStaff && !isOwner && !isSubmitter && !publiclyVisible) {
    return fail(res, { message: 'You do not have access to this property record', errorCode: 'FORBIDDEN', status: 403 });
  }

  const [documentDocs, transferDocs, txDocs] = await Promise.all([
    Document.find({ property_id: property.id }).sort({ created_at: -1 }).lean(),
    TransferRequest.find({ property_id: property.id }).sort({ created_at: -1 }).lean(),
    BlockchainTransaction.find({ property_id: property.id }).sort({ timestamp: -1 }).lean(),
  ]);

  // Resolve display names for documents + transfers in one pass.
  const personIds = [
    ...new Set([
      ...documentDocs.map((d) => d.uploaded_by),
      ...documentDocs.map((d) => d.verified_by),
      ...transferDocs.map((t) => t.seller_id),
      ...transferDocs.map((t) => t.buyer_id),
    ].filter(Boolean)),
  ];
  const people = personIds.length ? await User.find({ _id: { $in: personIds } }).select('full_name email').lean() : [];
  const nameById = Object.fromEntries(people.map((u) => [u._id, u.full_name]));

  const documents = toRows(documentDocs).map((d) => ({
    ...sanitizeDocument(d),
    uploaded_by_name: d.uploaded_by ? nameById[d.uploaded_by] || null : null,
    verified_by_name: d.verified_by ? nameById[d.verified_by] || null : null,
  }));
  const transfers = toRows(transferDocs).map((t) => ({
    ...t,
    seller_name: t.seller_id ? nameById[t.seller_id] || null : null,
    buyer_name: t.buyer_id ? nameById[t.buyer_id] || null : null,
  }));
  const transactions = toRows(txDocs);

  const chain = await blockchainService.verifyOwnershipOnChain(
    property.property_id,
    property.current_owner_wallet || '0x0000000000000000000000000000000000000000'
  );

  return ok(res, {
    message: 'Property loaded',
    data: {
      property,
      documents,
      transfers,
      transactions,
      onChain: chain.available
        ? { available: true, verified: chain.verified, network: 'hardhat' }
        : { available: false, verified: false },
      viewer: { isOwner, isRegistrar },
    },
  });
});

/** PUT /api/properties/:id - submitter/registrar can edit before approval. */
const updateProperty = asyncHandler(async (req, res) => {
  const property = await getPropertyByBusinessIdOrUuid(req.params.id);
  if (!property) return fail(res, { message: 'Property not found', errorCode: 'PROPERTY_NOT_FOUND', status: 404 });

  const isSubmitter = property.submitted_by_id === req.user.id || property.current_owner_id === req.user.id;
  const isRegistrar = req.user.role === 'registrar';
  if (!isRegistrar && !isSubmitter) {
    return fail(res, { message: 'You do not have permission to modify this record', errorCode: 'FORBIDDEN', status: 403 });
  }
  if (!isRegistrar && !['SUBMITTED', 'SURVEY_VERIFIED'].includes(property.status)) {
    return fail(res, { message: 'Only applications not yet under registrar review can be edited', errorCode: 'LOCKED_STATE', status: 409 });
  }

  const { valid, errors, value } = validateProperty({ ...req.body, ownerWallet: req.body.ownerWallet || property.current_owner_wallet });
  if (!valid) {
    return fail(res, { message: 'Please correct the highlighted fields', errorCode: 'VALIDATION_ERROR', status: 422, details: errors });
  }

  const updatedDoc = await Property.findByIdAndUpdate(
    property.id,
    { $set: {
      title: value.title,
      address_line: value.addressLine,
      city: value.city,
      district: value.district,
      state: value.state,
      area_value: value.areaValue,
      area_unit: value.areaUnit,
      property_type: value.propertyType,
      description: value.description || null,
    } },
    { new: true }
  ).lean();

  await auditService.record({
    actor: req.user,
    action: 'PROPERTY_UPDATE',
    entityType: 'property',
    entityId: property.property_id,
    metadata: { fields: ['title', 'address', 'area', 'type'] },
  });

  return ok(res, { message: 'Property updated', data: { property: toRow(updatedDoc) } });
});

module.exports = { createProperty, listProperties, searchProperties, getProperty, updateProperty, getPropertyByBusinessIdOrUuid };
