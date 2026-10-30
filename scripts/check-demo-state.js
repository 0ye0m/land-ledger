// Task 34: check demo data state via dev API (3100, MFA dev mode)
const BASE = process.env.API || 'http://127.0.0.1:3100';

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'LandLedger@123' })
  });
  const j = await r.json();
  if (!j.data || !j.data.challengeId) throw new Error(`login ${email}: ${JSON.stringify(j).slice(0, 200)}`);
  const v = await fetch(`${BASE}/api/auth/verify-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId: j.data.challengeId, otp: j.data.devCode })
  });
  const vj = await v.json();
  if (!vj.data || !vj.data.token) throw new Error(`otp ${email}: ${JSON.stringify(vj).slice(0, 200)}`);
  return vj.data.token;
}

(async () => {
  const admin = await login('omdummy102@gmail.com');   // Sneha Patil, admin
  const H = { Authorization: `Bearer ${admin}` };

  const health = await (await fetch(`${BASE}/health`)).json();
  console.log('health.latestBlock =', health.latestBlock);

  for (const ref of ['TRF-2026-0001', 'TRF-2026-0002', 'TRF-2026-0003', 'TRF-2026-0004']) {
    const r = await fetch(`${BASE}/api/transfers?search=${ref}`, { headers: H });
    const j = await r.json().catch(() => ({}));
    const rows = (j.data && (Array.isArray(j.data) ? j.data : j.data.items || j.data.transfers)) || [];
    const hit = rows.find(t => (t.transferRef || t.ref || '').includes(ref));
    console.log(ref, '->', hit ? `${hit.status} (id=${hit._id || hit.id})` : `NOT FOUND (${r.status}: ${JSON.stringify(j).slice(0, 120)})`);
  }

  const p = await fetch(`${BASE}/api/properties?page=1&limit=100`, { headers: H });
  const pj = await p.json().catch(() => ({}));
  const plist = (pj.data && (pj.data.items || pj.data.properties || (Array.isArray(pj.data) ? pj.data : []))) || [];
  console.log('properties count =', plist.length, '| statuses:', JSON.stringify(plist.reduce((a, x) => { a[x.status || '?'] = (a[x.status || '?'] || 0) + 1; return a; }, {})));
  console.log('property sample:', plist.slice(0, 3).map(x => `${x.title || x.propertyRef || x._id}:${x.status}${x.onChainRegistered || x.onChain ? '+chain' : '-chain'}`).join(', '));
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
