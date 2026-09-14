'use strict';

const { app, request, auth, registerUser } = require('./setup');

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

  test('logs in with valid credentials', async () => {
    const { email, password } = await registerUser();
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
  });

  test('rejects invalid password', async () => {
    const { email } = await registerUser();
    const res = await request(app).post('/api/auth/login').send({ email, password: 'WrongPass@1' });
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_CREDENTIALS');
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
    const res = await request(app).get('/api/registrar/dashboard').set(auth(token));
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });
});
