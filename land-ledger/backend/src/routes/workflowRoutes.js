'use strict';

const express = require('express');
const workflowController = require('../controllers/workflowController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Every staff office sees exactly the files waiting on its own desk.
router.get('/queue', requireRole('surveyor', 'clerk', 'registrar', 'admin'), workflowController.queue);

// Surveyor: field verification of newly submitted registrations.
router.post('/properties/:id/survey', requireRole('surveyor'), workflowController.surveyProperty);

// Clerk: document verification (registrations + transfers).
router.post('/properties/:id/verify-docs', requireRole('clerk'), workflowController.verifyPropertyDocs);
router.post('/transfers/:id/verify-docs', requireRole('clerk'), workflowController.verifyTransferDocs);

// Admin oversight: control-tower board + override stops from any active stage.
router.get('/oversight', requireRole('admin'), workflowController.oversight);
router.post('/properties/:id/override-reject', requireRole('admin'), workflowController.overrideRejectProperty);
router.post('/transfers/:id/override-reject', requireRole('admin'), workflowController.overrideRejectTransfer);

module.exports = router;
