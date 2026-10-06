'use strict';

/**
 * LAND LEDGER - controlled demonstration email allowlist.
 *
 * IMPORTANT SCOPE NOTE (do not remove):
 * This allowlist is a deliberate constraint of this controlled university /
 * demonstration environment ONLY. It is NOT a general production
 * authentication strategy - production systems must use proper account
 * lifecycle management instead. Only the eight allowlisted identities below
 * may hold accounts in this deployment; every other email is rejected at
 * registration and cannot be provisioned.
 *
 * Identity comparison is normalized: trim + lowercase before any comparison.
 * Role assignment is deterministic (never randomized at seed time) so the
 * demonstration stays predictable across reseeds.
 */

const ALLOWED_DEMO_USERS = [
  { email: 'mandwadeom2616@gmail.com', name: 'Om Mandwade', role: 'citizen' },
  { email: 'shrutipethe111@gmail.com', name: 'Shruti Pethe', role: 'citizen' },
  { email: 'panpaliyaag@rknec.edu', name: 'Akshay Panpaliya', role: 'surveyor' },
  { email: 'tekdiwalnishant@gmail.com', name: 'Nishant Tekdiwal', role: 'clerk' },
  { email: 'omdummy101@gmail.com', name: 'Prakash Joshi', role: 'registrar' },
  { email: 'omdummy102@gmail.com', name: 'Sunita Deshmukh', role: 'admin' },
  { email: 'alphadummy103@gmail.com', name: 'Ganesh Patil', role: 'citizen' },
  { email: 'alpha20051610@gmail.com', name: 'Kavita Sharma', role: 'citizen' },
];

/** Normalize an email for comparison: trim whitespace + lowercase. */
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** The allowlist entry for an email, or null when not allowlisted. */
function findAllowlisted(email) {
  const normalized = normalizeEmail(email);
  return ALLOWED_DEMO_USERS.find((u) => u.email === normalized) || null;
}

/** True when the email may hold an account in this controlled demo. */
function isEmailAllowed(email) {
  return Boolean(findAllowlisted(email));
}

/**
 * Mask an email for display in the MFA step, e.g.
 * "mandwadeom2616@gmail.com" -> "m***@gmail.com" (never reveal the full
 * address on screen unnecessarily).
 */
function maskEmail(email) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return normalized;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return `${local[0]}${'*'.repeat(Math.max(1, Math.min(6, local.length - 1)))}@${domain}`;
}

/**
 * Test-only escape hatch. Unit/integration tests need arbitrary @test.local
 * identities; production NEVER reads this flag. Set AUTH_ALLOWLIST=off in the
 * test harness (backend/tests/setup.js) - never in real configuration.
 */
function allowlistEnforced() {
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.AUTH_ALLOWLIST !== 'off';
}

module.exports = { ALLOWED_DEMO_USERS, normalizeEmail, findAllowlisted, isEmailAllowed, maskEmail, allowlistEnforced };
