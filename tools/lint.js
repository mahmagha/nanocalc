#!/usr/bin/env node
/*
 * Dependency-free lint for NanoCalc: node tools/lint.js
 *  - every JS file parses (node --check)
 *  - every local script/stylesheet/manifest referenced by index.html exists
 *  - no debugger statements or console.log left in app code (js/)
 *  - version is consistent across package.json, js/core.js (NC.version) and CHANGELOG.md
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const problems = [];
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.venv', 'node_modules', 'vendor'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// 1. syntax
const files = walk(root, []);
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(rel(f) + ': syntax error\n' + (r.stderr || '').split('\n').slice(0, 4).join('\n'));
}

// 2. references in index.html exist
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
  if (!fs.existsSync(path.join(root, m[1]))) problems.push('index.html references a missing file: ' + m[1]);
}

// 3. leftover debugging in app code
for (const f of files.filter((p) => rel(p).startsWith('js/'))) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*debugger\s*;?/.test(line)) problems.push(rel(f) + ':' + (i + 1) + ': debugger statement');
    if (/\bconsole\.log\(/.test(line)) problems.push(rel(f) + ':' + (i + 1) + ': console.log left in app code');
  });
}

// 4. version consistency
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const core = (fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8').match(/NC\.version = '([^']+)'/) || [])[1];
const log = (fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').match(/^## \[(\d+\.\d+\.\d+)\]/m) || [])[1];
if (!(pkg === core && core === log)) problems.push('version mismatch: package.json ' + pkg + ', js/core.js ' + core + ', CHANGELOG.md ' + log);

if (problems.length) {
  console.error('Lint found ' + problems.length + ' problem(s):\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('Lint OK: ' + files.length + ' JS files parse, index.html references resolve, no debug leftovers, version ' + pkg + ' consistent.');
