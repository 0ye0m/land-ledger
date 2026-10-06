#!/usr/bin/env node
/* LAND LEDGER - multi-role workflow E2E test (against a running API).
 * Exercises: email-OTP MFA sign-in, the 5-role pipeline, the multi-party
 * consent gate, stage guards, on-chain registration and settlement. */
'use strict';

const API = process.env.API || 'http://127.0.0.1:3000';
let passed = 0, failed = 0;

function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${extra}`); }
}

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}/api${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

/**
 * Two-factor login: password step returns an MFA challenge (never a token);
 * in the sandbox demo the gated devCode field carries the OTP; verify issues
 * the JWT. This is exactly the flow the frontend performs.
 */
async function login(email, password) {
  const r = await req('POST', '/auth/login', { body: { email, password } });
  const d = r.json?.data || {};
  check(`login step1 (MFA challenge) ${email}`, r.status === 200 && d.mfaRequired === true && !!d.challengeId && !d.token, JSON.stringify(r.json).slice(0, 140));
  const verify = await req('POST', '/auth/verify-otp', { body: { challengeId: d.challengeId, otp: d.devCode } });
  check(`login step2 (OTP verify) ${email}`, verify.status === 200 && !!verify.json?.data?.token, JSON.stringify(verify.json).slice(0, 140));
  return verify.json.data.token;
}

(async () => {
  // --- 0. password alone must NOT yield a token
  const pwdOnly = await req('POST', '/auth/login', { body: { email: 'mandwadeom2616@gmail.com', password: 'LandLedger@123' } });
  check('password alone does not issue JWT (MFA gate)', pwdOnly.status === 200 && pwdOnly.json?.data?.mfaRequired === true && !pwdOnly.json?.data?.token, JSON.stringify(pwdOnly.json).slice(0, 140));

  // --- 1. citizen files a new application -> SUBMITTED
  const om = await login('mandwadeom2616@gmail.com', 'LandLedger@123');
  const created = await req('POST', '/properties', {
    token: om,
    body: {
      title: 'Flat 21, Green Meadows', addressLine: 'Flat 21, Green Meadows Phase 2',
      city: 'Pune', district: 'Pune', state: 'Maharashtra',
      areaValue: 1120, areaUnit: 'sq ft', propertyType: 'RESIDENTIAL_BUILDING',
      description: 'E2E workflow test application.',
      ownerWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    },
  });
  check('citizen creates application (SUBMITTED)', created.status === 201 && created.json?.data?.property?.status === 'SUBMITTED',
    JSON.stringify(created.json).slice(0, 160));
  const newPropId = created.json?.data?.property?.id;
  const newPropRef = created.json?.data?.property?.property_id;

  // --- 2. role walls: citizen cannot survey
  const wall = await req('POST', `/workflow/properties/${newPropId}/survey`, { token: om, body: { decision: 'APPROVE' } });
  check('citizen blocked from survey action (403)', wall.status === 403, `got ${wall.status}`);

  // --- 3. surveyor: queue has the new file + seeded Flat 503, approves both
  const surveyor = await login('panpaliyaag@rknec.edu', 'LandLedger@123');
  const sq = await req('GET', '/workflow/queue', { token: surveyor });
  const surveyQueue = sq.json?.data?.properties?.map((p) => p.property_id) || [];
  check('surveyor queue contains new application', surveyQueue.includes(newPropRef), JSON.stringify(surveyQueue));
  check('surveyor queue contains seeded PROP-2026-0002', surveyQueue.includes('PROP-2026-0002'));
  const surv1 = await req('POST', `/workflow/properties/${newPropId}/survey`, { token: surveyor, body: { decision: 'APPROVE', notes: 'Boundaries verified on ground.' } });
  check('surveyor approves new application -> SURVEY_VERIFIED', surv1.status === 200 && surv1.json?.data?.property?.status === 'SURVEY_VERIFIED',
    JSON.stringify(surv1.json).slice(0, 160));
  const p2 = surveyQueue.includes('PROP-2026-0002') ? (sq.json.data.properties.find((p) => p.property_id === 'PROP-2026-0002') || {}).id : null;
  const surv2 = p2 ? await req('POST', `/workflow/properties/${p2}/survey`, { token: surveyor, body: { decision: 'APPROVE', notes: 'Structure matches records.' } }) : { status: 0 };
  check('surveyor clears seeded Flat 503 too', surv2.status === 200, `got ${surv2.status}`);

  // stage guard: re-surveying the same file must 409 now
  const reSurvey = await req('POST', `/workflow/properties/${newPropId}/survey`, { token: surveyor, body: { decision: 'APPROVE' } });
  check('re-survey blocked (409)', reSurvey.status === 409, `got ${reSurvey.status}`);

  // --- 4. clerk: docs for new property + House 4 + consent-cleared TRF-2026-0002
  const clerk = await login('tekdiwalnishant@gmail.com', 'LandLedger@123');
  const cq = await req('GET', '/workflow/queue', { token: clerk });
  const clerkProps = cq.json?.data?.properties?.map((p) => p.property_id) || [];
  const clerkTransfers = cq.json?.data?.transfers?.map((t) => t.transfer_reference) || [];
  check('clerk queue has property after survey', clerkProps.includes(newPropRef), JSON.stringify(clerkProps));
  check('clerk queue has seeded House 4 (PROP-2026-0006)', clerkProps.includes('PROP-2026-0006'));
  check('clerk queue holds consent-cleared TRF-2026-0002', clerkTransfers.includes('TRF-2026-0002'), JSON.stringify(clerkTransfers));
  check('clerk queue does NOT hold consent-pending TRF-2026-0001 (server-enforced gate)', !clerkTransfers.includes('TRF-2026-0001'), JSON.stringify(clerkTransfers));
  const v1 = await req('POST', `/workflow/properties/${newPropId}/verify-docs`, { token: clerk, body: { decision: 'APPROVE', notes: 'Deed and receipts in order.' } });
  check('clerk verifies new application -> DOCS_VERIFIED', v1.status === 200 && v1.json?.data?.property?.status === 'DOCS_VERIFIED',
    JSON.stringify(v1.json).slice(0, 160));
  const p6 = (cq.json.data.properties.find((p) => p.property_id === 'PROP-2026-0006') || {}).id;
  const v2 = p6 ? await req('POST', `/workflow/properties/${p6}/verify-docs`, { token: clerk, body: { decision: 'APPROVE', notes: 'Occupation cert current.' } }) : { status: 0 };
  check('clerk verifies seeded House 4', v2.status === 200, `got ${v2.status}`);
  const trf2 = (cq.json.data.transfers.find((t) => t.transfer_reference === 'TRF-2026-0002') || {}).id;
  const v3 = trf2 ? await req('POST', `/workflow/transfers/${trf2}/verify-docs`, { token: clerk, body: { decision: 'APPROVE', notes: 'Transfer papers complete.' } }) : { status: 0 };
  check('clerk verifies consent-cleared transfer -> DOCS_VERIFIED', v3.status === 200 && v3.json?.data?.transfer?.status === 'DOCS_VERIFIED', `got ${v3.status}`);

  // clerk is blocked on the consent-pending multi-party transfer
  const board0 = await req('GET', '/consents/transfer/TRF-2026-0001', { token: clerk });
  check('clerk can view the consent board (staff)', board0.status === 200, `got ${board0.status}`);
  const trf1Uuid = board0.json?.data?.transfer?.id;
  const earlyVerify = await req('POST', `/workflow/transfers/${trf1Uuid}/verify-docs`, { token: clerk, body: { decision: 'APPROVE' } });
  check('clerk blocked by consent gate on TRF-2026-0001 (409 CONSENT_INCOMPLETE)', earlyVerify.status === 409 && earlyVerify.json?.errorCode === 'CONSENT_INCOMPLETE', `got ${earlyVerify.status}`);

  // --- 5. multi-party consent on TRF-2026-0001 (co-owned parcel)
  const parties0 = board0.json?.data?.consents || [];
  check('consent board lists 3 required parties (seller+co-owner+buyer)', parties0.length === 3, JSON.stringify(parties0.map((c) => c.party_role)));
  check('seller consent recorded via initiation', (parties0.find((c) => c.party_role === 'SELLER') || {}).status === 'APPROVED');
  check('co-owner + buyer still PENDING', ['CO_OWNER', 'BUYER'].every((r) => (parties0.find((c) => c.party_role === r) || {}).status === 'PENDING'));

  // co-owner Shruti sees the item in her Pending Actions feed and approves
  const shruti = await login('shrutipethe111@gmail.com', 'LandLedger@123');
  const feed = await req('GET', '/consents/pending', { token: shruti });
  const feedItem = (feed.json?.data?.actions || []).find((a) => a.transfer_reference === 'TRF-2026-0001');
  check("co-owner's Pending Actions include TRF-2026-0001", Boolean(feedItem), JSON.stringify(feed.json).slice(0, 200));
  check('feed item names her as CO_OWNER', feedItem?.your_role === 'CO_OWNER');
  const shrutiConsentId = (parties0.find((c) => c.party_role === 'CO_OWNER') || {}).id;
  const c1 = await req('POST', `/consents/${shrutiConsentId}/decision`, { token: shruti, body: { decision: 'APPROVE' } });
  check('co-owner approves consent', c1.status === 200, JSON.stringify(c1.json).slice(0, 160));

  // mid-state: buyer still pending -> transfer must STAY CONSENT_PENDING
  const mid = await req('GET', '/transfers/TRF-2026-0001', { token: om });
  check('transfer stays CONSENT_PENDING while buyer pending (no bypass)', mid.json?.data?.transfer?.status === 'CONSENT_PENDING', `got ${mid.json?.data?.transfer?.status}`);

  // buyer Ganesh approves via his Pending Actions
  const ganesh = await login('alphadummy103@gmail.com', 'LandLedger@123');
  const gFeed = await req('GET', '/consents/pending', { token: ganesh });
  const gItem = (gFeed.json?.data?.actions || []).find((a) => a.transfer_reference === 'TRF-2026-0001');
  check("buyer's Pending Actions include TRF-2026-0001", Boolean(gItem) && gItem.your_role === 'BUYER');
  const buyerConsentId = (parties0.find((c) => c.party_role === 'BUYER') || {}).id;
  const c2 = await req('POST', `/consents/${buyerConsentId}/decision`, { token: ganesh, body: { decision: 'APPROVE' } });
  check('buyer approves consent -> transfer advances', c2.status === 200 && c2.json?.data?.transfer?.status === 'PENDING', JSON.stringify(c2.json).slice(0, 200));

  // double decision is refused
  const c3 = await req('POST', `/consents/${shrutiConsentId}/decision`, { token: shruti, body: { decision: 'APPROVE' } });
  check('double consent refused (409)', c3.status === 409, `got ${c3.status}`);
  // outsider cannot act on someone else's consent (403 - it is not theirs)
  const outsider = await req('POST', `/consents/${shrutiConsentId}/decision`, { token: om, body: { decision: 'APPROVE' } });
  check("another user cannot decide someone else's consent (403)", outsider.status === 403, `got ${outsider.status}`);

  // now the clerk CAN verify the consent-cleared transfer
  const v4 = await req('POST', `/workflow/transfers/${trf1Uuid}/verify-docs`, { token: clerk, body: { decision: 'APPROVE', notes: 'Consent board complete; papers in order.' } });
  check('clerk verifies consent-cleared TRF-2026-0001 -> DOCS_VERIFIED', v4.status === 200 && v4.json?.data?.transfer?.status === 'DOCS_VERIFIED', JSON.stringify(v4.json).slice(0, 160));

  // --- 6. registrar: approvals + on-chain settlement
  const registrar = await login('omdummy101@gmail.com', 'LandLedger@123');
  const rq = await req('GET', '/workflow/queue', { token: registrar });
  const regProps = rq.json?.data?.properties?.map((p) => p.property_id) || [];
  const regTransfers = rq.json?.data?.transfers?.map((t) => t.transfer_reference) || [];
  check('registrar queue holds the verified application', regProps.includes(newPropRef), JSON.stringify(regProps));
  check('registrar queue holds TRF-2026-0001 + TRF-2026-0003', regTransfers.includes('TRF-2026-0001') && regTransfers.includes('TRF-2026-0003'), JSON.stringify(regTransfers));

  // registrar is blocked on a still-consent-pending transfer (TRF-2026-0004)
  const blocked = await req('POST', '/transfers/TRF-2026-0004/approve', { token: registrar, body: { reason: 'attempt' } });
  check('registrar blocked by consent gate on TRF-2026-0004 (409 CONSENT_INCOMPLETE)', blocked.status === 409 && blocked.json?.errorCode === 'CONSENT_INCOMPLETE', `got ${blocked.status}`);

  const reg = await req('POST', `/registrar/properties/${newPropId}/approve`, { token: registrar, body: { reason: 'Legal scrutiny passed.' } });
  check('registrar approves + registers on-chain', reg.status === 200 && reg.json?.data?.property?.status === 'REGISTERED' && !!reg.json?.data?.blockchainTransaction,
    JSON.stringify(reg.json).slice(0, 200));

  const settle = await req('POST', `/transfers/${trf1Uuid}/approve`, { token: registrar, body: { reason: 'Consent complete; all checks clear.' } });
  check('registrar settles multi-party transfer on-chain -> COMPLETED', settle.status === 200 && settle.json?.data?.transfer?.status === 'COMPLETED', JSON.stringify(settle.json).slice(0, 220));
  const txHash = settle.json?.data?.blockchainTransaction?.transaction_hash || '';
  check('settlement carries a real transaction hash + block', /^0x[0-9a-f]{64}$/.test(txHash) && Number(settle.json?.data?.blockchainTransaction?.block_number) > 0, txHash.slice(0, 20));
  const p1after = await req('GET', '/properties/PROP-2026-0001', { token: om });
  check('ownership updated to the buyer after settlement', p1after.json?.data?.property?.current_owner_id, JSON.stringify(p1after.json?.data?.property?.current_owner_id || '').slice(0, 60));

  // --- 7. admin: oversight board + override + role wall
  const admin = await login('omdummy102@gmail.com', 'LandLedger@123');
  const ov = await req('GET', '/workflow/oversight', { token: admin });
  check('admin oversight loads', ov.status === 200 && ov.json?.data?.propertyStageCounts, JSON.stringify(ov.json).slice(0, 160));
  const users = ov.json?.data?.users || [];
  check('admin sees roster incl. all 5 roles', ['citizen', 'surveyor', 'clerk', 'registrar', 'admin'].every((r) => users.some((u) => u.role === r)), JSON.stringify(users.map((u) => u.role)));
  // admin override-reject the remaining active file (House 4 now at registrar desk)
  const ovr = await req('POST', `/workflow/properties/${p6}/override-reject`, { token: admin, body: { reason: 'Oversight stop: valuation discrepancy flagged.' } });
  check('admin override-rejects active file', ovr.status === 200 && ovr.json?.data?.property?.status === 'REJECTED', JSON.stringify(ovr.json).slice(0, 160));
  // admin cannot survey (role wall)
  const adminSurvey = await req('POST', `/workflow/properties/${newPropId}/survey`, { token: admin, body: { decision: 'APPROVE' } });
  check('admin blocked from surveyor action (403)', adminSurvey.status === 403, `got ${adminSurvey.status}`);

  // --- 8. citizen sees the full trail on their file
  const detail = await req('GET', `/properties/${newPropId}`, { token: om });
  const hist = detail.json?.data?.property?.stage_history || [];
  check('citizen sees stage history trail (>=3 entries)', hist.length >= 3, `got ${hist.length}`);
  check('final status REGISTERED', detail.json?.data?.property?.status === 'REGISTERED');

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error('Test crashed:', err); process.exit(1); });
