#!/usr/bin/env node
'use strict';
/* Direct SMTP proof: verify Gmail credentials + send a test mail.
 * Loads backend/.env the same way the app does (dotenv, no override).
 * Prints only PASS/FAIL + error messages - NEVER the password.
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', 'land-ledger', 'backend');
// Minimal .env loader (no dotenv dependency): does NOT override existing vars.
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

async function main() {
  const nodemailer = require(path.join(ROOT, 'node_modules', 'nodemailer'));
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    console.error('FAIL: SMTP_HOST/SMTP_USER/SMTP_PASSWORD not all set in backend/.env');
    process.exit(1);
  }
  console.log(`[smtp] host=${host}:${port} secure=${port === 465} user=${user}`);
  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 20000,
  });
  try {
    await transporter.verify();
    console.log('PASS: SMTP authentication + connection verified');
  } catch (err) {
    console.error('FAIL: SMTP verify error:', err.message);
    process.exit(2);
  }
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || user,
    to: user, // send to the sender's own inbox for immediate visual proof
    subject: 'LAND LEDGER - SMTP test (you can delete this)',
    text: 'Your LAND LEDGER email delivery is now LIVE. Real OTP codes for login will arrive from this address.\n\n- LAND LEDGER',
  });
  console.log(`PASS: test email accepted by Gmail (messageId=${info.messageId})`);
  console.log(`[smtp] check the inbox of ${user} for the test mail.`);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(3); });
