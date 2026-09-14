'use strict';

const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const Property = require('../models/Property');
const User = require('../models/User');
const { toRow, toRows, caseInsensitive } = require('../db/rows');
const { ok, fail } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');
const { sha256File } = require('../utils/hash');
const { uploadRoot } = require('../middleware/upload');
const auditService = require('../services/auditService');

const DOC_TYPES = ['TITLE_DEED', 'SALE_AGREEMENT', 'SURVEY_REPORT', 'TAX_RECEIPT', 'IDENTITY_PROOF', 'OTHER'];

async function findPropertyByIdOrBusinessId(idOrRef) {
  const doc = await Property.findOne({
    $or: [{ property_id: idOrRef }, { _id: idOrRef }],
  }).lean();
  return doc ? toRow(doc) : null;
}

/** POST /api/documents/upload (multipart: file, propertyId, documentType) */
const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    return fail(res, { message: 'Attach a file to upload', errorCode: 'FILE_REQUIRED', status: 422 });
  }
  const propertyId = String(req.body.propertyId || '').trim();
  const documentType = DOC_TYPES.includes(req.body.documentType) ? req.body.documentType : 'OTHER';

  if (!propertyId) {
    fs.unlink(req.file.path, () => {});
    return fail(res, { message: 'propertyId is required', errorCode: 'VALIDATION_ERROR', status: 422 });
  }

  const property = await findPropertyByIdOrBusinessId(propertyId);
  if (!property) {
    fs.unlink(req.file.path, () => {});
    return fail(res, { message: 'Property not found', errorCode: 'PROPERTY_NOT_FOUND', status: 404 });
  }

  const isOwner = property.current_owner_id === req.user.id;
  const isSubmitter = property.submitted_by_id === req.user.id;
  if (!isOwner && !isSubmitter && req.user.role !== 'registrar') {
    fs.unlink(req.file.path, () => {});
    return fail(res, { message: 'You can only attach documents to your own property records', errorCode: 'FORBIDDEN', status: 403 });
  }

  const computedHash = await sha256File(req.file.path);
  const storagePath = path.relative(uploadRoot, req.file.path);

  const created = await Document.create({
    property_id: property.id,
    uploaded_by: req.user.id,
    document_type: documentType,
    file_name: req.file.originalname,
    file_size: req.file.size,
    mime_type: req.file.mimetype,
    storage_path: storagePath,
    sha256_hash: computedHash,
    verification_status: 'PENDING',
  });
  const inserted = toRow(created.toObject());

  await auditService.record({
    actor: req.user,
    action: 'DOCUMENT_UPLOAD',
    entityType: 'document',
    entityId: inserted.id,
    metadata: { propertyId: property.property_id, fileName: req.file.originalname, sha256: computedHash, size: req.file.size },
  });

  return ok(res, {
    message: 'Document uploaded and SHA-256 fingerprint recorded',
    status: 201,
    data: { document: inserted },
  });
});

