'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const authLimiter =
  process.env.NODE_ENV === 'test'
    ? (req, res, next) => next() // deterministic tests
    : rateLimit({
        windowMs: 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message: 'Too many attempts. Please wait a moment.', errorCode: 'RATE_LIMITED' },
      });

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.get('/me', requireAuth, authController.me);

module.exports = router;
