#!/usr/bin/env node
/*
 * Dependency-free lint for NanoCalc: node tools/lint.js
 *  - every JS file parses (node --check)
 *  - every local script/stylesheet/manifest referenced by index.html exists
 *  - no debugger statements or console.log left in app code (js/)
 *  - version is consistent across package.json, js/core.js (NC.version) and CHANGELOG.md
 *  - no JavaScript or CSS features newer than the supported browsers (Safari 15.4, Firefox 115, Chrome 100)
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

// 5. browser compatibility: the app targets browsers from the last three years
//    (Safari/iOS 15.4+, Firefox 115 ESR+, Chrome/Edge 100+). Newer features are refused;
//    in CSS, color-mix() is allowed when the same rule gives a plain value first ("fill: x; fill: color-mix(...)").
const JS_NEWER = [
  [/\(\?<[=!]/, 'regex lookbehind (Safari 16.4)'],
  [/\b(Object|Map)\.groupBy\b/, 'Object.groupBy (Safari 17.4, Firefox 119)'],
  [/\bPromise\.withResolvers\b/, 'Promise.withResolvers (Safari 17.4, Firefox 121)'],
  [/\.(union|intersection|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/, 'Set methods (Safari 17, Firefox 127)'],
  [/\bArray\.fromAsync\b|\bIterator\.from\b/, 'iterator helpers (Safari 18.4, Firefox 131)'],
  [/\bstructuredClone\b.*\btransfer\b/, 'structuredClone transfer']
];
const CSS_NEWER = [
  [/:has\(/, ':has() (Firefox 121)'],
  [/^\s*&/, 'CSS nesting (Safari 16.5, Firefox 117)'],
  [/@container|container-type/, 'container queries (Safari 16, Firefox 110)'],
  [/@scope|anchor-name|position-anchor/, 'CSS from 2024 or later']
];
for (const f of files.filter((p) => rel(p).startsWith('js/'))) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    JS_NEWER.forEach(([re, what]) => { if (re.test(line)) problems.push(rel(f) + ':' + (i + 1) + ': ' + what + ' is newer than the supported browsers'); });
  });
}
fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8').split('\n').forEach((line, i) => {
  CSS_NEWER.forEach(([re, what]) => { if (re.test(line)) problems.push('css/styles.css:' + (i + 1) + ': ' + what + ' is newer than the supported browsers'); });
  const m = line.match(/([a-z-]+):\s*color-mix\(/);
  if (m && !new RegExp('\\b' + m[1] + ':\\s*(?!color-mix)[^;]+;\\s*' + m[1] + ':\\s*color-mix').test(line)) {
    problems.push('css/styles.css:' + (i + 1) + ': color-mix() (Safari 16.2, Firefox 113) needs a plain ' + m[1] + ' value before it');
  }
});

// 4. version consistency
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const core = (fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8').match(/NC\.version = '([^']+)'/) || [])[1];
const log = (fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').match(/^## \[(\d+\.\d+\.\d+)\]/m) || [])[1];
if (!(pkg === core && core === log)) problems.push('version mismatch: package.json ' + pkg + ', js/core.js ' + core + ', CHANGELOG.md ' + log);

if (problems.length) {
  console.error('Lint found ' + problems.length + ' problem(s):\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('Lint OK: ' + files.length + ' JS files parse, index.html references resolve, no debug leftovers, no features newer than Safari 15.4 / Firefox 115, version ' + pkg + ' consistent.');