/** GET /api/documents - registry list scoped by role. */
const listDocuments = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize || '10', 10)));
  const filter = {};

  if (req.user.role === 'citizen') {
    const visibleProps = await Property.find({
      $or: [{ current_owner_id: req.user.id }, { submitted_by_id: req.user.id }],
    }).select('_id').lean();
    filter.property_id = { $in: visibleProps.map((p) => p._id) };
  }
  if (req.query.propertyId) {
    const target = await findPropertyByIdOrBusinessId(req.query.propertyId);
    filter.property_id = target ? target.id : '__none__';
  }
  if (req.query.status) filter.verification_status = req.query.status;
  if (req.query.documentType) filter.document_type = req.query.documentType;
  const keyword = req.query.keyword ? String(req.query.keyword).trim() : '';
  if (keyword) {
    const kw = caseInsensitive(keyword);
    const kwProps = await Property.find({ $or: [{ property_id: kw }, { title: kw }] }).select('_id').lean();
    const kwPropIds = kwProps.map((p) => p._id);
    filter.$or = [
      { file_name: kw },
      ...(kwPropIds.length ? [{ property_id: { $in: kwPropIds } }] : []),
    ];
  }

  const total = await Document.countDocuments(filter);
  const docs = await Document.find(filter)
    .sort({ created_at: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  // Decorate with property + uploader/verifier display fields (legacy JOIN shape).
  const propIds = [...new Set(docs.map((d) => d.property_id))];
  const personIds = [...new Set(docs.flatMap((d) => [d.uploaded_by, d.verified_by]).filter(Boolean))];
  const [props, people] = await Promise.all([
    propIds.length ? Property.find({ _id: { $in: propIds } }).select('property_id title').lean() : [],
    personIds.length ? User.find({ _id: { $in: personIds } }).select('full_name').lean() : [],
  ]);
  const propById = Object.fromEntries(props.map((p) => [p._id, p]));
  const nameById = Object.fromEntries(people.map((u) => [u._id, u.full_name]));

  const documents = toRows(docs).map((d) => {
    const p = propById[d.property_id];
    return {
      ...d,
      property_business_id: p ? p.property_id : null,
      property_title: p ? p.title : null,
      uploaded_by_name: d.uploaded_by ? nameById[d.uploaded_by] || null : null,
      verified_by_name: d.verified_by ? nameById[d.verified_by] || null : null,
    };
  });

  return ok(res, { message: 'Documents loaded', data: { documents, total, page, pageSize } });
});

async function getDocumentAccessible(req, res) {
  // _id is a plain String field (uuid) - no cast errors for malformed ids.
  const docDoc = await Document.findById(req.params.id).lean();
  const docRow = docDoc ? toRow(docDoc) : null;
  if (!docRow) {
    fail(res, { message: 'Document not found', errorCode: 'DOCUMENT_NOT_FOUND', status: 404 });
    return null;
  }
  const propDoc = await Property.findById(docRow.property_id).lean();
  const prop = propDoc ? toRow(propDoc) : null;
  if (!prop) {
    fail(res, { message: 'Document not found', errorCode: 'DOCUMENT_NOT_FOUND', status: 404 });
    return null;
  }
  const allowed =
    req.user.role === 'registrar' ||
    docRow.uploaded_by === req.user.id ||
    prop.current_owner_id === req.user.id ||
    prop.submitted_by_id === req.user.id;
  if (!allowed) {
    fail(res, { message: 'You do not have access to this document', errorCode: 'FORBIDDEN', status: 403 });
    return null;
  }
  return {
    ...docRow,
    property_business_id: prop.property_id,
    current_owner_id: prop.current_owner_id,
    submitted_by_id: prop.submitted_by_id,
  };
}

/** GET /api/documents/:id */
const getDocument = asyncHandler(async (req, res) => {
  const doc = await getDocumentAccessible(req, res);
  if (!doc) return;
  const personIds = [doc.uploaded_by, doc.verified_by].filter(Boolean);
  const people = personIds.length ? await User.find({ _id: { $in: personIds } }).select('full_name email').lean() : [];
  const byId = Object.fromEntries(people.map((u) => [u._id, u]));
  const uploader = doc.uploaded_by ? byId[doc.uploaded_by] || null : null;
  const verifier = doc.verified_by ? byId[doc.verified_by] || null : null;
  return ok(res, {
    message: 'Document loaded',
    data: {
      document: doc,
      uploadedBy: uploader ? { full_name: uploader.full_name, email: uploader.email } : null,
      verifiedBy: verifier ? { full_name: verifier.full_name, email: verifier.email } : null,
    },
  });
});

/**
 * POST /api/documents/:id/verify-integrity
 * Recalculate SHA-256 from stored bytes and compare with the stored fingerprint.
 * Available to the owner, uploader and registrars. Auto-flags TAMPERED.
 */
