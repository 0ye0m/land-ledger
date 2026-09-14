'use strict';

const express = require('express');
const documentController = require('../controllers/documentController');
const { requireAuth } = require('../middleware/auth');
const { upload, multerErrorHandler } = require('../middleware/upload');

const router = express.Router();
router.use(requireAuth);

router.post('/upload', upload.single('file'), multerErrorHandler, documentController.uploadDocument);
router.get('/', documentController.listDocuments);
router.get('/:id', documentController.getDocument);
router.post('/:id/verify-integrity', documentController.verifyIntegrity);
router.post('/:id/verify', documentController.verifyDocument);
router.get('/:id/download', documentController.downloadDocument);

module.exports = router;
