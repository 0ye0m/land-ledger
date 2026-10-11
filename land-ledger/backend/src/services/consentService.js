'use strict';

/**
 * LAND LEDGER - multi-party consent engine (Parts 11-18 of the spec).
 *
 * Consent is explicit, per-party, server-enforced and replay-safe:
 *  - Every required party holds exactly one TransferConsent row.
 *  - A decision is accepted ONLY when: the JWT user IS the consent's user,
 *    the row is PENDING, the transfer is CONSENT_PENDING and the property is
 *    not yet settled. Guarded atomic updates prevent double decisions.
 *  - DECISION RULE (Part 14), applied after every accepted decision:
 *      any REJECTED  -> transfer REJECTED (remaining rows EXPIRED)
 *      all APPROVED  -> fraud revalidation -> transfer to clerk desk (PENDING)
 *      otherwise     -> transfer stays CONSENT_PENDING
 *  - There is no bypass path: staff endpoints refuse CONSENT_PENDING files
 *    and only this module can advance a transfer out of CONSENT_PENDING.
 */

const TransferRequest = require('../models/TransferRequest');
const TransferConsent = require('../models/TransferConsent');
const PropertyParty = require('../models/PropertyParty');
const Property = require('../models/Property');
const User = require('../models/User');
const { toRow, toRows } = require('../db/rows');
const auditService = require('../services/auditService');
const fraudService = require('../services/fraudService');
const emailService = require('./emailService');

/**
 * Required parties for a new transfer on a property:
 *   - every application-level OWNER / CO_OWNER (property_parties)
 *   - plus the buyer.
 * The seller's own row is created APPROVED-via-INITIATION (filing the request
 * IS their explicit act - recorded with responded_at for the audit trail).
 */
async function requiredPartiesFor({ propertyDbId, sellerId, buyerId }) {
  const partyDocs = await PropertyParty.find({ property_id: propertyDbId }).lean();
  const partyUserIds = [...new Set(partyDocs.map((p) => String(p.user_id)))];

  const rolesByUser = {};
  for (const p of partyDocs) {
    rolesByUser[String(p.user_id)] = p.party_role === 'CO_OWNER' ? 'CO_OWNER' : 'SELLER';
  }
  if (!rolesByUser[String(sellerId)]) rolesByUser[String(sellerId)] = 'SELLER';
  const buyerRole = 'BUYER';
  if (!rolesByUser[String(buyerId)]) rolesByUser[String(buyerId)] = buyerRole;

  const required = [...new Set([...partyUserIds, String(sellerId), String(buyerId)])];
  return required.map((uid) => ({ userId: uid, partyRole: rolesByUser[uid] }));
}

/**
 * Create consent rows for a freshly created transfer and flip it to
 * CONSENT_PENDING. Emails every party whose consent is still pending.
 */
async function openConsentForTransfer({ transfer, propertyBusinessId }) {
  const parties = await requiredPartiesFor({
    propertyDbId: transfer.property_id,
    sellerId: transfer.seller_id,
    buyerId: transfer.buyer_id,
  });

  const rows = parties.map((p) => {
    const isInitiator = String(p.userId) === String(transfer.seller_id);
    return {
      transfer_id: transfer.id,
      property_id: transfer.property_id,
      user_id: p.userId,
      party_role: p.partyRole,
      status: isInitiator ? 'APPROVED' : 'PENDING',
      responded_at: isInitiator ? new Date() : null,
      decided_via: isInitiator ? 'INITIATION' : 'PARTY_ACTION',
    };
  });
  const created = await TransferConsent.insertMany(rows, { ordered: true });

  // Idempotent: the transfer is created directly in CONSENT_PENDING (see
  // transferController) - this update only guards legacy PENDING rows.
  await TransferRequest.updateOne(
    { _id: transfer.id, status: { $in: ['PENDING', 'CONSENT_PENDING'] } },
    { $set: { status: 'CONSENT_PENDING' } }
  );

  await auditService.record({
    actor: { id: transfer.seller_id, full_name: null, role: 'citizen' },
    action: 'CONSENT_REQUESTED',
    entityType: 'transfer',
    entityId: transfer.transfer_reference,
    metadata: {
      propertyId: propertyBusinessId,
      requiredParties: parties.length,
      pendingParties: created.filter((c) => c.status === 'PENDING').length,
    },
  });

  // Part 15 - email every party that must still act (identifiers only).
  const pendingRows = created.filter((c) => c.status === 'PENDING');
  if (pendingRows.length) {
    const users = await User.find({ _id: { $in: pendingRows.map((c) => c.user_id) } }).select('full_name email').lean();
    const byId = Object.fromEntries(users.map((u) => [String(u._id), u]));
    for (const row of pendingRows) {
      const u = byId[String(row.user_id)];
      if (!u) continue;
      const mail = emailService.consentRequiredEmail({
        name: u.full_name,
        propertyBusinessId,
        transferReference: transfer.transfer_reference,
        partyRole: row.party_role,
      });
      emailService.sendMail({ to: u.email, subject: mail.subject, text: mail.text }).catch(() => { /* never block */ });
    }
  }

  return created;
}

