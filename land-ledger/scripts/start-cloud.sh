#!/usr/bin/env bash
# ============================================================
# LAND LEDGER - cloud / single-port bootstrap (deploy-safe)
#
# Design goals (learned from real deploy failures):
#   1. LISTEN FAST  - the API must accept HTTP within seconds;
#                     nothing may block before app.listen().
#   2. SELF-HEAL    - git does not ship .env (ignored). If
#                     backend/.env is missing, rebuild it from
#                     the tracked upload/atlas-credentials.env.
#   3. NEVER DIE    - MongoDB unreachable at boot must not kill
#                     the process (server.js keeps retrying).
#   4. OPTIONAL CHAIN - local Hardhat runs only if its deps are
#                     present, AFTER the API is listening, and
#                     never blocks or crashes the deploy.
# ============================================================
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"          # .../land-ledger
RUNTIME="$ROOT/.runtime/cloud"
mkdir -p "$RUNTIME"

PORT="${PORT:-3000}"
export PORT

log() { echo "[start-cloud] $*"; }

# ---------- 1. Self-heal backend/.env (git never ships it) ----------
if [ ! -f "$ROOT/backend/.env" ]; then
  log "backend/.env missing (gitignored) - rebuilding it..."
  CRED=""
  for c in "$ROOT/../upload/atlas-credentials.env" "$ROOT/upload/atlas-credentials.env" "$ROOT/../../upload/atlas-credentials.env"; do
    [ -f "$c" ] && CRED="$c" && break
  done
  URI=""
  if [ -n "$CRED" ]; then
    URI="$(grep -E '^MONGODB_URI=' "$CRED" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
    case "$URI" in
      *\?*) : ;;                                 # already has options
      "") : ;;
      *) URI="$URI/?retryWrites=true&w=majority&appName=land-ledger" ;;
    esac
  fi
  JWT_SECRET="landledger_deploy_jwt_secret_7f3a9c1e5b2d4860ae91"
  {
    echo "NODE_ENV=development"
    echo "PORT=$PORT"
    echo "CORS_ORIGIN=http://localhost:5173"
    echo ""
    echo "MONGODB_URI=$URI"
    echo "MONGODB_DB_NAME=land_ledger"
    echo ""
    echo "JWT_SECRET=$JWT_SECRET"
    echo "JWT_EXPIRES_IN=7d"
    echo ""
    echo "UPLOAD_DIR=uploads"
    echo "MAX_UPLOAD_SIZE_MB=10"
    echo ""
    echo "BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545"
    echo "CONTRACT_ADDRESS="
    echo "BLOCKCHAIN_NETWORK_NAME=hardhat"
  } > "$ROOT/backend/.env"
  if [ -n "$URI" ]; then
    log "backend/.env created with MongoDB Atlas URI (db: land_ledger)."
  else
    log "WARNING: no Atlas credentials file found - app will boot without MongoDB."
  fi
fi

# ---------- 2. Start API + SPA immediately (listen fast) ----------
log "Starting LAND LEDGER API + SPA on port $PORT ..."
cd "$ROOT/backend"
node src/server.js > "$RUNTIME/api.log" 2>&1 &
API_PID=$!

# ---------- 3. Optional local chain - strictly after listening ----------
(
  CHASHAT="$ROOT/blockchain/node_modules/.bin/hardhat"
  if [ ! -x "$CHASHAT" ]; then
    echo "[chain] hardhat deps not installed - skipping (honest unavailable state)"
    exit 0
  fi
  if curl -s -o /dev/null -m 2 -X POST -H 'Content-Type: application/json' \
       --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
       http://127.0.0.1:8545; then
    echo "[chain] hardhat already running on :8545 - reusing"
    exit 0
  fi
  echo "[chain] starting local Hardhat node..."
  ( cd "$ROOT/blockchain" && "$CHASHAT" node ) >> "$RUNTIME/hardhat.log" 2>&1 &
  up=0
  for _ in $(seq 1 40); do
    if curl -s -o /dev/null -m 2 -X POST -H 'Content-Type: application/json' \
         --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
         http://127.0.0.1:8545; then up=1; break; fi
    sleep 1
  done
  if [ "$up" = "1" ]; then
    echo "[chain] node up - deploying LandRegistry contract..."
    ( cd "$ROOT/blockchain" && timeout 180 npx hardhat run scripts/deploy.js --network localhost ) >> "$RUNTIME/deploy.log" 2>&1 \
      && echo "[chain] contract deployed" || echo "[chain] deploy failed - continuing without settlement"
  else
    echo "[chain] node did not come up - skipping"
  fi
) >> "$RUNTIME/chain.log" 2>&1 &

# ---------- 4. Keep the script attached to the API process ----------
wait "$API_PID"
