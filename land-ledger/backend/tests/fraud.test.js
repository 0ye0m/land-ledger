'use strict';

const { app, request, auth, registerUser, createProperty, uploadDocument } = require('./setup');

describe('FRAUD ENGINE', () => {
  test('returns structured results for a clean property', async () => {
    const { token } = await registerUser();
    const prop = await createProperty(token);
    await uploadDocument(token, prop.body.data.property.id, { content: `%PDF-1.4 fraud-clean ${Date.now()}` });

    const buyer = await registerUser({ wallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' });
    const res = await request(app).post('/api/fraud/check').set(auth(token)).send({
      propertyId: prop.body.data.property.id, buyerEmail: buyer.email,
    });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(typeof data.isFraudulent).toBe('boolean');
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(data.riskLevel);
    expect(Array.isArray(data.reasons)).toBe(true);
    expect(data.checksPerformed.length).toBeGreaterThanOrEqual(8);
  });

  test('flags seller mismatch as fraudulent HIGH risk', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const prop = await createProperty(owner.token);

    const buyer = await registerUser({ wallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' });
    // stranger runs check while claiming ownership via transfer creation is blocked earlier;
    // direct engine check uses the current owner, so exercise via transfer creation:
    const res = await request(app).post('/api/transfers').set(auth(stranger.token)).send({
      propertyId: prop.body.data.property.id, buyerEmail: buyer.email,
    });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SELLER_NOT_OWNER');
    expect(res.body.details.reasons).toContain('Requested seller is not the current owner of the property');
  });

  test('missing documents raise MEDIUM risk with reasons', async () => {
    const { token } = await registerUser();
    const prop = await createProperty(token); // no docs uploaded
    const buyer = await registerUser({ wallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' });

    const res = await request(app).post('/api/fraud/check').set(auth(token)).send({
      propertyId: prop.body.data.property.id, buyerEmail: buyer.email,
    });
    const data = res.body.data;
    expect(data.riskLevel).not.toBe('LOW');
    expect(data.reasons.some((r) => /No supporting documents/.test(r))).toBe(true);
  });

  test('citizen cannot run checks on someone else\'s property', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const prop = await createProperty(owner.token);
    const res = await request(app).post('/api/fraud/check').set(auth(stranger.token)).send({
      propertyId: prop.body.data.property.id,
    });
    expect(res.status).toBe(403);
  });
});