const verifyIntegrity = asyncHandler(async (req, res) => {
  const doc = await getDocumentAccessible(req, res);
  if (!doc) return;

  const absolute = path.join(uploadRoot, doc.storage_path);
  if (!fs.existsSync(absolute)) {
    return fail(res, { message: 'Stored file is missing from document storage', errorCode: 'FILE_MISSING', status: 410 });
  }

  const computedHash = await sha256File(absolute);
  const intact = computedHash === doc.sha256_hash;

  if (!intact && doc.verification_status !== 'TAMPERED') {
    await Document.updateOne({ _id: doc.id }, { $set: { verification_status: 'TAMPERED' } });
    await auditService.record({
      actor: req.user,
      action: 'DOCUMENT_HASH_CHECK',
      entityType: 'document',
      entityId: doc.id,
      result: 'FAILURE',
      metadata: { stored: doc.sha256_hash, computed: computedHash, outcome: 'TAMPERED' },
    });
  } else if (intact) {
    await auditService.record({
      actor: req.user,
      action: 'DOCUMENT_HASH_CHECK',
      entityType: 'document',
      entityId: doc.id,
      metadata: { stored: doc.sha256_hash, computed: computedHash, outcome: 'INTACT' },
    });
  }

  return ok(res, {
    message: intact ? 'Integrity check passed - SHA-256 fingerprints match' : 'Hash mismatch detected - the file has been modified since upload',
    data: {
      intact,
      storedHash: doc.sha256_hash,
      computedHash,
      verificationStatus: intact ? doc.verification_status : 'TAMPERED',
    },
  });
});

/** POST /api/documents/:id/verify - registrar records formal verification. */
const verifyDocument = asyncHandler(async (req, res) => {
  if (req.user.role !== 'registrar') {
    return fail(res, { message: 'Only registrars can verify documents', errorCode: 'FORBIDDEN', status: 403 });
  }
  const doc = await getDocumentAccessible(req, res);
  if (!doc) return;

  const outcome = String(req.body.outcome || '').toUpperCase();
  if (!['VERIFIED', 'REJECTED'].includes(outcome)) {
    return fail(res, { message: 'Outcome must be VERIFIED or REJECTED', errorCode: 'VALIDATION_ERROR', status: 422 });
  }

  // Integrity gate: never formally verify a document that fails hash check.
  const absolute = path.join(uploadRoot, doc.storage_path);
  let intact = true;
  if (fs.existsSync(absolute)) {
    intact = (await sha256File(absolute)) === doc.sha256_hash;
  }
  const finalStatus = !intact ? 'TAMPERED' : outcome === 'VERIFIED' ? 'VERIFIED' : 'REJECTED';

  const updatedDoc = await Document.findByIdAndUpdate(
    doc.id,
    { $set: { verification_status: finalStatus, verified_by: req.user.id, verified_at: new Date() } },
    { new: true }
  ).lean();

  await auditService.record({
    actor: req.user,
    action: 'DOCUMENT_VERIFY',
    entityType: 'document',
    entityId: doc.id,
    result: finalStatus === 'REJECTED' || finalStatus === 'TAMPERED' ? 'FAILURE' : 'SUCCESS',
    metadata: { outcome: finalStatus, propertyId: doc.property_business_id },
  });

  return ok(res, { message: `Document marked ${finalStatus}`, data: { document: toRow(updatedDoc) } });
});

/** GET /api/documents/:id/download - authenticated download. */
const downloadDocument = asyncHandler(async (req, res) => {
  const doc = await getDocumentAccessible(req, res);
  if (!doc) return;
  const absolute = path.join(uploadRoot, doc.storage_path);
  if (!fs.existsSync(absolute)) {
    return fail(res, { message: 'Stored file is missing from document storage', errorCode: 'FILE_MISSING', status: 410 });
  }
  await auditService.record({ actor: req.user, action: 'DOCUMENT_DOWNLOAD', entityType: 'document', entityId: doc.id });
  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name)}"`);
  fs.createReadStream(absolute).pipe(res);
});

module.exports = { uploadDocument, listDocuments, getDocument, verifyIntegrity, verifyDocument, downloadDocument, DOC_TYPES };
