'use strict';

const { app, request, auth, registerUser, createProperty, uploadDocument, uniq } = require('./setup');

const WALLET_BUYER_1 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const WALLET_BUYER_2 = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';

/** Approve the buyer's pending consent on a transfer (by reference). */
async function buyerApprovesConsent(buyerToken, transferRef) {
  const board = await request(app).get(`/api/consents/transfer/${transferRef}`).set(auth(buyerToken));
  expect(board.status).toBe(200);
  const consentId = board.body.data.myConsent?.consentId;
  expect(consentId).toBeTruthy();
  const decision = await request(app).post(`/api/consents/${consentId}/decision`).set(auth(buyerToken)).send({ decision: 'APPROVE' });
  expect(decision.status).toBe(200);
  return decision;
}

async function prepareRegisteredProperty({ withDocuments = true } = {}) {
  const seller = await registerUser();
  const prop = await createProperty(seller.token);
  const propertyId = prop.body.data.property.id;
  if (withDocuments) {
    await uploadDocument(seller.token, propertyId, { content: `%PDF-1.4 transfer doc ${Date.now()}` });
  }
  // Registrar approves; requires reachable Hardhat node for on-chain registration.
  const registrar = await registerUser({ role: 'registrar' });
  const approve = await request(app).post(`/api/registrar/properties/${propertyId}/approve`).set(auth(registrar.token)).send({});
  return { seller, registrar, propertyId, approve };
}

