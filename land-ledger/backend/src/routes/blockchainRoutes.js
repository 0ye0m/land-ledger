'use strict';

const express = require('express');
const blockchainController = require('../controllers/blockchainController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/status', blockchainController.status);
router.get('/transactions', blockchainController.listTransactions);
router.get('/transactions/:id', blockchainController.getTransaction);

module.exports = router;
