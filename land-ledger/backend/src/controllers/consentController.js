'use strict';

const TransferRequest = require('../models/TransferRequest');
const { ok, fail } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');
const consentService = require('../services/consentService');
const { toRow } = require('../db/rows');

/** GET /api/consents/pending - the authenticated user's "Pending Actions". */
const pending = asyncHandler(async (req, res) => {
  const actions = await consentService.pendingForUser(req.user.id);
  return ok(res, { message: 'Pending actions loaded', data: { actions, count: actions.length } });
});

/** GET /api/consents/transfer/:id - consent board for one transfer. */
const board = asyncHandler(async (req, res) => {
  const filter = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)
    ? { _id: req.params.id }
    : { transfer_reference: req.params.id };
  const transfer = await TransferRequest.findOne(filter).lean();
  if (!transfer) return fail(res, { message: 'Transfer not found', errorCode: 'TRANSFER_NOT_FOUND', status: 404 });

  const isStaff = ['registrar', 'admin', 'clerk', 'surveyor'].includes(req.user.role);
  const involved = transfer.seller_id === req.user.id || transfer.buyer_id === req.user.id;
  const consentParty = await consentService.isConsentParty({ transferId: transfer._id, userId: req.user.id });
  if (!isStaff && !involved && !consentParty) {
    return fail(res, { message: 'You do not have access to this transfer', errorCode: 'FORBIDDEN', status: 403 });
  }

  const rows = await consentService.consentsForTransfer(transfer._id);
  const withMe = rows.map((r) => ({ ...r, is_me: String(r.user_id) === String(req.user.id) }));
  const mine = withMe.find((r) => r.is_me && r.status === 'PENDING') || null;
  return ok(res, {
    message: 'Consent board loaded',
    data: {
      transfer: toRow(transfer),
      consents: withMe,
      myConsent: mine ? { consentId: mine.id, partyRole: mine.party_role, status: mine.status } : null,
      allApproved: withMe.length > 0 && withMe.every((r) => r.status === 'APPROVED'),
    },
  });
});

/** POST /api/consents/:consentId/decision - explicit approve/reject by the party. */
const decide = asyncHandler(async (req, res) => {
  const decision = String(req.body.decision || '').toUpperCase();
  const reason = String(req.body.reason || '').trim();
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    return fail(res, { message: "decision must be 'APPROVE' or 'REJECT'", errorCode: 'VALIDATION_ERROR', status: 422 });
  }
  if (decision === 'REJECT' && !reason) {
    return fail(res, { message: 'A rejection reason is required', errorCode: 'REASON_REQUIRED', status: 422 });
  }

  const result = await consentService.decide({
    consentId: req.params.consentId,
    user: req.user,
    decision,
    reason,
  });
  if (!result.ok) {
    return fail(res, { message: result.message, errorCode: result.errorCode, status: result.status });
  }

  const allApprovedNow = await consentService.allApproved(result.transfer.id);
  return ok(res, {
    message: decision === 'APPROVE'
      ? (allApprovedNow ? 'Consent recorded - all parties have approved, the transfer moves to document verification' : 'Consent recorded - waiting for the remaining parties')
      : 'Consent recorded - the transfer has been rejected',
    data: { transfer: result.transfer, consent: result.consent },
  });
});

module.exports = { pending, board, decide };
