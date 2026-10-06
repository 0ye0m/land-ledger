'use strict';

const { app, request, auth, registerUser, mfaLogin, latestOtpFor, emailService } = require('./setup');

describe('AUTH', () => {
  test('registers a citizen', async () => {
    const email = `citizen-${Date.now()}@test.local`;
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Register Test', email, password: 'Testing@123', district: 'Pune', state: 'Maharashtra',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('citizen');
    expect(res.body.data.token).toBeTruthy();
  });

  test('rejects duplicate registration', async () => {
    const { email } = await registerUser();
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Dup Test', email, password: 'Testing@123', district: 'Pune', state: 'Maharashtra',
    });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('EMAIL_TAKEN');
  });

  test('rejects weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName: 'Weak PW', email: `weak-${Date.now()}@test.local`, password: 'short', district: 'Pune', state: 'Maharashtra',
    });
    expect(res.status).toBe(422);
    expect(res.body.details.password).toBeTruthy();
  });

  test('password step alone does NOT issue a JWT (MFA required)', async () => {
    const { email, password } = await registerUser();
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.data.mfaRequired).toBe(true);
    expect(res.body.data.challengeId).toBeTruthy();
    // No JWT, no user object, no OTP may ever appear in this response.
    expect(res.body.data.token).toEqual(undefined);
    expect(res.body.data.user).toEqual(undefined);
    expect(JSON.stringify(res.body)).not.toMatch(/"otp"|"devCode"/);
  });

  test('full MFA login returns the authenticated session', async () => {
    const { email, password } = await registerUser();
    const data = await mfaLogin(email, password);
    expect(data.token).toBeTruthy();
    expect(data.user.email).toBe(email);
  });

  test('rejects invalid password', async () => {
    const { email } = await registerUser();
    const res = await request(app).post('/api/auth/login').send({ email, password: 'WrongPass@1' });
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  test('rejects a wrong OTP with a generic message', async () => {
    const { email, password } = await registerUser();
    const start = await request(app).post('/api/auth/login').send({ email, password });
    const challengeId = start.body.data.challengeId;
    const res = await request(app).post('/api/auth/verify-otp').send({ challengeId, otp: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('MFA_INVALID');
    expect(res.body.message).toBe('Invalid or expired verification code.');
  });

  test('OTP is single-use (replay rejected)', async () => {
    const { email, password } = await registerUser();
    const start = await request(app).post('/api/auth/login').send({ email, password });
    const challengeId = start.body.data.challengeId;
    const otp = latestOtpFor(email);
    const first = await request(app).post('/api/auth/verify-otp').send({ challengeId, otp });
    expect(first.status).toBe(200);
    const replay = await request(app).post('/api/auth/verify-otp').send({ challengeId, otp });
    expect(replay.status).toBe(401);
    expect(replay.body.errorCode).toBe('MFA_INVALID');
  });

  test('a new login supersedes the previous challenge code', async () => {
    const { email, password } = await registerUser();
    const first = await request(app).post('/api/auth/login').send({ email, password });
    const oldChallenge = first.body.data.challengeId;
    const oldOtp = latestOtpFor(email);
    const second = await request(app).post('/api/auth/login').send({ email, password });
    const newOtp = latestOtpFor(email);
    expect(second.body.data.challengeId).not.toBe(oldChallenge);
    // The old code no longer works even on its own challenge...
    const oldTry = await request(app).post('/api/auth/verify-otp').send({ challengeId: oldChallenge, otp: oldOtp });
    expect(oldTry.status).toBe(401);
    // ...and the new code works.
    const ok = await request(app).post('/api/auth/verify-otp').send({ challengeId: second.body.data.challengeId, otp: newOtp });
    expect(ok.status).toBe(200);
  });

  test('too many wrong attempts lock the challenge', async () => {
    const { email, password } = await registerUser();
    const start = await request(app).post('/api/auth/login').send({ email, password });
    const challengeId = start.body.data.challengeId;
    let last;
    for (let i = 0; i < 5; i += 1) {
      last = await request(app).post('/api/auth/verify-otp').send({ challengeId, otp: '000000' });
    }
    expect(last.status).toBe(401);
    expect(last.body.errorCode).toBe('MFA_ATTEMPTS_EXCEEDED');
    // Even the correct code is dead after the lockout.
    const otp = latestOtpFor(email);
    const dead = await request(app).post('/api/auth/verify-otp').send({ challengeId, otp });
    expect(dead.status).toBe(401);
    expect(dead.body.errorCode).toBe('MFA_INVALID');
  });

  test('challenge rate limiting blocks OTP spam (per hour)', async () => {
    const { email, password } = await registerUser();
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await request(app).post('/api/auth/login').send({ email, password });
      if (last.status === 429) break;
    }
    expect(last.status).toBe(429);
    expect(last.body.errorCode).toBe('MFA_RATE_LIMITED');
  });

  test('resend-otp enforces cooldown and issues a fresh working code', async () => {
    const { email, password } = await registerUser();
    const start = await request(app).post('/api/auth/login').send({ email, password });
    const challengeId = start.body.data.challengeId;
    const oldOtp = latestOtpFor(email);
    const resend = await request(app).post('/api/auth/resend-otp').send({ challengeId });
    // The default cooldown is 45s -> the immediate resend must be cooled down.
    expect(resend.status).toBe(429);
    expect(resend.body.errorCode).toBe('MFA_RESEND_COOLDOWN');
    // Simulate cooldown elapse directly on the challenge document.
    const mongoose = require('mongoose');
    await mongoose.connection.collection('mfa_challenges').updateOne(
      { _id: challengeId },
      { $set: { last_sent_at: new Date(Date.now() - 120000) } }
    );
    const resend2 = await request(app).post('/api/auth/resend-otp').send({ challengeId });
    expect(resend2.status).toBe(200);
    const newOtp = latestOtpFor(email);
    expect(newOtp).not.toBe(oldOtp);
    // Old code dead, new code alive.
    const oldTry = await request(app).post('/api/auth/verify-otp').send({ challengeId, otp: oldOtp });
    expect(oldTry.status).toBe(401);
    const good = await request(app).post('/api/auth/verify-otp').send({ challengeId, otp: newOtp });
    expect(good.status).toBe(200);
  });

  test('verify-otp rejects unknown challenges without leaking state', async () => {
    const res = await request(app).post('/api/auth/verify-otp').send({ challengeId: 'not-a-real-challenge', otp: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired verification code.');
  });

  test('protected route requires token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('/api/auth/me returns current user', async () => {
    const { token, user } = await registerUser();
    const res = await request(app).get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
  });

  test('citizen cannot access registrar endpoints (RBAC)', async () => {
    const { token } = await registerUser();
    const res = await request(app).get('/api/registrar/pending-properties').set(auth(token));
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });

  test('registration outside the demo allowlist is rejected in strict mode', async () => {
    // Flip the harness escape hatch off for this one request.
    process.env.AUTH_ALLOWLIST = 'on';
    try {
      const res = await request(app).post('/api/auth/register').send({
        fullName: 'Outside Demo', email: `outsider-${Date.now()}@test.local`, password: 'Testing@123', district: 'Pune', state: 'Maharashtra',
      });
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('EMAIL_NOT_ALLOWLISTED');
    } finally {
      process.env.AUTH_ALLOWLIST = 'off';
    }
  });
});
