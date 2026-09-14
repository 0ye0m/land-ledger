'use strict';

/** Format helpers shared by controllers. */

function toBytes32PropertyId(propertyId) {
  // keccak256 of the human property id - deterministic mapping used by contract + backend.
  const { ethers } = require('ethers');
  return ethers.id(propertyId);
}

function truncateMiddle(value, head = 10, tail = 8) {
  if (!value || value.length <= head + tail + 3) return value || '';
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function nextSequentialId(prefix, year, lastRef) {
  const match = lastRef ? String(lastRef).match(/(\d+)$/) : null;
  const next = (match ? parseInt(match[1], 10) : 0) + 1;
  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
}

module.exports = { toBytes32PropertyId, truncateMiddle, nextSequentialId };
