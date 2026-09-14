'use strict';
// One-shot Atlas connectivity test (does not modify anything)
const mongoose = require('/home/z/my-project/land-ledger/backend/node_modules/mongoose');

const uri = process.argv[2];
if (!uri) {
  console.error('usage: node atlas-ping.js "<mongodb+srv://...>"');
  process.exit(2);
}

(async () => {
  const t0 = Date.now();
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 12000,
      connectTimeoutMS: 12000,
    });
    const admin = mongoose.connection.db.admin();
    const info = await admin.ping();
    const hello = await admin.command({ hello: 1 });
    console.log('ATLAS_CONNECT_OK in', Date.now() - t0, 'ms');
    console.log('ping:', JSON.stringify(info));
    console.log('resolver/conn:', hello.me, '| set:', hello.setName || 'n/a', '| mongo v:', (hello.version || 'unknown'));
    console.log('topology:', mongoose.connection.readyState, '(1=connected)');
    const dbs = await mongoose.connection.db.admin().listDatabases();
    console.log('databases:', dbs.databases.map((d) => d.name).join(', ') || '(none)');
    await mongoose.disconnect();
    console.log('ATLAS_DISCONNECT_OK');
    process.exit(0);
  } catch (err) {
    console.error('ATLAS_CONNECT_FAIL after', Date.now() - t0, 'ms');
    console.error('name:', err.name);
    console.error('message:', err.message);
    if (err.code) console.error('code:', err.code);
    process.exit(1);
  }
})();
