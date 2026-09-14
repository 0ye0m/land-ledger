'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { fail } = require('../utils/apiResponse');
const User = require('../models/User');
const { toRow } = require('../db/rows');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Authenticate the request via signed JWT; loads a fresh user record server-side. */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return fail(res, { message: 'Authentication required', errorCode: 'UNAUTHENTICATED', status: 401 });
  }
  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch (err) {
    return fail(res, { message: 'Session expired or invalid. Please sign in again.', errorCode: 'INVALID_TOKEN', status: 401 });
  }
  User.findById(payload.sub)
    .lean()
    .then((doc) => {
      if (!doc) {
        return fail(res, { message: 'Account no longer exists', errorCode: 'USER_NOT_FOUND', status: 401 });
      }
      req.user = toRow(doc); // trusted, loaded from database, legacy row shape
      next();
    })
    .catch(next);
}

/** Authorize by role. Must run after requireAuth. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return fail(res, { message: 'Authentication required', errorCode: 'UNAUTHENTICATED', status: 401 });
    }
    if (!roles.includes(req.user.role)) {
      return fail(res, { message: 'You do not have permission to perform this action', errorCode: 'FORBIDDEN', status: 403 });
    }
    next();
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    district: user.district,
    state: user.state,
    role: user.role,
    walletAddress: user.wallet_address,
    createdAt: user.created_at,
    lastActivityAt: user.last_activity_at,
  };
}

module.exports = { requireAuth, requireRole, signToken, publicUser };
