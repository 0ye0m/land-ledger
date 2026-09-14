#!/usr/bin/env node
'use strict';

/**
 * LAND LEDGER - cloud deploy entry point (pure Node, zero shell deps).
 *
 * Why Node instead of bash: the deploy runtime image is unknown - it may
 * lack bash, curl, seq, etc. Node is guaranteed (it runs npm scripts).
 *
 * Contract:
 *   1. LISTEN FAST  - API child is spawned immediately; nothing blocks.
 *   2. SELF-HEAL    - git does not ship backend/.env; rebuild it from the
 *                     tracked upload/atlas-credentials.env when missing.
 *   3. NEVER DIE    - server.js never exits on Mongo connectivity issues.
 *   4. OPTIONAL CHAIN - local Hardhat only when BOOT_CHAIN=1 and deps are
 *                     installed; never blocks or crashes the deploy.
 *   5. DUAL PORT    - if FC_CUSTOM_LISTEN_PORT differs from PORT, a tiny
 *                     TCP proxy bridges it so any platform probe succeeds.
 */

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // .../land-ledger
const RUNTIME = path.join(ROOT, '.runtime', 'cloud');
fs.mkdirSync(RUNTIME, { recursive: true });

const log = (...a) => console.log('[start-cloud]', ...a);

// ---------- 1. Self-heal backend/.env ----------
const envPath = path.join(ROOT, 'backend', '.env');
if (!fs.existsSync(envPath)) {
  log('backend/.env missing (gitignored) - rebuilding it...');
  const candidates = [
    path.join(ROOT, '..', 'upload', 'atlas-credentials.env'),
    path.join(ROOT, 'upload', 'atlas-credentials.env'),
    path.join(ROOT, '..', '..', 'upload', 'atlas-credentials.env'),
  ];
  let uri = '';
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    const m = fs.readFileSync(c, 'utf8').match(/^MONGODB_URI=(.*)$/m);
    if (m && m[1].trim()) {
      uri = m[1].trim().replace(/^["']|["']$/g, '');
      if (!uri.includes('?')) uri += '/?retryWrites=true&w=majority&appName=land-ledger';
      break;
    }
  }
  const port = process.env.PORT || '3000';
  const content = [
    'NODE_ENV=development',
    `PORT=${port}`,
    'CORS_ORIGIN=http://localhost:5173',
    '',
    `MONGODB_URI=${uri}`,
    'MONGODB_DB_NAME=land_ledger',
    '',
    'JWT_SECRET=landledger_deploy_jwt_secret_7f3a9c1e5b2d4860ae91',
    'JWT_EXPIRES_IN=7d',
    '',
    'UPLOAD_DIR=uploads',
    'MAX_UPLOAD_SIZE_MB=10',
    '',
    'BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545',
    'CONTRACT_ADDRESS=',
    'BLOCKCHAIN_NETWORK_NAME=hardhat',
    '',
  ].join('\n');
  fs.writeFileSync(envPath, content);
  log(uri ? 'backend/.env created with MongoDB Atlas URI (db: land_ledger).' : 'WARNING: no Atlas credentials file found - app will boot without MongoDB.');
}

// ---------- 2. Start API + SPA immediately ----------
// NOTE: never listen on FC_CUSTOM_LISTEN_PORT - that is the PLATFORM's own
// privileged proxy port (<1024, EACCES for us). It forwards to our app.
// The app itself always uses PORT (default 3000), which the proxy targets.
const apiPort = String(process.env.PORT || '3000');
log(`Starting LAND LEDGER API + SPA on port ${apiPort} ...`);
const api = spawn('node', ['src/server.js'], {
  cwd: path.join(ROOT, 'backend'),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: apiPort },
});
const apiLog = fs.createWriteStream(path.join(RUNTIME, 'api.log'), { flags: 'a' });
api.stdout.pipe(apiLog, { end: false });
api.stderr.pipe(apiLog, { end: false });
api.stdout.pipe(process.stdout);
api.stderr.pipe(process.stderr);
api.on('error', (err) => {
  log(`API spawn error: ${err.message}`);
});
api.on('exit', (code, signal) => {
  log(`API process exited (code=${code} signal=${signal})`);
  process.exit(code || 0);
});

