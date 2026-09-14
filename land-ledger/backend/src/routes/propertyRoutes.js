'use strict';

const express = require('express');
const propertyController = require('../controllers/propertyController');
const blockchainController = require('../controllers/blockchainController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.post('/', propertyController.createProperty);
router.get('/', propertyController.listProperties);
router.get('/search', propertyController.searchProperties);
router.get('/:id', propertyController.getProperty);
router.get('/:id/ownership-history', blockchainController.ownershipHistory);
router.put('/:id', propertyController.updateProperty);

module.exports = router;
