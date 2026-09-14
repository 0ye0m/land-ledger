'use strict';

const crypto = require('crypto');

/** Compute the SHA-256 fingerprint of a Buffer. */
function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Compute the SHA-256 fingerprint of a file on disk (streamed). */
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = require('fs').createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

module.exports = { sha256Buffer, sha256File };