/** Consent board for one transfer (rows + party names). */
async function consentsForTransfer(transferId) {
  const docs = await TransferConsent.find({ transfer_id: transferId }).sort({ created_at: 1 }).lean();
  const rows = toRows(docs);
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select('full_name email').lean() : [];
  const byId = Object.fromEntries(users.map((u) => [u._id, u]));
  return rows.map((r) => ({
    id: r.id,
    transfer_id: r.transfer_id,
    property_id: r.property_id,
    user_id: r.user_id,
    party_role: r.party_role,
    status: r.status,
    created_at: r.created_at,
    responded_at: r.responded_at,
    rejection_reason: r.rejection_reason,
    party_name: byId[r.user_id] ? byId[r.user_id].full_name : null,
    party_email: byId[r.user_id] ? byId[r.user_id].email : null,
    is_me: null, // filled by the controller per requester
  }));
}

/** True when every consent row of the transfer is APPROVED. */
async function allApproved(transferId) {
  const rows = await TransferConsent.find({ transfer_id: transferId }).select('status').lean();
  return rows.length > 0 && rows.every((r) => r.status === 'APPROVED');
}

/**
 * Apply the Part 14 decision rule after an accepted consent decision.
 * Reads persisted rows - never client state. Returns the updated transfer.
 */
async function resolveAfterDecision({ transfer, actor }) {
  const rows = await TransferConsent.find({ transfer_id: transfer.id }).lean();
  const rejected = rows.find((r) => r.status === 'REJECTED');

  if (rejected) {
    // Expire the remaining open rows (they can no longer act).
    await TransferConsent.updateMany(
      { transfer_id: transfer.id, status: 'PENDING' },
      { $set: { status: 'EXPIRED', responded_at: new Date() } }
    );
    const updated = await TransferRequest.findOneAndUpdate(
      { _id: transfer.id, status: 'CONSENT_PENDING' },
      {
        $set: {
          status: 'REJECTED',
          rejection_stage: 'CONSENT',
          rejection_reason: rejected.rejection_reason || `Consent rejected by a required party (${rejected.party_role})`,
          rejected_by: rejected.user_id,
          updated_at: new Date(),
        },
      },
      { new: true }
    ).lean();
    await auditService.record({
      actor, action: 'TRANSFER_CONSENT_REJECTED', entityType: 'transfer', entityId: transfer.transfer_reference,
      result: 'FAILURE', metadata: { partyRole: rejected.party_role, reason: rejected.rejection_reason },
    });
    return toRow(updated || transfer);
  }

  const allApprovedNow = rows.length > 0 && rows.every((r) => r.status === 'APPROVED');
  if (!allApprovedNow) {
    await auditService.record({
      actor, action: 'TRANSFER_CONSENT_STILL_PENDING', entityType: 'transfer', entityId: transfer.transfer_reference,
      metadata: {
        approved: rows.filter((r) => r.status === 'APPROVED').length,
        required: rows.length,
      },
    });
    return toRow(transfer);
  }

  // All parties approved -> fraud/conflict revalidation, then to the clerk desk.
  const propertyDoc = await Property.findById(transfer.property_id).lean();
  const propertyBusinessId = propertyDoc ? propertyDoc.property_id : null;
  const fresh = await fraudService.runFraudChecks({
    propertyId: propertyBusinessId,
    sellerId: transfer.seller_id,
    buyerId: transfer.buyer_id,
    buyerWallet: transfer.buyer_wallet,
    excludeTransferId: transfer.id,
    createdAt: transfer.created_at,
  });
  await fraudService.persistFraudCheck(transfer.id, fresh);

  if (fresh.isFraudulent) {
    await TransferConsent.updateMany({ transfer_id: transfer.id, status: 'PENDING' }, { $set: { status: 'EXPIRED', responded_at: new Date() } });
    const updated = await TransferRequest.findOneAndUpdate(
      { _id: transfer.id, status: 'CONSENT_PENDING' },
      { $set: { status: 'REJECTED', rejection_stage: 'CONSENT', rejection_reason: 'Blocked by fraud/conflict revalidation after consent', updated_at: new Date() } },
      { new: true }
    ).lean();
    await auditService.record({
      actor, action: 'TRANSFER_BLOCKED_FRAUD_AFTER_CONSENT', entityType: 'transfer', entityId: transfer.transfer_reference,
      result: 'FAILURE', metadata: { reasons: fresh.reasons },
    });
    return toRow(updated || transfer);
  }

  const updated = await TransferRequest.findOneAndUpdate(
    { _id: transfer.id, status: 'CONSENT_PENDING' },
    { $set: { status: 'PENDING', updated_at: new Date() } }, // clerk document verification holds the file next
    { new: true }
  ).lean();
  await auditService.record({
    actor, action: 'TRANSFER_CONSENT_COMPLETE', entityType: 'transfer', entityId: transfer.transfer_reference,
    metadata: { propertyId: propertyBusinessId, riskLevel: fresh.riskLevel, nextStage: 'DOCUMENT_VERIFICATION' },
  });
  return toRow(updated || transfer);
}

