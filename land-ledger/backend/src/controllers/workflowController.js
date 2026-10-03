'use strict';

/**
 * LAND LEDGER - multi-role workflow engine.
 *
 * Splits the old registrar god-mode into a proper government-style pipeline:
 *
 *   REGISTRATION : citizen files -> SURVEYOR (field survey) -> CLERK (documents)
 *                  -> REGISTRAR (legal approval + blockchain) -> REGISTERED
 *   TRANSFER     : citizen files -> CLERK (documents) -> REGISTRAR (settlement)
 *   OVERSIGHT    : ADMIN sees every queue and can override-reject any active file
 *
 * Status == the office currently holding the file:
 *   Property : SUBMITTED -> SURVEY_VERIFIED -> DOCS_VERIFIED -> REGISTERED | REJECTED
 *   Transfer : PENDING   -> DOCS_VERIFIED -> APPROVED -> COMPLETED | REJECTED | FAILED
 */

const Property = require('../models/Property');
const { ACTIVE_STATUSES } = require('../models/Property');
const TransferRequest = require('../models/TransferRequest');
const User = require('../models/User');
const Document = require('../models/Document');
const { toRow, toRows } = require('../db/rows');
const { ok, fail } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');
const auditService = require('../services/auditService');

const STAGE_BY_PROPERTY_STATUS = {
  SUBMITTED: 'SURVEY',
  SURVEY_VERIFIED: 'DOCUMENT_VERIFICATION',
  DOCS_VERIFIED: 'REGISTRAR_REVIEW',
};
const STAGE_BY_TRANSFER_STATUS = {
  PENDING: 'DOCUMENT_VERIFICATION',
  DOCS_VERIFIED: 'REGISTRAR_REVIEW',
};

/** Append a workflow entry to the property's stage history. */
async function pushPropertyHistory(propertyId, entry) {
  await Property.updateOne({ _id: propertyId }, { $push: { stage_history: entry } });
}

/** Attach submitter names + document counts to property rows. */
async function decorateProperties(docs) {
  const rows = toRows(docs);
  const propIds = rows.map((p) => p.id).filter(Boolean);
  const submitterIds = [...new Set(rows.map((p) => p.submitted_by_id).filter(Boolean))];
  const [docCounts, verifiedCounts, submitters] = await Promise.all([
    propIds.length ? Document.aggregate([{ $match: { property_id: { $in: propIds } } }, { $group: { _id: '$property_id', n: { $sum: 1 } } }]) : [],
    propIds.length ? Document.aggregate([{ $match: { property_id: { $in: propIds }, verification_status: 'VERIFIED' } }, { $group: { _id: '$property_id', n: { $sum: 1 } } }]) : [],
    submitterIds.length ? User.find({ _id: { $in: submitterIds } }).select('full_name email').lean() : [],
  ]);
  const docCountById = Object.fromEntries(docCounts.map((d) => [d._id, d.n]));
  const verifiedById = Object.fromEntries(verifiedCounts.map((d) => [d._id, d.n]));
  const submitterById = Object.fromEntries(submitters.map((u) => [u._id, u]));
  return rows.map((p) => {
    const s = p.submitted_by_id ? submitterById[p.submitted_by_id] : null;
    return {
      ...p,
      submitted_by_name: s ? s.full_name : null,
      submitted_by_email: s ? s.email : null,
      document_count: docCountById[p.id] || 0,
      verified_document_count: verifiedById[p.id] || 0,
    };
  });
}

/** Attach property/seller/buyer names + fraud summary to transfer rows. */
async function decorateTransfers(docs) {
  const rows = toRows(docs);
  const propIds = [...new Set(rows.map((t) => t.property_id).filter(Boolean))];
  const personIds = [...new Set(rows.flatMap((t) => [t.seller_id, t.buyer_id]).filter(Boolean))];
  const [props, people] = await Promise.all([
    propIds.length ? Property.find({ _id: { $in: propIds } }).select('property_id title').lean() : [],
    personIds.length ? User.find({ _id: { $in: personIds } }).select('full_name').lean() : [],
  ]);
  const propById = Object.fromEntries(props.map((p) => [p._id, p]));
  const personById = Object.fromEntries(people.map((u) => [u._id, u]));
  return rows.map((t) => {
    const p = propById[t.property_id] || {};
    return {
      ...t,
      property_business_id: p.property_id || null,
      property_title: p.title || null,
      seller_name: t.seller_id && personById[t.seller_id] ? personById[t.seller_id].full_name : null,
      buyer_name: t.buyer_id && personById[t.buyer_id] ? personById[t.buyer_id].full_name : null,
    };
  });
}

