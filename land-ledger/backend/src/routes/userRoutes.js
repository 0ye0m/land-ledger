'use strict';

const express = require('express');
const userController = require('../controllers/userController');
const citizenController = require('../controllers/citizenController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/me', userController.getMe);
router.put('/me', userController.updateMe);
router.put('/me/password', userController.changePassword);
router.get('/dashboard', citizenController.dashboard);

module.exports = router;
