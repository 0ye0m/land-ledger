'use strict';

const { app, request, auth, registerUser, createProperty } = require('./setup');

describe('PROPERTIES', () => {
  test('citizen creates a registration request (SUBMITTED)', async () => {
    const { token } = await registerUser();
    const res = await createProperty(token);
    expect(res.status).toBe(201);
    expect(res.body.data.property.status).toBe('SUBMITTED');
    expect(res.body.data.property.property_id).toMatch(/^PROP-\d{4}-\d{4}$/);
  });

  test('rejects invalid property payloads', async () => {
    const { token } = await registerUser();
    const res = await createProperty(token, { title: 'x', areaValue: -5, propertyType: 'SPACESHIP' });
    expect(res.status).toBe(422);
    expect(res.body.details.title).toBeTruthy();
    expect(res.body.details.areaValue).toBeTruthy();
    expect(res.body.details.propertyType).toBeTruthy();
  });

  test('detail retrieval + search work', async () => {
    const { token } = await registerUser();
    const created = await createProperty(token, { title: `Findable parcel ${Date.now()}` });
    const id = created.body.data.property.property_id;

    const detail = await request(app).get(`/api/properties/${id}`).set(auth(token));
    expect(detail.status).toBe(200);
    expect(detail.body.data.property.property_id).toBe(id);

    const search = await request(app).get(`/api/properties/search?keyword=${encodeURIComponent('Findable parcel')}`).set(auth(token));
    expect(search.status).toBe(200);
    expect(search.body.data.total).toBeGreaterThanOrEqual(1);
  });

  test('ownership is protected: another citizen cannot open a pending record', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const created = await createProperty(a.token);
    const res = await request(app).get(`/api/properties/${created.body.data.property.property_id}`).set(auth(b.token));
    expect(res.status).toBe(403);
  });

  test('duplicate wallet format validated', async () => {
    const { token } = await registerUser();
    const res = await createProperty(token, { ownerWallet: 'not-a-wallet' });
    expect(res.status).toBe(422);
    expect(res.body.details.ownerWallet).toBeTruthy();
  });
});
