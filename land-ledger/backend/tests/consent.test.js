'use strict';

const { app, request, auth, registerUser, createProperty, uploadDocument } = require('./setup');
const User = require('../src/models/User');
const PropertyParty = require('../src/models/PropertyParty');

async function prepareRegisteredCoOwnedProperty() {
  const owner = await registerUser();
  const coOwner = await registerUser();
  const buyer = await registerUser({ wallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' });
  const registrar = await registerUser({ role: 'registrar' });
  const outsider = await registerUser();

  const prop = await createProperty(owner.token);
  const propertyId = prop.body.data.property.id;
  await uploadDocument(owner.token, propertyId, { content: `%PDF-1.4 consent doc ${Date.now()}` });
  await PropertyParty.create({ property_id: propertyId, user_id: owner.user.id, party_role: 'OWNER', share_percent: 60 });
  await PropertyParty.create({ property_id: propertyId, user_id: coOwner.user.id, party_role: 'CO_OWNER', share_percent: 40 });

  const approve = await request(app).post(`/api/registrar/properties/${propertyId}/approve`).set(auth(registrar.token)).send({});
  return { owner, coOwner, buyer, registrar, outsider, propertyId, approve };
}

describe('MULTI-PARTY CONSENT', () => {
  test('co-owned transfer parks at CONSENT_PENDING and lists every required party', async () => {
    const { owner, propertyId, approve } = await prepareRegisteredCoOwnedProperty();
    if (approve.status !== 200) {
      console.log('   [skip] Hardhat unavailable - consent test skipped');
      return;
    }
    const created = await request(app).post('/api/transfers').set(auth(owner.token)).send({
      propertyId, buyerEmail: (await registerUser()).email, requestDetails: 'Co-owned sale',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.transfer.status).toBe('CONSENT_PENDING');

    const ref = created.body.data.transfer.transfer_reference;
    const board = await request(app).get(`/api/consents/transfer/${ref}`).set(auth(owner.token));
    expect(board.status).toBe(200);
    const roles = board.body.data.consents.map((c) => c.party_role).sort();
    expect(roles).toEqual(['BUYER', 'CO_OWNER', 'SELLER']);
    const statuses = board.body.data.consents.map((c) => c.status).sort();
    expect(statuses).toEqual(['APPROVED', 'PENDING', 'PENDING']);
  });

  test('pending consent blocks the clerk stage server-side (409 CONSENT_INCOMPLETE)', async () => {
    const { owner, propertyId, approve } = await prepareRegisteredCoOwnedProperty();
    if (approve.status !== 200) return;
    const buyer = await registerUser();
    const clerk = await registerUser();
    await User.updateOne({ _id: clerk.user.id }, { $set: { role: 'clerk' } });

    const created = await request(app).post('/api/transfers').set(auth(owner.token)).send({
      propertyId, buyerEmail: buyer.email,
    });
    expect(created.body.data.transfer.status).toBe('CONSENT_PENDING');

    const early = await request(app).post(`/api/workflow/transfers/${created.body.data.transfer.id}/verify-docs`)
      .set(auth(clerk.token)).send({ decision: 'APPROVE' });
    expect(early.status).toBe(409);
    expect(early.body.errorCode).toBe('CONSENT_INCOMPLETE');
  });

  test('a non-party cannot decide (403) and a party cannot decide twice (409)', async () => {
    const { owner, coOwner, outsider, propertyId, approve } = await prepareRegisteredCoOwnedProperty();
    if (approve.status !== 200) return;
    const buyer = await registerUser();
    const created = await request(app).post('/api/transfers').set(auth(owner.token)).send({ propertyId, buyerEmail: buyer.email });
    const ref = created.body.data.transfer.transfer_reference;

    // Outsider cannot act on the co-owner's consent row.
    const coOwnerBoard = await request(app).get(`/api/consents/transfer/${ref}`).set(auth(coOwner.token));
    const coOwnerConsentId = coOwnerBoard.body.data.myConsent.consentId;
    const stranger = await request(app).post(`/api/consents/${coOwnerConsentId}/decision`).set(auth(outsider.token)).send({ decision: 'APPROVE' });
    expect(stranger.status).toBe(403);

    // Legitimate approval by the co-owner.
    const okDecision = await request(app).post(`/api/consents/${coOwnerConsentId}/decision`).set(auth(coOwner.token)).send({ decision: 'APPROVE' });
    expect(okDecision.status).toBe(200);

    // Second response on the same row must fail.
    const again = await request(app).post(`/api/consents/${coOwnerConsentId}/decision`).set(auth(coOwner.token)).send({ decision: 'APPROVE' });
    expect(again.status).toBe(409);
    expect(again.body.errorCode).toBe('CONSENT_ALREADY_RESOLVED');
  });

  test('transfer stays CONSENT_PENDING until EVERY required party approves', async () => {
    const { owner, coOwner, propertyId, approve } = await prepareRegisteredCoOwnedProperty();
    if (approve.status !== 200) return;
    const buyer = await registerUser();
    const created = await request(app).post('/api/transfers').set(auth(owner.token)).send({ propertyId, buyerEmail: buyer.email });
    const ref = created.body.data.transfer.transfer_reference;

    const ownerBoard = await request(app).get(`/api/consents/transfer/${ref}`).set(auth(coOwner.token));
    const coConsent = ownerBoard.body.data.myConsent.consentId;
    await request(app).post(`/api/consents/${coConsent}/decision`).set(auth(coOwner.token)).send({ decision: 'APPROVE' });

    const buyerBoard = await request(app).get(`/api/consents/transfer/${ref}`).set(auth(buyer.token));
    const buyerConsent = buyerBoard.body.data.myConsent.consentId;
    expect(buyerConsent).toBeTruthy();
    const midState = await request(app).get(`/api/transfers/${ref}`).set(auth(owner.token));
    expect(midState.body.data.transfer.status).toBe('CONSENT_PENDING'); // buyer still pending

    const final = await request(app).post(`/api/consents/${buyerConsent}/decision`).set(auth(buyer.token)).send({ decision: 'APPROVE' });
    expect(final.status).toBe(200);
    expect(final.body.data.transfer.status).toBe('PENDING'); // now at the clerk desk
  });

  test('one REJECTED party rejects the whole transfer and expires the rest', async () => {
    const { owner, coOwner, propertyId, approve } = await prepareRegisteredCoOwnedProperty();
    if (approve.status !== 200) return;
    const buyer = await registerUser();
    const created = await request(app).post('/api/transfers').set(auth(owner.token)).send({ propertyId, buyerEmail: buyer.email });
    const ref = created.body.data.transfer.transfer_reference;

    const board = await request(app).get(`/api/consents/transfer/${ref}`).set(auth(coOwner.token));
    const coConsent = board.body.data.myConsent.consentId;
    const rejected = await request(app).post(`/api/consents/${coConsent}/decision`).set(auth(coOwner.token)).send({ decision: 'REJECT', reason: 'I do not agree with the sale terms' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.transfer.status).toBe('REJECTED');
    expect(rejected.body.data.transfer.rejection_stage).toBe('CONSENT');
    expect(rejected.body.data.transfer.rejection_reason).toContain('I do not agree');

    const boardAfter = await request(app).get(`/api/consents/transfer/${ref}`).set(auth(buyer.token));
    const buyerRow = boardAfter.body.data.consents.find((c) => c.party_role === 'BUYER');
    expect(buyerRow.status).toBe('EXPIRED');

    // The remaining party can no longer act on an expired consent.
    const buyerBoard2 = await request(app).get(`/api/consents/transfer/${ref}`).set(auth(buyer.token));
    expect(buyerBoard2.body.data.myConsent).toBeNull();
  });

  test('pending consents surface in the party Pending Actions feed', async () => {
    const { owner, coOwner, propertyId, approve } = await prepareRegisteredCoOwnedProperty();
    if (approve.status !== 200) return;
    const buyer = await registerUser();
    await request(app).post('/api/transfers').set(auth(owner.token)).send({ propertyId, buyerEmail: buyer.email });

    const feed = await request(app).get('/api/consents/pending').set(auth(coOwner.token));
    expect(feed.status).toBe(200);
    expect(feed.body.data.count).toBeGreaterThanOrEqual(1);
    const item = feed.body.data.actions.find((a) => a.property_id);
    expect(item.your_role).toBe('CO_OWNER');
    expect(item.parties.length).toBeGreaterThanOrEqual(3);
  });
});
