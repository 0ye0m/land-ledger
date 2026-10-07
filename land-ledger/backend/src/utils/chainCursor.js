'use strict';

/**
 * Disk-only cursor of the highest property business-id suffix ever settled
 * on the CURRENT local chain session (e.g. 9 after PROP-2026-0009).
 *
 * Why: the Hardhat node is long-lived while `seed --force` resets MongoDB.
 * Without this cursor a reseed would re-issue business ids that the chain
 * already knows ("property already registered"). The cursor lets the seed
 * floor its counters above every id the chain has seen. The file lives in
 * the gitignored .runtime directory - it never reaches the deploy payload
 * and rebuilds itself as new transactions happen.
 */

const fs = require('fs');
const path = require('path');

const CURSOR_PATH = path.resolve(process.cwd(), '..', '.runtime', 'chain-cursor.json');

function readCursor() {
  try {
    const raw = JSON.parse(fs.readFileSync(CURSOR_PATH, 'utf8'));
    return { property: Number(raw.property) || 0, transfer: Number(raw.transfer) || 0 };
  } catch {
    return { property: 0, transfer: 0 };
  }
}

function bumpPropertyCursor(suffix) {
  const n = Number(suffix);
  if (!Number.isFinite(n) || n <= 0) return;
  const cur = readCursor();
  if (n > cur.property) {
    try {
      fs.mkdirSync(path.dirname(CURSOR_PATH), { recursive: true });
      fs.writeFileSync(CURSOR_PATH, JSON.stringify({ ...cur, property: n }));
    } catch { /* cursor is best-effort */ }
  }
}

module.exports = { readCursor, bumpPropertyCursor };
