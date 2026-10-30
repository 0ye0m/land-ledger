// Task 34: dump raw transfer/property shapes from dev API
const BASE = process.env.API || 'http://127.0.0.1:3100';
async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'LandLedger@123' }) });
  const j = await r.json();
  const v = await fetch(`${BASE}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId: j.data.challengeId, otp: j.data.devCode }) });
  return (await v.json()).data.token;
}
(async () => {
  const H = { Authorization: `Bearer ${await login('omdummy102@gmail.com')}` };
  const tj = await (await fetch(`${BASE}/api/transfers`, { headers: H })).json();
  const list = tj.data.transfers || [];
  console.log('=== ALL TRANSFERS ===');
  list.forEach(t => console.log(JSON.stringify({ id: t.id, ref: t.transfer_reference, status: t.status, property: t.propertyName || t.property })));
  console.log('=== SAMPLE TRANSFER KEYS ===', Object.keys(list[0] || {}).join(','));
  const pj = await (await fetch(`${BASE}/api/properties?page=1&limit=100`, { headers: H })).json();
  const plist = pj.data.items || pj.data.properties || pj.data;
  console.log('=== SAMPLE PROPERTY ===');
  console.log(JSON.stringify(plist[0], null, 1).slice(0, 900));
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
