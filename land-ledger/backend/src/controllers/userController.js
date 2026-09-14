'use strict';

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { toRow } = require('../db/rows');
const { ok, fail } = require('../utils/apiResponse');
const { asyncHandler } = require('../utils/asyncHandler');
const { publicUser } = require('../middleware/auth');
const auditService = require('../services/auditService');
const { WALLET_RE } = require('../validators');

/** GET /api/users/me */
const getMe = asyncHandler(async (req, res) => {
  return ok(res, { message: 'Profile loaded', data: { user: publicUser(req.user) } });
});

/** PUT /api/users/me - update own profile (role is immutable by design). */
const updateMe = asyncHandler(async (req, res) => {
  const fullName = String(req.body.fullName ?? req.user.full_name).trim();
  const phone = String(req.body.phone ?? req.user.phone ?? '').trim();
  const district = String(req.body.district ?? req.user.district ?? '').trim();
  const state = String(req.body.state ?? req.user.state ?? '').trim();
  let wallet = String(req.body.walletAddress ?? req.user.wallet_address ?? '').trim() || null;

  if (fullName.length < 3) {
    return fail(res, { message: 'Full name must be at least 3 characters', errorCode: 'VALIDATION_ERROR', status: 422 });
  }
  if (wallet && !WALLET_RE.test(wallet)) {
    return fail(res, { message: 'Wallet address must be a valid 0x address', errorCode: 'VALIDATION_ERROR', status: 422 });
  }

  const updated = await User.findByIdAndUpdate(
    req.user.id,
    { $set: { full_name: fullName, phone: phone || null, district: district || null, state: state || null, wallet_address: wallet } },
    { new: true }
  ).lean();

  await auditService.record({ actor: req.user, action: 'PROFILE_UPDATE', entityType: 'user', entityId: req.user.id });
  return ok(res, { message: 'Profile updated', data: { user: publicUser(toRow(updated)) } });
});

/** PUT /api/users/me/password */
const changePassword = asyncHandler(async (req, res) => {
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  if (next.length < 8) {
    return fail(res, { message: 'New password must use at least 8 characters', errorCode: 'VALIDATION_ERROR', status: 422 });
  }
  const passwordOk = await bcrypt.compare(current, req.user.password_hash);
  if (!passwordOk) {
    return fail(res, { message: 'Current password is incorrect', errorCode: 'INVALID_CREDENTIALS', status: 401 });
  }
  const hash = await bcrypt.hash(next, 10);
  await User.updateOne({ _id: req.user.id }, { $set: { password_hash: hash } });
  await auditService.record({ actor: req.user, action: 'PASSWORD_CHANGE', entityType: 'user', entityId: req.user.id });
  return ok(res, { message: 'Password updated successfully' });
});

module.exports = { getMe, updateMe, changePassword };
