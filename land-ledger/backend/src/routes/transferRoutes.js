'use strict';

const express = require('express');
const transferController = require('../controllers/transferController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.post('/', transferController.createTransfer);
router.get('/', transferController.listTransfers);
router.get('/:id', transferController.getTransfer);
router.post('/:id/approve', transferController.approveTransfer);
router.post('/:id/reject', transferController.rejectTransfer);

module.exports = router;
