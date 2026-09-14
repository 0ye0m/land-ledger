#!/usr/bin/env bash
# ============================================================
# LAND LEDGER - one-shot local environment bootstrap
# Starts/verifies PostgreSQL + Hardhat node, deploys the
# contract when needed, runs seed, builds the
# frontend if missing, and starts the integrated API server.
# Idempotent: safe to re-run.
# ============================================================
set -u
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
RUNTIME="$ROOT/.runtime"
PGHOME="$RUNTIME/postgresql-16.4.0-x86_64-unknown-linux-gnu"
PGDATA="$RUNTIME/pgdata"
LOG="$RUNTIME/dev-up.log"

log() { echo "[dev-up] $*"; }

export PGPASSWORD="${PGPASSWORD:-landledger_dev_pw}"

# ---------- 1. PostgreSQL ----------
if ! "$PGHOME/bin/pg_isready" -h 127.0.0.1 -p 5432 -q 2>/dev/null; then
  if [ ! -d "$PGDATA" ]; then
    log "Initializing PostgreSQL data directory…"
    mkdir -p "$PGDATA"
    echo "landledger_dev_pw" > "$RUNTIME/.pgpw"
    "$PGHOME/bin/initdb" -D "$PGDATA" -U landledger --pwfile="$RUNTIME/.pgpw" -E UTF8 -A scram-sha-256 >> "$LOG" 2>&1
    rm -f "$RUNTIME/.pgpw"
  fi
  log "Starting PostgreSQL…"
  "$PGHOME/bin/pg_ctl" -D "$PGDATA" -l "$PGDATA/postgres.log" -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" start >> "$LOG" 2>&1
  sleep 2
fi
if ! "$PGHOME/bin/psql" -h 127.0.0.1 -p 5432 -U landledger -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='land_ledger'" | grep -q 1; then
  log "Creating database land_ledger…"
  "$PGHOME/bin/psql" -h 127.0.0.1 -p 5432 -U landledger -d postgres -c "CREATE DATABASE land_ledger;" >> "$LOG" 2>&1
fi
log "PostgreSQL ready."

# ---------- 2. Hardhat node ----------
chain_ready() {
  curl -s --max-time 3 -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' http://127.0.0.1:8545 | grep -q '"result"'
}
contract_deployed() {
  ADDR=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$ROOT/blockchain/deployments/local.json','utf8')).contractAddress||'')}catch(e){console.log('')}")
  [ -n "$ADDR" ] || return 1
  CODE=$(curl -s --max-time 3 -X POST -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$ADDR\",\"latest\"],\"id\":1}" http://127.0.0.1:8545 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).result)}catch(e){console.log('0x')}})")
  [ -n "$CODE" ] && [ "$CODE" != "0x" ]
}

if ! chain_ready; then
  log "Starting Hardhat node…"
  (cd "$ROOT/blockchain" && nohup npx hardhat node --hostname 127.0.0.1 --port 8545 >> "$RUNTIME/hardhat.log" 2>&1 &)
  for i in $(seq 1 30); do chain_ready && break; sleep 1; done
  NEED_DEPLOY=1
else
  if contract_deployed; then
    log "Hardhat node up, contract already deployed."
    NEED_DEPLOY=0
  else
    log "Hardhat node up but contract missing - redeploying."
    NEED_DEPLOY=1
  fi
fi

if [ "${NEED_DEPLOY:-0}" = "1" ]; then
  log "Deploying LandRegistry contract to the running node…"
  (cd "$ROOT/blockchain" && npx hardhat run scripts/deploy.js --network localhost 2>&1 | grep -E "deployed at|ERROR" || true)
fi

# ---------- 3. Migrations + seed ----------
log "Seeding MongoDB Atlas (skips automatically if data exists)…"
(cd "$ROOT/backend" && node src/db/seed.js >> "$LOG" 2>&1) || log "WARN: seed reported issues (see $LOG)"

# ---------- 4. Frontend build (if missing) ----------
if [ ! -f "$ROOT/frontend/dist/index.html" ]; then
  log "Building frontend…"
  (cd "$ROOT/frontend" && npm run build >> "$LOG" 2>&1) || { log "ERROR: frontend build failed"; exit 1; }
fi

# ---------- 5. API server ----------
if curl -s --max-time 2 http://127.0.0.1:3000/health > /dev/null 2>&1; then
  log "API server already running on :3000 - restarting to pick up contract address."
  pkill -f "node src/server.js" 2>/dev/null || true
  sleep 1
fi
log "Starting LAND LEDGER API on :3000…"
(cd "$ROOT/backend" && nohup node src/server.js >> "$RUNTIME/backend.log" 2>&1 &)
sleep 2.5

curl -s --max-time 4 http://127.0.0.1:3000/health && echo
log "Done. Registry: http://127.0.0.1:3000"