/**
 * One-time (idempotent) legacy migration: the single-step registrar era used
 * PENDING_REVIEW; those files were sitting at the registrar desk, so they map
 * to DOCS_VERIFIED. Safe to run on every boot - it is a no-op once done.
 */
async function migrateLegacyStatuses() {
  const res = await Property.updateMany(
    { status: 'PENDING_REVIEW' },
    { $set: { status: 'DOCS_VERIFIED' } }
  );
  if (res.modifiedCount > 0) {
    console.log(`[workflow] migrated ${res.modifiedCount} legacy PENDING_REVIEW properties -> DOCS_VERIFIED`);
  }
}

/**
 * GET /api/workflow/queue - role-aware work queue.
 * Each office sees exactly the files waiting on ITS desk.
 */
const queue = asyncHandler(async (req, res) => {
  const role = req.user.role;
  const data = { role, properties: [], transfers: [], counts: {} };

  if (role === 'surveyor') {
    const docs = await Property.find({ status: 'SUBMITTED' }).sort({ created_at: 1 }).lean();
    data.properties = await decorateProperties(docs);
  } else if (role === 'clerk') {
    const [propDocs, transferDocs] = await Promise.all([
      Property.find({ status: 'SURVEY_VERIFIED' }).sort({ created_at: 1 }).lean(),
      TransferRequest.find({ status: 'PENDING' }).sort({ created_at: 1 }).lean(),
    ]);
    data.properties = await decorateProperties(propDocs);
    data.transfers = await decorateTransfers(transferDocs);
  } else if (role === 'registrar') {
    const [propDocs, transferDocs] = await Promise.all([
      Property.find({ status: 'DOCS_VERIFIED' }).sort({ created_at: 1 }).lean(),
      TransferRequest.find({ status: 'DOCS_VERIFIED' }).sort({ created_at: 1 }).lean(),
    ]);
    data.properties = await decorateProperties(propDocs);
    data.transfers = await decorateTransfers(transferDocs);
  } else if (role === 'admin') {
    const [propDocs, transferDocs, propCounts, transferCounts, usersByRole] = await Promise.all([
      Property.find({ status: { $in: ACTIVE_STATUSES } }).sort({ created_at: 1 }).lean(),
      TransferRequest.find({ status: { $in: ['PENDING', 'DOCS_VERIFIED'] } }).sort({ created_at: 1 }).lean(),
      Property.aggregate([{ $match: { status: { $in: ACTIVE_STATUSES } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      TransferRequest.aggregate([{ $match: { status: { $in: ['PENDING', 'DOCS_VERIFIED'] } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
    ]);
    data.properties = await decorateProperties(propDocs);
    data.transfers = await decorateTransfers(transferDocs);
    data.counts = {
      propertiesByStage: Object.fromEntries(propCounts.map((c) => [c._id, c.n])),
      transfersByStage: Object.fromEntries(transferCounts.map((c) => [c._id, c.n])),
      usersByRole: Object.fromEntries(usersByRole.map((c) => [c._id, c.n])),
    };
  } else {
    return fail(res, { message: 'This queue is only for registry staff accounts', errorCode: 'FORBIDDEN', status: 403 });
  }

  return ok(res, { message: 'Workflow queue loaded', data });
});

function validateDecision(body) {
  const decision = String(body.decision || '').toUpperCase();
  const notes = String(body.notes || '').trim();
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    return { error: "decision must be 'APPROVE' or 'REJECT'" };
  }
  if (decision === 'REJECT' && !notes) {
    return { error: 'A reason is required when rejecting' };
  }
  return { decision, notes: notes || null };
}

/**
 * POST /api/workflow/properties/:id/survey - surveyor field verification.
 * APPROVE: SUBMITTED -> SURVEY_VERIFIED. REJECT: -> REJECTED (at SURVEY stage).
 */
const surveyProperty = asyncHandler(async (req, res) => {
  const { error, decision, notes } = validateDecision(req.body);
  if (error) return fail(res, { message: error, errorCode: 'VALIDATION_ERROR', status: 422 });

  const propDoc = await Property.findOne({ $or: [{ _id: req.params.id }, { property_id: req.params.id }] }).lean();
  if (!propDoc) return fail(res, { message: 'Property not found', errorCode: 'PROPERTY_NOT_FOUND', status: 404 });
  const property = toRow(propDoc);
  if (property.status !== 'SUBMITTED') {
    return fail(res, { message: `Only newly submitted applications await survey (current stage: ${property.status})`, errorCode: 'INVALID_STATE', status: 409 });
  }

  const actor = { id: req.user.id, full_name: req.user.full_name, role: req.user.role };
  if (decision === 'APPROVE') {
    const updated = await Property.findOneAndUpdate(
      { _id: property.id, status: 'SUBMITTED' },
      { $set: { status: 'SURVEY_VERIFIED', survey_notes: notes, updated_at: new Date() } },
      { new: true }
    ).lean();
    await pushPropertyHistory(property.id, { stage: 'SURVEY', action: 'SURVEY_PASSED', by_id: actor.id, by_name: actor.full_name, by_role: actor.role, notes });
    await auditService.record({
      actor: req.user, action: 'SURVEY_PASSED', entityType: 'property', entityId: property.property_id,
      metadata: { notes: notes || 'field survey clear' },
    });
    return ok(res, { message: 'Field survey cleared - moved to document verification', data: { property: toRow(updated) } });
  }

  const updated = await Property.findOneAndUpdate(
    { _id: property.id, status: 'SUBMITTED' },
    { $set: { status: 'REJECTED', rejection_stage: 'SURVEY', review_notes: notes, updated_at: new Date() } },
    { new: true }
  ).lean();
  await pushPropertyHistory(property.id, { stage: 'SURVEY', action: 'SURVEY_REJECTED', by_id: actor.id, by_name: actor.full_name, by_role: actor.role, notes });
  await auditService.record({
    actor: req.user, action: 'SURVEY_REJECTED', entityType: 'property', entityId: property.property_id,
    result: 'FAILURE', metadata: { reason: notes },
  });
  return ok(res, { message: 'Application rejected at field survey', data: { property: toRow(updated) } });
});

/**
 * POST /api/workflow/properties/:id/verify-docs - clerk document verification.
 * APPROVE: SURVEY_VERIFIED -> DOCS_VERIFIED. REJECT: -> REJECTED (at DOCUMENT_VERIFICATION).
 */
const verifyPropertyDocs = asyncHandler(async (req, res) => {
  const { error, decision, notes } = validateDecision(req.body);
  if (error) return fail(res, { message: error, errorCode: 'VALIDATION_ERROR', status: 422 });

  const propDoc = await Property.findOne({ $or: [{ _id: req.params.id }, { property_id: req.params.id }] }).lean();
  if (!propDoc) return fail(res, { message: 'Property not found', errorCode: 'PROPERTY_NOT_FOUND', status: 404 });
  const property = toRow(propDoc);
  if (property.status !== 'SURVEY_VERIFIED') {
    return fail(res, { message: `Only survey-cleared applications await document verification (current stage: ${property.status})`, errorCode: 'INVALID_STATE', status: 409 });
  }

  const actor = { id: req.user.id, full_name: req.user.full_name, role: req.user.role };
  if (decision === 'APPROVE') {
    const updated = await Property.findOneAndUpdate(
      { _id: property.id, status: 'SURVEY_VERIFIED' },
      { $set: { status: 'DOCS_VERIFIED', updated_at: new Date() } },
      { new: true }
    ).lean();
    await pushPropertyHistory(property.id, { stage: 'DOCUMENT_VERIFICATION', action: 'DOCS_VERIFIED', by_id: actor.id, by_name: actor.full_name, by_role: actor.role, notes });
    await auditService.record({
      actor: req.user, action: 'DOCS_VERIFIED_PASS', entityType: 'property', entityId: property.property_id,
      metadata: { notes: notes || 'documents in order' },
    });
    return ok(res, { message: 'Documents verified - moved to registrar legal review', data: { property: toRow(updated) } });
  }

  const updated = await Property.findOneAndUpdate(
    { _id: property.id, status: 'SURVEY_VERIFIED' },
    { $set: { status: 'REJECTED', rejection_stage: 'DOCUMENT_VERIFICATION', review_notes: notes, updated_at: new Date() } },
    { new: true }
  ).lean();
  await pushPropertyHistory(property.id, { stage: 'DOCUMENT_VERIFICATION', action: 'DOCS_REJECTED', by_id: actor.id, by_name: actor.full_name, by_role: actor.role, notes });
  await auditService.record({
    actor: req.user, action: 'DOCS_VERIFIED_FAIL', entityType: 'property', entityId: property.property_id,
    result: 'FAILURE', metadata: { reason: notes },
  });
  return ok(res, { message: 'Application rejected at document verification', data: { property: toRow(updated) } });
});

/**
 * POST /api/workflow/transfers/:id/verify-docs - clerk verification of a transfer file.
 * APPROVE: PENDING -> DOCS_VERIFIED. REJECT: -> REJECTED (at DOCUMENT_VERIFICATION).
 */
const verifyTransferDocs = asyncHandler(async (req, res) => {
  const { error, decision, notes } = validateDecision(req.body);
  if (error) return fail(res, { message: error, errorCode: 'VALIDATION_ERROR', status: 422 });

  const transfer = await TransferRequest.findById(req.params.id).lean();
  if (!transfer) return fail(res, { message: 'Transfer not found', errorCode: 'TRANSFER_NOT_FOUND', status: 404 });
  if (transfer.status !== 'PENDING') {
    return fail(res, { message: `Only pending transfers await document verification (current stage: ${transfer.status})`, errorCode: 'INVALID_STATE', status: 409 });
  }

  const actor = { id: req.user.id, full_name: req.user.full_name, role: req.user.role };
  if (decision === 'APPROVE') {
    const updated = await TransferRequest.findOneAndUpdate(
      { _id: transfer._id, status: 'PENDING' },
      { $set: { status: 'DOCS_VERIFIED', doc_verified_by: actor.id, doc_verified_at: new Date(), doc_notes: notes, updated_at: new Date() } },
      { new: true }
    ).lean();
    await auditService.record({
      actor: req.user, action: 'TRANSFER_DOCS_VERIFIED', entityType: 'transfer', entityId: transfer.transfer_reference,
      metadata: { notes: notes || 'transfer documents in order' },
    });
    return ok(res, { message: 'Transfer documents verified - moved to registrar', data: { transfer: toRow(updated) } });
  }

  const updated = await TransferRequest.findOneAndUpdate(
    { _id: transfer._id, status: 'PENDING' },
    { $set: { status: 'REJECTED', rejection_stage: 'DOCUMENT_VERIFICATION', rejection_reason: notes, rejected_by: actor.id, updated_at: new Date() } },
    { new: true }
  ).lean();
  await auditService.record({
    actor: req.user, action: 'TRANSFER_DOCS_REJECTED', entityType: 'transfer', entityId: transfer.transfer_reference,
    result: 'FAILURE', metadata: { reason: notes },
  });
  return ok(res, { message: 'Transfer rejected at document verification', data: { transfer: toRow(updated) } });
});

/**
 * POST /api/workflow/properties/:id/override-reject - admin override stop.
 * Works from any active stage (SUBMITTED / SURVEY_VERIFIED / DOCS_VERIFIED).
 */
const overrideRejectProperty = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return fail(res, { message: 'A reason is required', errorCode: 'REASON_REQUIRED', status: 422 });

  const propDoc = await Property.findOne({ $or: [{ _id: req.params.id }, { property_id: req.params.id }] }).lean();
  if (!propDoc) return fail(res, { message: 'Property not found', errorCode: 'PROPERTY_NOT_FOUND', status: 404 });
  const property = toRow(propDoc);
  const stage = STAGE_BY_PROPERTY_STATUS[property.status];
  if (!stage) {
    return fail(res, { message: `Only active applications can be stopped (current status: ${property.status})`, errorCode: 'INVALID_STATE', status: 409 });
  }

  const actor = { id: req.user.id, full_name: req.user.full_name, role: req.user.role };
  const updated = await Property.findOneAndUpdate(
    { _id: property.id, status: property.status },
    { $set: { status: 'REJECTED', rejection_stage: stage, review_notes: reason, updated_at: new Date() } },
    { new: true }
  ).lean();
  await pushPropertyHistory(property.id, { stage, action: 'ADMIN_OVERRIDE_REJECT', by_id: actor.id, by_name: actor.full_name, by_role: actor.role, notes: reason });
  await auditService.record({
    actor: req.user, action: 'PROPERTY_OVERRIDE_REJECT', entityType: 'property', entityId: property.property_id,
    result: 'FAILURE', metadata: { reason, stoppedAtStage: stage },
  });
  return ok(res, { message: `Application stopped by oversight at ${stage.toLowerCase().replace('_', ' ')}`, data: { property: toRow(updated) } });
});

/** POST /api/workflow/transfers/:id/override-reject - admin override stop on transfers. */
const overrideRejectTransfer = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return fail(res, { message: 'A reason is required', errorCode: 'REASON_REQUIRED', status: 422 });

  const transfer = await TransferRequest.findById(req.params.id).lean();
  if (!transfer) return fail(res, { message: 'Transfer not found', errorCode: 'TRANSFER_NOT_FOUND', status: 404 });
  const stage = STAGE_BY_TRANSFER_STATUS[transfer.status];
  if (!stage) {
    return fail(res, { message: `Only active transfers can be stopped (current status: ${transfer.status})`, errorCode: 'INVALID_STATE', status: 409 });
  }

  const actor = { id: req.user.id, full_name: req.user.full_name, role: req.user.role };
  const updated = await TransferRequest.findOneAndUpdate(
    { _id: transfer._id, status: transfer.status },
    { $set: { status: 'REJECTED', rejection_stage: stage, rejection_reason: reason, rejected_by: actor.id, updated_at: new Date() } },
    { new: true }
  ).lean();
  await auditService.record({
    actor: req.user, action: 'TRANSFER_OVERRIDE_REJECT', entityType: 'transfer', entityId: transfer.transfer_reference,
    result: 'FAILURE', metadata: { reason, stoppedAtStage: stage },
  });
  return ok(res, { message: `Transfer stopped by oversight at ${stage.toLowerCase().replace('_', ' ')}`, data: { transfer: toRow(updated) } });
});

/**
 * GET /api/workflow/oversight - admin control-tower view: stage-wise counts,
 * every active file in one board, staff/citizen roster.
 */
const oversight = asyncHandler(async (req, res) => {
  const [propStageCounts, transferStageCounts, users, recentAudit] = await Promise.all([
    Property.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    TransferRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    User.find().select('full_name email role district state created_at last_activity_at').sort({ created_at: -1 }).limit(100).lean(),
    auditService.listLogs({ page: 1, pageSize: 10 }),
  ]);

  return ok(res, {
    message: 'Oversight board loaded',
    data: {
      propertyStageCounts: Object.fromEntries(propStageCounts.map((c) => [c._id, c.n])),
      transferStageCounts: Object.fromEntries(transferStageCounts.map((c) => [c._id, c.n])),
      users: toRows(users),
      recentAudit: recentAudit.logs || recentAudit || [],
    },
  });
});

module.exports = {
  migrateLegacyStatuses,
  queue,
  surveyProperty,
  verifyPropertyDocs,
  verifyTransferDocs,
  overrideRejectProperty,
  overrideRejectTransfer,
  oversight,
};