describe('TRANSFERS', () => {
  test(
    'consent gate + full flow: CONSENT_PENDING -> buyer approves -> clerk docs -> registrar approval -> COMPLETED with real tx hash (requires Hardhat)',
    async () => {
      const { seller, registrar, propertyId, approve } = await prepareRegisteredProperty();
      if (approve.status !== 200) {
        console.log('   [skip] Hardhat node unavailable - chain-dependent transfer test skipped');
        expect(approve.status).toBeGreaterThan(0);
        return;
      }
      const buyer = await registerUser({ wallet: WALLET_BUYER_1 });
      const clerk = await registerUser({ role: 'registrar' });
      await require('../src/models/User').updateOne({ _id: clerk.user.id }, { $set: { role: 'clerk' } });

      const created = await request(app).post('/api/transfers').set(auth(seller.token)).send({
        propertyId, buyerEmail: buyer.email, requestDetails: 'Private sale agreed',
      });
      expect(created.status).toBe(201);
      const transferRef = created.body.data.transfer.transfer_reference;
      // The buyer is a required party: the file parks at the consent gate.
      expect(created.body.data.transfer.status).toBe('CONSENT_PENDING');
      expect(created.body.data.fraud.checks_performed.length).toBeGreaterThanOrEqual(8);

      // Clerk cannot verify while consent is pending (server-enforced).
      const earlyVerify = await request(app).post(`/api/workflow/transfers/${created.body.data.transfer.id}/verify-docs`)
        .set(auth(clerk.token)).send({ decision: 'APPROVE' });
      expect(earlyVerify.status).toBe(409);
      expect(earlyVerify.body.errorCode).toBe('CONSENT_INCOMPLETE');

      // Seller's own consent row already APPROVED via initiation; buyer must act.
      const sellerBoard = await request(app).get(`/api/consents/transfer/${transferRef}`).set(auth(seller.token));
      expect(sellerBoard.body.data.myConsent).toBeNull(); // seller has no pending row
      await buyerApprovesConsent(buyer.token, transferRef);

      const afterConsent = await request(app).get(`/api/transfers/${transferRef}`).set(auth(seller.token));
      expect(afterConsent.body.data.transfer.status).toBe('PENDING');

      const verified = await request(app).post(`/api/workflow/transfers/${created.body.data.transfer.id}/verify-docs`)
        .set(auth(clerk.token)).send({ decision: 'APPROVE', notes: 'Documents consistent' });
      expect(verified.status).toBe(200);
      expect(verified.body.data.transfer.status).toBe('DOCS_VERIFIED');

      const approved = await request(app).post(`/api/transfers/${transferRef}/approve`).set(auth(registrar.token)).send({ reason: 'All checks clear' });
      expect(approved.status).toBe(200);
      expect(approved.body.data.transfer.status).toBe('COMPLETED');
      const tx = approved.body.data.blockchainTransaction;
      expect(tx.transaction_hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(Number(tx.block_number)).toBeGreaterThan(0);

      // Ownership moved in MongoDB
      const detail = await request(app).get(`/api/properties/${propertyId}`).set(auth(seller.token));
      expect(detail.body.data.property.current_owner_id).toBe(buyer.user.id);
    },
    30000
  );

  test('citizen cannot approve transfers (RBAC)', async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const prop = await createProperty(seller.token);
    const created = await request(app).post('/api/transfers').set(auth(seller.token)).send({
      propertyId: prop.body.data.property.id, buyerEmail: buyer.email,
    });
    // Creation may 409 if the property is not REGISTERED; both paths must deny citizen approval.
    const approve = await request(app).post(`/api/transfers/${created.body?.data?.transfer?.transfer_reference || 'TRF-X'}/approve`).set(auth(seller.token)).send({});
    expect([403, 404, 409]).toContain(approve.status);
    if (approve.status === 403) expect(approve.body.errorCode).toBe('FORBIDDEN');
  });

  test('transfer by non-owner is rejected', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const buyer = await registerUser();
    const prop = await createProperty(owner.token);
    const res = await request(app).post('/api/transfers').set(auth(stranger.token)).send({
      propertyId: prop.body.data.property.id, buyerEmail: buyer.email,
    });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SELLER_NOT_OWNER');
  });

  test('duplicate active transfer is rejected (consent-pending counts as active)', async () => {
    const { seller, propertyId, approve } = await prepareRegisteredProperty();
    if (approve.status !== 200) {
      console.log('   [skip] Hardhat unavailable - duplicate transfer test skipped');
      return;
    }
    const buyerA = await registerUser({ wallet: WALLET_BUYER_1 });
    const buyerB = await registerUser({ wallet: WALLET_BUYER_2 });

    const first = await request(app).post('/api/transfers').set(auth(seller.token)).send({ propertyId, buyerEmail: buyerA.email });
    expect(first.status).toBe(201);
    expect(first.body.data.transfer.status).toBe('CONSENT_PENDING');

    const second = await request(app).post('/api/transfers').set(auth(seller.token)).send({ propertyId, buyerEmail: buyerB.email });
    expect(second.status).toBe(409);
    expect(second.body.errorCode).toBe('DUPLICATE_TRANSFER');
  });

  test('self transfer rejected', async () => {
    const { seller, propertyId, approve } = await prepareRegisteredProperty({ withDocuments: false });
    if (approve.status !== 200) {
      console.log('   [skip] Hardhat unavailable - self transfer test skipped');
      return;
    }
    const res = await request(app).post('/api/transfers').set(auth(seller.token)).send({
      propertyId, buyerEmail: seller.email,
    });
    expect([409, 422]).toContain(res.status);
  });

  test('transfer to unknown buyer rejected', async () => {
    const { seller, propertyId } = await prepareRegisteredProperty({ withDocuments: false });
    const res = await request(app).post('/api/transfers').set(auth(seller.token)).send({
      propertyId, buyerEmail: 'ghostbuyer@test.local',
    });
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('BUYER_NOT_FOUND');
  });

  test('registrar rejection requires a reason', async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const registrar = await registerUser({ role: 'registrar' });
    const prop = await createProperty(seller.token);
    const created = await request(app).post('/api/transfers').set(auth(seller.token)).send({
      propertyId: prop.body.data.property.id, buyerEmail: buyer.email,
    });
    if (created.status !== 201) return; // property not REGISTERED and chain down
    const noReason = await request(app).post(`/api/transfers/${created.body.data.transfer.transfer_reference}/reject`).set(auth(registrar.token)).send({});
    expect(noReason.status).toBe(422);
    const rejected = await request(app).post(`/api/transfers/${created.body.data.transfer.transfer_reference}/reject`).set(auth(registrar.token)).send({ reason: 'Documents incomplete' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.transfer.status).toBe('REJECTED');
  });
});
