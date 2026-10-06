'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const isTest = process.env.NODE_ENV === 'test';
const limiter = (windowMs, max, message) =>
  isTest
    ? (req, res, next) => next() // deterministic tests
    : rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message, errorCode: 'RATE_LIMITED' },
      });

const authLimiter = limiter(60 * 1000, 20, 'Too many attempts. Please wait a moment.');
// OTP verification + resend get their own tighter limiter (brute-force dam).
const otpLimiter = limiter(60 * 1000, 12, 'Too many verification attempts. Please wait a moment.');

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/verify-otp', otpLimiter, authController.verifyOtp);
router.post('/resend-otp', otpLimiter, authController.resendOtp);
router.get('/me', requireAuth, authController.me);

module.exports = router;