// ---------- 3. Optional local chain (BOOT_CHAIN=1 to enable) ----------
// Chain deps may live in two places:
//   a) blockchain/node_modules            (full local dev checkout)
//   b) CHAIN_RUNTIME_DIR or ../skills/_chain-runtime (out-of-package runtime,
//      keeps the deployable land-ledger/ tree slim while preview gets a live chain)
const resolveChainDir = () => {
  const local = path.join(ROOT, 'blockchain');
  if (fs.existsSync(path.join(local, 'node_modules', '.bin', 'hardhat'))) return local;
  const runtime = process.env.CHAIN_RUNTIME_DIR || path.join(ROOT, '..', 'skills', '_chain-runtime');
  if (fs.existsSync(path.join(runtime, 'node_modules', '.bin', 'hardhat'))) return runtime;
  return null;
};

if (process.env.BOOT_CHAIN === '1') {
  const chainDir = resolveChainDir();
  if (!chainDir) {
    log('BOOT_CHAIN=1 but no hardhat runtime found - skipping chain.');
  } else {
    const hardhatBin = path.join(chainDir, 'node_modules', '.bin', 'hardhat');
    const rpcAlive = () => new Promise((resolve) => {
      const req = http.request({
        host: '127.0.0.1', port: 8545, method: 'POST', path: '/', timeout: 1500,
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        res.resume();
        res.on('end', () => resolve(true));
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end(JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }));
    });
    (async () => {
      if (await rpcAlive()) return log('Hardhat already running on :8545 - reusing.');
      log(`Starting local Hardhat node from ${chainDir} (background)...`);
      const chain = spawn(hardhatBin, ['node'], { cwd: chainDir, stdio: 'ignore', detached: true });
      chain.unref();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (await rpcAlive()) {
          log('Hardhat node is up - deploying LandRegistry contract...');
          const deploy = spawn(hardhatBin, ['run', 'scripts/deploy.js', '--network', 'localhost'], {
            cwd: chainDir, stdio: 'ignore',
          });
          deploy.on('exit', (c) => {
            if (c !== 0) return log('Contract deploy failed - continuing without settlement.');
            log('Contract deployed.');
            // Publish the artifact where the API's lazy resolver looks for it.
            try {
              const src = path.join(chainDir, 'deployments', 'local.json');
              const destDir = path.join(ROOT, 'blockchain', 'deployments');
              fs.mkdirSync(destDir, { recursive: true });
              fs.copyFileSync(src, path.join(destDir, 'local.json'));
              log('deployment artifact synced to backend-visible path.');
            } catch (e) {
              log(`deployment artifact sync failed: ${e.message}`);
            }
          });
          return;
        }
      }
      log('Hardhat node did not come up in time - continuing without blockchain.');
    })();
  }
} else {
  log('Chain bootstrap disabled (set BOOT_CHAIN=1 to enable local Hardhat).');
}

// ---------- 4. Dual port bridge (platform probe compatibility) ----------
const fcPort = process.env.FC_CUSTOM_LISTEN_PORT ? String(process.env.FC_CUSTOM_LISTEN_PORT) : null;
if (fcPort && fcPort !== apiPort) {
  const bridge = net.createServer((client) => {
    const upstream = net.connect(Number(apiPort), '127.0.0.1');
    client.pipe(upstream);
    upstream.pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  });
  bridge.on('error', (err) => {
    log(`Bridge :${fcPort} unavailable (${err.code}) - platform proxy likely already bound; continuing.`);
  });
  bridge.listen(Number(fcPort), () => log(`Bridge listening :${fcPort} -> :${apiPort}`));
}

// ---------- 5. Signal forwarding ----------
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log(`${sig} received - shutting down`);
    api.kill(sig);
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
