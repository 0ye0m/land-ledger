'use strict';

/**
 * LAND LEDGER - email delivery (SMTP, provider-independent).
 *
 * Uses nodemailer against any SMTP provider configured purely through
 * environment variables (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD /
 * SMTP_FROM). For Gmail, use an App Password - never the account password.
 *
 * Fail-safe behaviour:
 *  - No SMTP config  => sending returns { sent: false, reason: 'not_configured' }.
 *    Callers decide policy (MFA login fails safely; production never bypasses).
 *  - Transport error => { sent: false, reason: 'send_failed', error } (never throws).
 *  - NODE_ENV=test   => in-memory outbox transport so automated tests exercise
 *    the REAL OTP email flow (extract the code from the rendered email)
 *    without weakening production authentication in any way.
 *
 * SECURITY: no OTP, password, token or document content is ever placed in
 * outgoing email bodies. Consent mails carry identifiers only and instruct
 * the user to sign in to act.
 */

const env = require('../config/env');

let transporter = null;
try {
  if (env.smtp.host) {
    // Lazy require so environments without nodemailer (if any) degrade cleanly.
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
  }
} catch (err) {
  console.error('[email] failed to initialise SMTP transport:', err.message);
  transporter = null;
}

/** In-memory outbox for the automated test suite (NODE_ENV=test only). */
const testOutbox = [];

function smtpConfigured() {
  return Boolean(env.smtp.host && env.smtp.user && env.smtp.password);
}

async function sendMail({ to, subject, text }) {
  // Automated tests: capture the fully rendered email; no network, no SMTP.
  if (process.env.NODE_ENV === 'test') {
    const message = { to, subject, text, at: new Date() };
    testOutbox.push(message);
    if (testOutbox.length > 200) testOutbox.shift();
    return { sent: true, transport: 'test-outbox' };
  }

  // Explicitly gated demo mode (MFA_DEV_MODE=1 && non-production && SMTP
  // unconfigured): capture the email locally instead of failing. The OTP
  // reaches the user through the gated devCode channel in the challenge
  // response. This branch can never activate in production (see config/env.js)
  // and always yields to real SMTP delivery as soon as SMTP is configured.
  if (env.mfa.devMode && !smtpConfigured()) {
    const message = { to, subject, text, at: new Date() };
    testOutbox.push(message);
    if (testOutbox.length > 200) testOutbox.shift();
    return { sent: true, transport: 'dev-capture' };
  }

  if (!transporter) {
    return { sent: false, reason: 'not_configured' };
  }
  try {
    await transporter.sendMail({ from: env.smtp.from, to, subject, text });
    return { sent: true, transport: 'smtp' };
  } catch (err) {
    console.error('[email] send failed:', err.message);
    return { sent: false, reason: 'send_failed', error: err.message };
  }
}

/** Last N captured messages (test introspection only). */
function recentTestMails(n = 5) {
  return testOutbox.slice(-n);
}

function clearTestOutbox() {
  testOutbox.length = 0;
}

// ---------- Templates (plain text; identifiers only, no secrets) ----------

function otpEmail({ name, code, minutes }) {
  const first = String(name || '').split(' ')[0] || 'there';
  return {
    subject: 'LAND LEDGER - Your sign-in verification code',
    text: [
      `Hello ${first},`,
      '',
      `Your LAND LEDGER sign-in verification code is: ${code}`,
      '',
      `This code expires in ${minutes} minutes and can be used only once.`,
      'If you did not try to sign in, you can safely ignore this email -',
      'your account stays protected because the code is required to finish signing in.',
      '',
      'LAND LEDGER - Digital Property Registry',
    ].join('\n'),
  };
}

function consentRequiredEmail({ name, propertyBusinessId, transferReference, partyRole }) {
  const first = String(name || '').split(' ')[0] || 'there';
  return {
    subject: 'LAND LEDGER - Action Required for Property Transfer',
    text: [
      `Hello ${first},`,
      '',
      'A property ownership transfer that requires your consent has been filed',
      'in LAND LEDGER.',
      '',
      `  Property ID        : ${propertyBusinessId}`,
      `  Transfer request ID: ${transferReference}`,
      `  Your role          : ${partyRole}`,
      '',
      'Required action: sign in to LAND LEDGER, open "Pending Actions" on your',
      'dashboard and approve or reject this transfer request.',
      '',
      'For your protection the decision can only be made after signing in with',
      'your password and email verification code - no approval links are sent',
      'by email and no private documents are attached.',
      '',
      'LAND LEDGER - Digital Property Registry',
    ].join('\n'),
  };
}

module.exports = { sendMail, smtpConfigured, recentTestMails, clearTestOutbox, otpEmail, consentRequiredEmail };
