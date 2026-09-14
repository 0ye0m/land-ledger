'use strict';

const fs = require('fs');
const path = require('path');
const { app, request, auth, registerUser, createProperty, uploadDocument } = require('./setup');
const { uploadRoot } = require('../src/middleware/upload');

describe('DOCUMENTS', () => {
  test('upload computes SHA-256 and metadata', async () => {
    const { token } = await registerUser();
    const prop = await createProperty(token);
    const propertyId = prop.body.data.property.id;

    const res = await uploadDocument(token, propertyId, { fileName: 'my-deed.pdf', content: '%PDF-1.4 deed content v1' });
    expect(res.status).toBe(201);
    expect(res.body.data.document.sha256_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.data.document.file_name).toBe('my-deed.pdf');
    expect(res.body.data.document.verification_status).toBe('PENDING');
  });

  test('rejects disallowed extension and oversize', async () => {
    const { token } = await registerUser();
    const prop = await createProperty(token);
    const propertyId = prop.body.data.property.id;

    const badExt = await request(app)
      .post('/api/documents/upload')
      .set(auth(token))
      .field('propertyId', propertyId)
      .attach('file', Buffer.from('malicious'), { filename: 'evil.exe', contentType: 'application/octet-stream' });
    expect(badExt.status).toBe(400);
    expect(badExt.body.errorCode).toBe('INVALID_FILE_TYPE');
  });

  test('valid hash check passes and tampering is detected', async () => {
    const { token, user } = await registerUser();
    const prop = await createProperty(token);
    const propertyId = prop.body.data.property.id;
    const content = `%PDF-1.4 integrity check ${Date.now()}`;

    const up = await uploadDocument(token, propertyId, { fileName: 'integrity.pdf', content });
    const doc = up.body.data.document;
    const absolute = path.join(uploadRoot, doc.storage_path);

    // 1. Integrity passes right after upload
    const okCheck = await request(app).post(`/api/documents/${doc.id}/verify-integrity`).set(auth(token));
    expect(okCheck.status).toBe(200);
    expect(okCheck.body.data.intact).toBe(true);

    // 2. Tamper with the stored bytes
    fs.writeFileSync(absolute, Buffer.from(`${content} TAMPERED`));
    const tampered = await request(app).post(`/api/documents/${doc.id}/verify-integrity`).set(auth(token));
    expect(tampered.status).toBe(200);
    expect(tampered.body.data.intact).toBe(false);
    expect(tampered.body.data.verificationStatus).toBe('TAMPERED');

    // 3. Status is persisted as TAMPERED
    const detail = await request(app).get(`/api/documents/${doc.id}`).set(auth(token));
    expect(detail.body.data.document.verification_status).toBe('TAMPERED');
  });

  test('registrar verifies document; citizen cannot', async () => {
    const { token } = await registerUser();
    const registrar = await registerUser({ role: 'registrar' });
    const prop = await createProperty(token);
    const up = await uploadDocument(token, prop.body.data.property.id, { content: `%PDF-1.4 verify ${Date.now()}` });
    const docId = up.body.data.document.id;

    const citizenTry = await request(app).post(`/api/documents/${docId}/verify`).set(auth(token)).send({ outcome: 'VERIFIED' });
    expect(citizenTry.status).toBe(403);

    const registrarOk = await request(app).post(`/api/documents/${docId}/verify`).set(auth(registrar.token)).send({ outcome: 'VERIFIED' });
    expect(registrarOk.status).toBe(200);
    expect(registrarOk.body.data.document.verification_status).toBe('VERIFIED');
    expect(registrarOk.body.data.document.verified_by).toBeTruthy();
  });

  test('authenticated download works', async () => {
    const { token } = await registerUser();
    const prop = await createProperty(token);
    const up = await uploadDocument(token, prop.body.data.property.id, { content: '%PDF-1.4 download me' });
    const res = await request(app).get(`/api/documents/${up.body.data.document.id}/download`).set(auth(token));
    expect(res.status).toBe(200);
    const body = res.text || (Buffer.isBuffer(res.body) ? res.body.toString() : '');
    expect(body.startsWith('%PDF-1.4')).toBe(true);
  });
});
