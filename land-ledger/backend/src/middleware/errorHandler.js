'use strict';

const logger = require('../utils/logger');
const { fail } = require('../utils/apiResponse');

function notFoundHandler(req, res) {
  return fail(res, { message: 'Resource not found', errorCode: 'NOT_FOUND', status: 404 });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err.message}`);
    if (err.stack && env_dev()) logger.debug(err.stack);
  }
  return fail(res, {
    message: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message,
    errorCode: err.errorCode || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'),
    status,
  });
}

function env_dev() {
  return process.env.NODE_ENV !== 'production';
}

module.exports = { notFoundHandler, errorHandler };
