'use strict';
// Diagnose Atlas reachability: SRV DNS + TCP to seed hosts on 27017
const dns = require('dns').promises;
const net = require('net');

const host = 'cluster0.kbwpfqx.mongodb.net';

function tcpProbe(host, port, timeout = 8000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => { socket.destroy(); resolve(result); };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(`OPEN ${host}:${port}`));
    socket.once('timeout', () => done(`TIMEOUT ${host}:${port}`));
    socket.once('error', (e) => done(`ERROR ${host}:${port} (${e.code || e.message})`));
    socket.connect(port, host);
  });
}

(async () => {
  // 1. egress IP
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) });
    console.log('egress IP:', (await r.json()).ip);
  } catch (e) { console.log('egress IP: lookup failed', e.message); }

  // 2. SRV record
  try {
    const recs = await dns.resolveSrv(`_mongodb._tcp.${host}`);
    console.log('SRV records:', JSON.stringify(recs));
    // 3. TCP probes to each seed
    for (const r of recs.slice(0, 3)) {
      console.log('tcp probe:', await tcpProbe(r.name, r.port));
    }
  } catch (e) {
    console.log('SRV resolution failed:', e.code || e.message);
    // fallback: try resolving the plain host + standard A records
    try {
      const a = await dns.resolve4(host);
      console.log('A records for', host, ':', a.join(', '));
      console.log('tcp probe 27017:', await tcpProbe(host, 27017));
    } catch (e2) {
      console.log('A resolution failed too:', e2.code || e2.message);
    }
  }
})();
