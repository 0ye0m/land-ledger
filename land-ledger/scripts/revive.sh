#!/usr/bin/env bash
# LAND LEDGER - one-command sandbox revival (preview wake-up after recycle).
# Usage: bash /home/z/my-project/land-ledger/scripts/revive.sh
set -u
ROOT="/home/z/my-project"
cd "$ROOT" || exit 1

echo "[revive] ensuring backend deps ..."
[ -f land-ledger/backend/node_modules/.package-lock.json ] || npm install --no-audit --no-fund --prefix land-ledger/backend

echo "[revive] ensuring chain runtime (hardhat) ..."
[ -f land-ledger/blockchain/node_modules/.bin/hardhat ] || npm install --no-audit --no-fund --prefix land-ledger/blockchain

echo "[revive] stopping stale processes ..."
pkill -f "land-ledger/scripts/start-cloud.js" 2>/dev/null
pkill -f "src/server.js" 2>/dev/null
sleep 2

echo "[revive] booting app + chain (BOOT_CHAIN=1) ..."
mkdir -p "$ROOT/.runtime"
( BOOT_CHAIN=1 nohup node land-ledger/scripts/start-cloud.js > "$ROOT/.runtime/main-app.log" 2>&1 & )

echo "[revive] waiting for health (up to 90s) ..."
for i in $(seq 1 30); do
  sleep 3
  H=$(curl -s -m 4 http://127.0.0.1:3000/health 2>/dev/null)
  case "$H" in
    *'"status":"ok"'*)
      echo "[revive] UP after ~$((i*3))s: $H"
      echo "[revive] preview: https://preview-chat-dfa0f212-db3c-4161-9c89-92e6f9b240ac.space-z.ai/"
      exit 0
      ;;
  esac
done
echo "[revive] FAILED to become healthy - check $ROOT/.runtime/main-app.log"
exit 1
