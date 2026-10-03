#!/usr/bin/env node
/* LAND LEDGER - multi-role workflow end-to-end test (against a running API). */
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

async function login(email, password) {
  const r = await req('POST', '/auth/login', { body: { email, password } });
  check(`login ${email}`, r.status === 200 && r.json?.data?.token, JSON.stringify(r.json).slice(0, 120));
  return r.json.data.token;
}

(async () => {
  // --- 1. citizen files a new application -> SUBMITTED
  const asha = await login('asha.rao@example.com', 'Citizen@123');
  const created = await req('POST', '/properties', {
    token: asha,
    body: {
      title: 'Flat 21, Green Meadows', addressLine: 'Flat 21, Green Meadows Phase 2',
      city: 'Pune', district: 'Pune', state: 'Maharashtra',
      areaValue: 1120, areaUnit: 'sq ft', propertyType: 'RESIDENTIAL_BUILDING',
      description: 'E2E workflow test application.',
      ownerWallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    },
  });
  check('citizen creates application (SUBMITTED)', created.status === 201 && created.json?.data?.property?.status === 'SUBMITTED',
    JSON.stringify(created.json).slice(0, 160));
  const newPropId = created.json?.data?.property?.id;
  const newPropRef = created.json?.data?.property?.property_id;

  // --- 2. role walls: citizen cannot survey
  const wall = await req('POST', `/workflow/properties/${newPropId}/survey`, { token: asha, body: { decision: 'APPROVE' } });
  check('citizen blocked from survey action (403)', wall.status === 403, `got ${wall.status}`);

  // --- 3. surveyor: queue has the new file + seeded PROP-2026-0002, approves both
  const surveyor = await login('arjun.deshmukh@landledger.gov', 'Surveyor@123');
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

  // --- 4. clerk: verify docs for new property + seeded House 4 + the transfer
  const clerk = await login('deepa.shinde@landledger.gov', 'Verifier@123');
  const cq = await req('GET', '/workflow/queue', { token: clerk });
  const clerkProps = cq.json?.data?.properties?.map((p) => p.property_id) || [];
  const clerkTransfers = cq.json?.data?.transfers?.map((t) => t.transfer_reference) || [];
  check('clerk queue has property after survey', clerkProps.includes(newPropRef), JSON.stringify(clerkProps));
  check('clerk queue has seeded House 4 (PROP-2026-0006)', clerkProps.includes('PROP-2026-0006'));
  check('clerk queue has seeded transfer TRF-2026-0001', clerkTransfers.includes('TRF-2026-0001'), JSON.stringify(clerkTransfers));
  const v1 = await req('POST', `/workflow/properties/${newPropId}/verify-docs`, { token: clerk, body: { decision: 'APPROVE', notes: 'Deed and receipts in order.' } });
  check('clerk verifies new application -> DOCS_VERIFIED', v1.status === 200 && v1.json?.data?.property?.status === 'DOCS_VERIFIED',
    JSON.stringify(v1.json).slice(0, 160));
  const p6 = (cq.json.data.properties.find((p) => p.property_id === 'PROP-2026-0006') || {}).id;
  const v2 = p6 ? await req('POST', `/workflow/properties/${p6}/verify-docs`, { token: clerk, body: { decision: 'APPROVE', notes: 'Occupation cert current.' } }) : { status: 0 };
  check('clerk verifies seeded House 4', v2.status === 200, `got ${v2.status}`);
  const trf = (cq.json.data.transfers.find((t) => t.transfer_reference === 'TRF-2026-0001') || {}).id;
  const v3 = trf ? await req('POST', `/workflow/transfers/${trf}/verify-docs`, { token: clerk, body: { decision: 'APPROVE', notes: 'Transfer papers complete.' } }) : { status: 0 };
  check('clerk verifies seeded transfer -> DOCS_VERIFIED', v3.status === 200 && v3.json?.data?.transfer?.status === 'DOCS_VERIFIED', `got ${v3.status}`);

  // --- 5. registrar: only DOCS_VERIFIED files appear; approve on-chain
  const registrar = await login('meera.krishnan@landledger.gov', 'Registrar@123');
  const rq = await req('GET', '/workflow/queue', { token: registrar });
  const regProps = rq.json?.data?.properties?.map((p) => p.property_id) || [];
  const regTransfers = rq.json?.data?.transfers?.map((t) => t.transfer_reference) || [];
  check('registrar queue holds the verified application', regProps.includes(newPropRef), JSON.stringify(regProps));
  check('registrar queue holds verified transfer', regTransfers.includes('TRF-2026-0001'), JSON.stringify(regTransfers));
  const reg = await req('POST', `/registrar/properties/${newPropId}/approve`, { token: registrar, body: { reason: 'Legal scrutiny passed.' } });
  check('registrar approves + registers on-chain', reg.status === 200 && reg.json?.data?.property?.status === 'REGISTERED' && !!reg.json?.data?.blockchainTransaction,
    JSON.stringify(reg.json).slice(0, 200));

  // --- 6. admin: oversight board + override
  const admin = await login('ramesh.iyer@landledger.gov', 'Admin@123');
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

  // --- 7. citizen sees the full trail on their file
  const detail = await req('GET', `/properties/${newPropId}`, { token: asha });
  const hist = detail.json?.data?.property?.stage_history || [];
  check('citizen sees stage history trail (>=3 entries)', hist.length >= 3, `got ${hist.length}`);
  check('final status REGISTERED', detail.json?.data?.property?.status === 'REGISTERED');

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error('Test crashed:', err); process.exit(1); });
