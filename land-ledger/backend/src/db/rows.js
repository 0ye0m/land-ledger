'use strict';

/**
 * Row-shape helpers.
 *
 * Legacy PostgreSQL rows exposed `id` (uuid) in JSON responses. Mongoose
 * documents expose `_id`. These helpers convert lean Mongo docs into the
 * exact row shape the API (and the untouched frontend) expects.
 */

function toRow(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

function toRows(docs) {
  return (docs || []).map(toRow);
}

/** Escape user-provided text for safe embedding in a RegExp (LIKE-style search). */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function caseInsensitive(text) {
  return new RegExp(escapeRegExp(text), 'i');
}

module.exports = { toRow, toRows, escapeRegExp, caseInsensitive };
