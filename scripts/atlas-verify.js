'use strict';
// Verify LAND LEDGER collections inside MongoDB Atlas
const mongoose = require('/home/z/my-project/land-ledger/backend/node_modules/mongoose');

const uri = process.argv[2];

(async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 12000, dbName: 'land_ledger' });
  const db = mongoose.connection.db;

  const collections = await db.listCollections().toArray();
  console.log('collections in land_ledger:', collections.map((c) => `${c.name}(${c.type})`).join(', ') || '(none)');

  for (const name of ['audit_events', 'login_events']) {
    const count = await db.collection(name).countDocuments();
    console.log(`\n== ${name}: ${count} document(s)`);
    const docs = await db.collection(name).find().sort({ created_at: -1 }).limit(3).toArray();
    for (const d of docs) {
      console.log('  -', JSON.stringify({
        action: d.action || undefined,
        outcome: d.outcome || undefined,
        actor: d.actorName || d.email,
        result: d.result,
        ip: d.ip,
        role: d.actorRole || d.role,
        createdAt: d.created_at,
      }));
    }
  }

  const idx = await db.collection('audit_events').indexes();
  console.log('\naudit_events indexes:', idx.map((i) => i.name).join(', '));
  const idx2 = await db.collection('login_events').indexes();
  console.log('login_events indexes:', idx2.map((i) => i.name).join(', '));

  await mongoose.disconnect();
  console.log('\nVERIFY_DONE');
})().catch((e) => { console.error('VERIFY_FAIL:', e.message); process.exit(1); });
