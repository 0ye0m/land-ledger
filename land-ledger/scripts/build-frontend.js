#!/usr/bin/env node
/**
 * LAND LEDGER - deploy-safe frontend build step.
 *
 * Contract for cloud deploys:
 *  - The production SPA is PRE-BUILT and committed at land-ledger/frontend/dist,
 *    so a deploy never needs Vite or frontend devDependencies.
 *  - If dist is present  -> exit 0 immediately (no vite, no devDeps required).
 *  - If dist is missing  -> try a real vite build when node_modules/.bin/vite exists.
 *  - If vite is missing  -> print a warning and exit 0 anyway; the API serves the
 *    committed dist and must never fail the deploy because of a build tool.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..'); // land-ledger/scripts -> land-ledger -> project root
const distIndex = path.join(root, 'land-ledger', 'frontend', 'dist', 'index.html');
const viteBin = path.join(root, 'land-ledger', 'frontend', 'node_modules', '.bin', 'vite');

// Integrity check: every /assets/* chunk referenced by dist/index.html must
// exist on disk. Guards against a partially written dist (e.g. an interrupted
// vite build) being silently served as a blank page.
function distAssetsResolve() {
  try {
    const html = fs.readFileSync(distIndex, 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    if (!refs.length) return false;
    const assetsDir = path.join(root, 'land-ledger', 'frontend', 'dist');
    return refs.every((ref) => fs.existsSync(path.join(assetsDir, ref.replace(/^\/+/, ''))));
  } catch {
    return false;
  }
}

if (fs.existsSync(distIndex) && distAssetsResolve()) {
  console.log('[build] land-ledger/frontend/dist already built and committed - skipping vite build.');
  process.exit(0);
}

if (fs.existsSync(distIndex)) {
  console.warn('[build] WARNING: dist/index.html references missing asset chunks - rebuilding...');
}

if (!fs.existsSync(viteBin)) {
  console.warn('[build] dist missing and vite not installed - skipping build (API will serve whatever dist exists).');
  process.exit(0);
}

console.log('[build] running vite build for land-ledger/frontend ...');

// Static guard BEFORE building: every custom hook used in a source file must
// be imported by that file. A missing import is invisible to vite (it compiles
// to an unresolved global) and explodes at runtime as ReferenceError, which
// crashes the whole React tree - every navigation then looks broken.
function checkHookImports() {
  const srcDir = path.join(root, 'land-ledger', 'frontend', 'src');
  const hooks = ['useApi', 'useDocumentTitle', 'hashOf', 'useDebounced', 'applyTheme'];
  const files = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx?|tsx?)$/.test(name)) files.push(p);
    }
  })(srcDir);
  let bad = 0;
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const hook of hooks) {
      const usedRe = new RegExp(`\\b${hook}\\s*\\(`);
      if (!usedRe.test(src)) continue;
      const imported = new RegExp(`import\\s*\\{[^}]*\\b${hook}\\b[^}]*\\}`).test(src);
      const defined = new RegExp(`(function\\s+${hook}\\b|const\\s+${hook}\\s*=)`).test(src);
      if (!imported && !defined) {
        console.error(`[build] MISSING IMPORT: "${hook}" used but not imported/defined in ${path.relative(root, file)}`);
        bad++;
      }
    }
  }
  if (bad > 0) {
    console.error('[build] aborting - fix the missing imports above (unresolved globals crash the app at runtime).');
    process.exit(1);
  }
}
checkHookImports();

const res = spawnSync(viteBin, ['build'], { cwd: path.join(root, 'land-ledger', 'frontend'), stdio: 'inherit' });
process.exit(res.status == null ? 0 : res.status);
