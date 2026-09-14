'use strict';
/**
 * LAND LEDGER - end-to-end demonstration flow (spec section 70).
 * Exercises every major workflow against the running integrated server.
 */

const BASE = 'http://127.0.0.1:3000';
let passed = 0;
let failed = 0;

function check(label, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✔ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✘ FAIL: ${label} ${extra}`);
  }
}

async function api(path, { method = 'GET', token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: formData ? formData : body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

async function main() {
  console.log('\n=== LAND LEDGER END-TO-END DEMONSTRATION FLOW ===\n');

  // 1-2. Citizens exist (seeded) — register one fresh citizen C for the new-property flow
  const stamp = Date.now();
  console.log('[1-3] Citizen registration + login');
  const regA = await api('/api/auth/register', {
    method: 'POST',
    body: { fullName: 'Demo Citizen A', email: `citizen.a.${stamp}@demo.test`, password: 'Demo@12345', district: 'Pune', state: 'Maharashtra', walletAddress: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' },
  });
  check('Citizen A registered', regA.success && regA.data?.user?.role === 'citizen');
  const tokenA = regA.data.token;
  const regB = await api('/api/auth/login', { method: 'POST', body: { email: 'vikram.mehta@example.com', password: 'Citizen@123' } });
  check('Citizen B (seeded) login', regB.success);
  const tokenB = regB.data.token;
  const regR = await api('/api/auth/login', { method: 'POST', body: { email: 'meera.krishnan@landledger.gov', password: 'Registrar@123' } });
  check('Registrar login', regR.success && regR.data?.user?.role === 'registrar');
  const tokenR = regR.data.token;
  const badLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'asha.rao@example.com', password: 'wrong' } });
  check('Invalid password rejected (401)', badLogin.status === 401);

  // 4. Create property as Citizen A
  console.log('[4] Property registration request');
  const prop = await api('/api/properties', {
    method: 'POST',
    token: tokenA,
    body: { title: `Demo Estate ${stamp}`, addressLine: '12 Demo Lane', city: 'Pune', district: 'Pune', state: 'Maharashtra', areaValue: 2500, areaUnit: 'sq ft', propertyType: 'RESIDENTIAL_PLOT', description: 'E2E demo property' },
  });
  check('Property submitted (PENDING_REVIEW)', prop.success && prop.data?.property?.status === 'PENDING_REVIEW');
  const propertyId = prop.data.property.property_id;
  const propertyUuid = prop.data.property.id;

  // RBAC negative check: citizen cannot approve
  const citizenApprove = await api(`/api/registrar/properties/${propertyUuid}/approve`, { method: 'POST', token: tokenA, body: {} });
  check('Citizen blocked from registrar approval (403)', citizenApprove.status === 403);

  // 5-6. Upload supporting document (SHA-256 recorded)
  console.log('[5-6] Document upload + SHA-256');
  const fd = new FormData();
  fd.append('propertyId', propertyUuid);
  fd.append('documentType', 'TITLE_DEED');
  fd.append('file', new Blob([`%PDF-1.4 e2e deed ${stamp}`], { type: 'application/pdf' }), 'demo-deed.pdf');
  const up = await api('/api/documents/upload', { method: 'POST', token: tokenA, formData: fd });
  check('Document uploaded with SHA-256 fingerprint', up.success && /^[a-f0-9]{64}$/.test(up.data?.document?.sha256_hash || ''));
  const docId = up.data.document.id;

  // 7-8. Registrar verifies document
  console.log('[7-8] Registrar document verification');
  const verify = await api(`/api/documents/${docId}/verify`, { method: 'POST', token: tokenR, body: { outcome: 'VERIFIED' } });
  check('Document marked VERIFIED by registrar', verify.success && verify.data?.document?.verification_status === 'VERIFIED');

  // Integrity re-check
  const integrity = await api(`/api/documents/${docId}/verify-integrity`, { method: 'POST', token: tokenA });
  check('SHA-256 integrity check passes', integrity.success && integrity.data.intact === true);

  // 9-10. Approve property → on-chain registration
  console.log('[9-10] Registrar approval + smart-contract registration');
  const approveProp = await api(`/api/registrar/properties/${propertyUuid}/approve`, { method: 'POST', token: tokenR, body: { reason: 'Evidence complete' } });
  check('Property approved + registered on ledger', approveProp.success && approveProp.data?.property?.status === 'REGISTERED');
  check('Real transaction hash stored', /^0x[0-9a-f]{64}$/.test(approveProp.data?.blockchainTransaction?.transaction_hash || ''));

  // 11-17. Citizen A creates transfer to B (validations + fraud checks run)
  console.log('[11-17] Transfer creation with full validation chain');
  const transfer = await api('/api/transfers', {
    method: 'POST',
    token: tokenA,
    body: { propertyId, buyerEmail: 'vikram.mehta@example.com', requestDetails: 'E2E demo sale' },
  });
  check('Transfer created (PENDING)', transfer.success && transfer.data?.transfer?.status === 'PENDING');
  check('Fraud engine executed ≥8 checks', (transfer.data?.fraud?.checks_performed || []).length >= 8);
  check('checksPerformed + riskLevel returned', ['LOW', 'MEDIUM', 'HIGH'].includes(transfer.data?.fraud?.risk_level));
  const transferRef = transfer.data.transfer.transfer_reference;

  // Duplicate transfer must be rejected
  const dup = await api('/api/transfers', {
    method: 'POST',
    token: tokenA,
    body: { propertyId, buyerEmail: 'priya.nair@example.com' },
  });
  check('Conflicting duplicate transfer REJECTED (409)', dup.status === 409 && dup.errorCode === 'DUPLICATE_TRANSFER');

  // 18-26. Registrar approves → blockchain settlement → COMPLETED
  console.log('[18-26] Registrar review → approval → ledger settlement');
  const approveT = await api(`/api/transfers/${transferRef}/approve`, { method: 'POST', token: tokenR, body: { reason: 'All checks clear' } });
  check('Transfer settled COMPLETED', approveT.success && approveT.data?.transfer?.status === 'COMPLETED');
  const txHash = approveT.data?.blockchainTransaction?.transaction_hash || '';
  check('Real transaction hash stored (64-hex)', /^0x[0-9a-f]{64}$/.test(txHash));
  check('Block number recorded', Number(approveT.data?.blockchainTransaction?.block_number) > 0);
  check('PostgreSQL ownership updated to Citizen B', approveT.data?.transfer?.buyer_name === 'Vikram Mehta');

  // 27-28. Citizen B sees updated ownership
  console.log('[27-28] Citizen B visibility');
  const bView = await api(`/api/properties/${propertyId}`, { token: tokenB });
  check('Citizen B opens the property', bView.success);
  check('Citizen B is now the current owner', bView.data?.property?.current_owner_email === 'vikram.mehta@example.com');

  // 29. Ownership history shows the settlement
  console.log('[29] Ownership history');
  const history = await api(`/api/properties/${propertyId}/ownership-history`, { token: tokenB });
  check('Ownership history has registration + transfer entries', (history.data?.history || []).length === 2);
  check('History contains the real settlement tx', (history.data?.history || []).some((h) => h.transactionHash === txHash));

  // 30-31. Conflicting transfer attempt is rejected (previous owner tries again after settlement)
  console.log('[30-31] Conflict rejection after settlement');
  const conflict = await api('/api/transfers', {
    method: 'POST',
    token: tokenA,
    body: { propertyId, buyerEmail: 'asha.rao@example.com' },
  });
  check('Post-settlement transfer attempt rejected (409)', conflict.status === 409);
  check('Rejection reason: seller is no longer the owner', conflict.errorCode === 'SELLER_NOT_OWNER');

  // Extra: registrar-only endpoints + audit trail
  console.log('[Extra] Audit + RBAC + metrics');
  const audit = await api('/api/registrar/audit?pageSize=5', { token: tokenR });
  check('Audit log records the workflow', audit.success && audit.data.total >= 10);
  const citizenAudit = await api('/api/registrar/audit', { token: tokenA });
  check('Citizen blocked from audit (403)', citizenAudit.status === 403);
  const health = await (await fetch(`${BASE}/health`)).json();
  check('Health: DB + blockchain connected', health.database === 'connected' && health.blockchain === 'connected');
  const metrics = await (await fetch(`${BASE}/metrics`)).text();
  check('Prometheus metrics exposed', metrics.includes('land_ledger_http_requests_total'));

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E crashed:', err);
  process.exit(1);
});