/**
 * Record one authenticated party decision (Part 18 guard chain).
 * Returns { ok, transfer } or { ok:false, errorCode, status, message }.
 */
async function decide({ consentId, user, decision, reason }) {
  const consent = await TransferConsent.findById(consentId).lean();
  if (!consent) return { ok: false, errorCode: 'CONSENT_NOT_FOUND', status: 404, message: 'Consent record not found' };

  // (3) the authenticated user must BE the required party
  if (String(consent.user_id) !== String(user.id)) {
    return { ok: false, errorCode: 'FORBIDDEN', status: 403, message: 'This consent decision belongs to another party' };
  }
  // (4) no double responding (rejection/expiry/consumption all immutable)
  if (consent.status !== 'PENDING') {
    return { ok: false, errorCode: 'CONSENT_ALREADY_RESOLVED', status: 409, message: 'You have already responded to this request' };
  }

  const transferDoc = await TransferRequest.findById(consent.transfer_id).lean();
  if (!transferDoc) return { ok: false, errorCode: 'TRANSFER_NOT_FOUND', status: 404, message: 'Transfer not found' };

  // (5) consent only possible while the transfer sits at the consent gate
  if (transferDoc.status !== 'CONSENT_PENDING') {
    return { ok: false, errorCode: 'INVALID_STATE', status: 409, message: 'This transfer is no longer waiting for consent' };
  }
  // (6) a settled/rejected property can never be consented again
  const propertyDoc = await Property.findById(consent.property_id).lean();
  if (!propertyDoc) return { ok: false, errorCode: 'PROPERTY_NOT_FOUND', status: 404, message: 'Property not found' };
  if (['REJECTED'].includes(propertyDoc.status)) {
    return { ok: false, errorCode: 'INVALID_STATE', status: 409, message: 'The underlying property is no longer active' };
  }

  const isApprove = decision === 'APPROVE';
  // (7) guarded atomic update - two simultaneous decisions cannot both win
  const updatedConsent = await TransferConsent.findOneAndUpdate(
    { _id: consentId, status: 'PENDING' },
    {
      $set: {
        status: isApprove ? 'APPROVED' : 'REJECTED',
        responded_at: new Date(),
        rejection_reason: isApprove ? null : String(reason || '').trim() || null,
        decided_via: 'PARTY_ACTION',
      },
    },
    { new: true }
  ).lean();
  if (!updatedConsent) {
    return { ok: false, errorCode: 'CONSENT_ALREADY_RESOLVED', status: 409, message: 'You have already responded to this request' };
  }

  const actor = { id: user.id, full_name: user.full_name, role: user.role };
  await auditService.record({
    actor,
    action: isApprove ? 'CONSENT_APPROVED' : 'CONSENT_REJECTED',
    entityType: 'transfer',
    entityId: transferDoc.transfer_reference,
    result: isApprove ? 'SUCCESS' : 'FAILURE',
    metadata: { partyRole: consent.party_role, reason: isApprove ? null : String(reason || '').trim() },
  });

  const transfer = await resolveAfterDecision({ transfer: toRow(transferDoc), actor });
  return { ok: true, transfer, consent: toRow(updatedConsent) };
}

/** Pending consent actions for one user (citizen "Pending Actions" feed). */
async function pendingForUser(userId) {
  const rows = await TransferConsent.find({ user_id: userId, status: 'PENDING' })
    .sort({ created_at: 1 })
    .lean();
  if (!rows.length) return [];
  const transfers = await TransferRequest.find({ _id: { $in: rows.map((r) => r.transfer_id) } }).lean();
  const transferById = Object.fromEntries(transfers.map((t) => [String(t._id), t]));
  const propIds = [...new Set(transfers.map((t) => t.property_id).filter(Boolean))];
  const props = propIds.length ? await Property.find({ _id: { $in: propIds } }).select('property_id title').lean() : [];
  const propById = Object.fromEntries(props.map((p) => [p._id, p]));

  const out = [];
  for (const row of rows) {
    const t = transferById[String(row.transfer_id)];
    if (!t || t.status !== 'CONSENT_PENDING') continue; // stale guard
    const p = propById[t.property_id] || {};
    const board = await consentsForTransfer(t._id);
    out.push({
      consent_id: row._id,
      transfer_id: t._id,
      transfer_reference: t.transfer_reference,
      property_id: p.property_id || null,
      property_title: p.title || null,
      your_role: row.party_role,
      requested_at: t.created_at,
      consent_status: row.status,
      parties: board.map((b) => ({
        party_name: b.party_name,
        party_role: b.party_role,
        status: b.status,
        responded_at: b.responded_at,
      })),
    });
  }
  return out;
}

/** Access check for transfer detail views: involved party or consent party. */
async function isConsentParty({ transferId, userId }) {
  const row = await TransferConsent.findOne({ transfer_id: transferId, user_id: userId }).lean();
  return Boolean(row);
}

module.exports = {
  requiredPartiesFor,
  openConsentForTransfer,
  consentsForTransfer,
  allApproved,
  resolveAfterDecision,
  decide,
  pendingForUser,
  isConsentParty,
};
