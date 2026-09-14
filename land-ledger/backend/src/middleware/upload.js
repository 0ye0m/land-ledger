'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const env = require('../config/env');
const { fail } = require('../utils/apiResponse');

const uploadRoot = path.resolve(process.cwd(), env.uploads.dir);
fs.mkdirSync(uploadRoot, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream', // some browsers send this for .doc
]);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const propertyDir = path.join(uploadRoot, String(req.body.propertyId || 'general').replace(/[^\w-]/g, ''));
    fs.mkdir(propertyDir, { recursive: true }, (err) => {
      if (err) return cb(err);
      cb(null, propertyDir);
    });
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  if (!env.uploads.allowedExtensions.includes(ext)) {
    return cb(Object.assign(new Error(`File type .${ext} is not allowed. Allowed: ${env.uploads.allowedExtensions.join(', ')}`), { status: 400, errorCode: 'INVALID_FILE_TYPE' }));
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    // Do not trust client MIME blindly, but block clearly hostile types.
    return cb(Object.assign(new Error(`Content type ${file.mimetype} is not accepted`), { status: 400, errorCode: 'INVALID_CONTENT_TYPE' }));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.uploads.maxMb * 1024 * 1024, files: 1 },
});

function multerErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? `File exceeds the ${env.uploads.maxMb}MB limit` : `Upload failed: ${err.code}`;
    return fail(res, { message, errorCode: 'UPLOAD_ERROR', status: 400 });
  }
  if (err && err.errorCode) {
    return fail(res, { message: err.message, errorCode: err.errorCode, status: err.status || 400 });
  }
  next(err);
}

module.exports = { upload, uploadRoot, multerErrorHandler };
