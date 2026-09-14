'use strict';

/** Standard success response body. */
function ok(res, { message = 'OK', data = null, status = 200 } = {}) {
  return res.status(status).json({ success: true, message, data });
}

/** Standard failure response body. Never leaks stack traces. */
function fail(res, { message = 'Request failed', errorCode = 'REQUEST_FAILED', status = 400, details = null } = {}) {
  const body = { success: false, message, errorCode };
  if (details) body.details = details;
  return res.status(status).json(body);
}

module.exports = { ok, fail };
