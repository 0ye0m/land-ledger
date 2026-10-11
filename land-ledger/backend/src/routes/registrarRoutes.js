'use strict';

const express = require('express');
const registrarController = require('../controllers/registrarController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Write actions (approve/reject decisions) remain registrar-only.
const registrarWrite = requireRole('registrar');

// Read endpoints (audit trail, activity feed, login events) are shared with
// admin - the oversight board and admin audit page consume them.
router.use(requireRole('registrar', 'admin'));

router.get('/dashboard', registrarController.dashboard);
router.get('/pending-properties', registrarController.pendingProperties);
router.get('/pending-transfers', registrarController.pendingTransfers);
router.post('/properties/:id/approve', registrarWrite, registrarController.approveProperty);
router.post('/properties/:id/reject', registrarWrite, registrarController.rejectProperty);
router.get('/audit', registrarController.auditLogs);
router.get('/activity', registrarController.activity);
router.get('/login-events', registrarController.loginEvents);

module.exports = router;
