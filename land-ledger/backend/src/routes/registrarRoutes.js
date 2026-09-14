'use strict';

const express = require('express');
const registrarController = require('../controllers/registrarController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('registrar'));

router.get('/dashboard', registrarController.dashboard);
router.get('/pending-properties', registrarController.pendingProperties);
router.get('/pending-transfers', registrarController.pendingTransfers);
router.post('/properties/:id/approve', registrarController.approveProperty);
router.post('/properties/:id/reject', registrarController.rejectProperty);
router.get('/audit', registrarController.auditLogs);
router.get('/activity', registrarController.activity);
router.get('/login-events', registrarController.loginEvents);

module.exports = router;
