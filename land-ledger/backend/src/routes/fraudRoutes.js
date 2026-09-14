'use strict';

const express = require('express');
const fraudController = require('../controllers/fraudController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.post('/check', fraudController.checkFraud);
router.get('/:transferId', fraudController.getFraudForTransfer);

module.exports = router;
