'use strict';

const express = require('express');
const consentController = require('../controllers/consentController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.get('/pending', consentController.pending);
router.get('/transfer/:id', consentController.board);
router.post('/:consentId/decision', consentController.decide);

module.exports = router;
