#!/usr/bin/env node
/* Read-only: print each role's queue counts (no mutations). */
'use strict';
const API = process.env.API || 'http://127.0.0.1:3000';
async function login(email, password) {
  const r = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (await r.json()).data.token;
}
(async () => {
  const roles = [
    ['surveyor', 'arjun.deshmukh@landledger.gov', 'Surveyor@123'],
    ['clerk', 'deepa.shinde@landledger.gov', 'Verifier@123'],
    ['registrar', 'meera.krishnan@landledger.gov', 'Registrar@123'],
    ['admin', 'ramesh.iyer@landledger.gov', 'Admin@123'],
  ];
  for (const [role, email, pass] of roles) {
    const token = await login(email, pass);
    const r = await fetch(`${API}/api/workflow/queue`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    const d = j.data || {};
    console.log(`${role.padEnd(10)} properties=${(d.properties || []).map((p) => p.property_id).join(',') || '-'}  transfers=${(d.transfers || []).map((t) => t.transfer_reference).join(',') || '-'}`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
