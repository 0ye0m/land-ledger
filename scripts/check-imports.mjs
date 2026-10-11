#!/usr/bin/env node
/* Static check: every custom-hook identifier used in a file must be
 * imported by that file or defined in that file. Catches the class of
 * bug just found (useDebounced used but not imported -> runtime
 * ReferenceError that kills the React tree). */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = '/home/z/my-project/land-ledger/frontend/src';
const HOOKS = ['useApi', 'useDocumentTitle', 'hashOf', 'useDebounced', 'applyTheme'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(p);
  }
  return out;
}

let bad = 0;
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  for (const hook of HOOKS) {
    const used = new RegExp(`\\b${hook}\\s*\\(`).test(src);
    if (!used) continue;
    const imported = new RegExp(`import\\s*\\{[^}]*\\b${hook}\\b[^}]*\\}`).test(src);
    const defined = new RegExp(`(function\\s+${hook}\\b|const\\s+${hook}\\s*=|export\\s+function\\s+${hook}\\b)`).test(src);
    if (!imported && !defined) {
      console.log(`MISSING IMPORT: ${hook} used but not imported/defined in ${file.replace(ROOT + '/', '')}`);
      bad++;
    }
  }
}
console.log(bad === 0 ? 'ALL CLEAN - every hook usage is imported or defined locally' : `${bad} problem(s) found`);
process.exit(bad === 0 ? 0 : 1);
